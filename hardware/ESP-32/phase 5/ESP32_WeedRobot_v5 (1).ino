/*
 ESP32_WeedRobot_v5.ino

 Phase 5 update (v5) -- fixes and hardening on top of v4:

   1. FIX: turnLeft()/turnRight() were grouping motors by front/rear
      axle instead of left/right side, so front and rear wheels on
      the same side fought each other during every turn. Now grouped
      correctly by side, matching the confirmed v1.4 wiring table:
        Front-Left  (M1) = IN1/IN2 = D13/D14, shares ENA D12 w/ M2
        Front-Right (M2) = IN3/IN4 = D27/D26, shares ENA D12 w/ M1
        Rear-Left   (M3) = IN1B/IN2B = D32/D33, shares ENA D25 w/ M4
        Rear-Right  (M4) = IN3B/IN4B = D15/D2,  shares ENA D25 w/ M3

   2. ADDED: shared-key auth on every command endpoint (/move, /stop,
      /speed, /cutter, /mode). Callers must send the key either as
      header "X-API-Key: <key>" or query param "?key=<key>". /status
      and /ping stay open (read-only, no actuation) so the dashboard
      can poll without needing the key wired in everywhere.
      >>> CHANGE API_KEY BELOW BEFORE FIELD USE. <<<

   3. ADDED: CORS headers (Access-Control-Allow-Origin, etc.) plus an
      OPTIONS preflight handler on every route, so a browser-based
      dashboard can call this ESP32 directly even if served from a
      different origin. If your frontend already proxies robot calls
      through the Node backend (routes/robot.js), this is harmless
      but unnecessary -- CORS only matters for direct browser fetch()
      calls to the ESP32's own IP.

   4. ADDED: separate, shorter watchdog for the cutter than for the
      drive motors. Drive motors still get WATCHDOG_TIMEOUT_MS (2s).
      The cutter now gets its own CUTTER_WATCHDOG_TIMEOUT_MS (800ms)
      so a stalled vision loop can't leave the blade spinning blind
      for as long as it can leave the robot merely rolling forward.

 Everything else (obstacle avoidance, /mode as a bookkeeping flag,
 REST endpoint shapes) is unchanged from v4. Note /mode still does
 NOT gate which source (dashboard vs vision script) is allowed to
 send commands -- that's a separate design decision, not fixed here.

 Pin Mapping (matches confirmed v1.4 wiring diagram)
 L298N #1 (Front-Left / Front-Right)
   ENA1=12  IN1=13  IN2=14  IN3=27  IN4=26
 L298N #2 (Rear-Left / Rear-Right)
   ENA2=25  IN1B=32 IN2B=33 IN3B=15 IN4B=2
 Relay (cutter) = 23
 HC-SR04  TRIG=5  ECHO=18

 NOTE: WiFi credentials and API_KEY are hardcoded for development
 convenience. Swap to WiFiManager / a secrets header before
 publishing this repo.
*/

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

const char* ssid     = "rcb";
const char* password = "987654321";

// >>> CHANGE THIS before field use. Share it only with the dashboard
// backend and the YOLOv8 laptop script. <<<
const char* API_KEY = "change-me-before-field-use";

#define ENA1 12
#define IN1  13
#define IN2  14
#define IN3  27
#define IN4  26

#define ENA2 25
#define IN1B 32
#define IN2B 33
#define IN3B 15
#define IN4B 2

#define RELAY_PIN 23
#define TRIG_PIN  5
#define ECHO_PIN  18

// ---------- PWM (LEDC) config ----------
#define PWM_FREQ      5000
#define PWM_RES_BITS  8
#define PWM_MAX       255

// ---------- Obstacle avoidance tuning ----------
#define OBSTACLE_THRESHOLD_CM   20
#define REVERSE_MS              600
#define TURN_MS                 500
#define SENSOR_POLL_MS          150
#define SENSOR_TIMEOUT_US       30000

// ---------- Command watchdogs ----------
// Drive motors: if no /move, /speed, or /stop call arrives within
// this window, force a stop. Vision-loop frame rate + HTTP round
// trip is usually well under 1s, so 2s gives margin without being
// twitchy. Tune once you see real round-trip latency from the laptop.
#define WATCHDOG_TIMEOUT_MS         2000

// Cutter: shorter window than drive, since a stalled blade over a
// weed for an extra second or two is a worse failure mode than the
// robot coasting an extra second.
#define CUTTER_WATCHDOG_TIMEOUT_MS  800

int currentSpeed = 180;
String currentDir = "stop";
bool cutterOn = false;
float lastDistanceCm = -1;

String currentMode = "manual";   // "manual" or "auto" -- reporting only
unsigned long lastCommandMs = 0;       // updated on /move, /speed, /stop
unsigned long lastCutterCommandMs = 0; // updated on /cutter (on) only
bool watchdogTripped = false;        // drive watchdog
bool cutterWatchdogTripped = false;  // cutter watchdog

enum AvoidState { AV_IDLE, AV_REVERSING, AV_TURNING };
AvoidState avoidState = AV_IDLE;
unsigned long avoidStateStartMs = 0;
unsigned long lastSensorPollMs = 0;

WebServer server(80);

// ---------------- Auth + CORS helpers ----------------
void setCorsHeaders(){
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
}

// Returns true if authorized. Sends a 401 and returns false otherwise.
// Checks header "X-API-Key" first, then query param "key".
bool requireAuth(){
  setCorsHeaders();
  String provided = server.header("X-API-Key");
  if (provided.length() == 0 && server.hasArg("key")){
    provided = server.arg("key");
  }
  if (provided == API_KEY){
    return true;
  }
  server.send(401, "application/json", "{\"error\":\"missing or invalid API key\"}");
  return false;
}

// ---------------- Motor helpers ----------------
void applySpeed(){
  ledcWrite(ENA1, currentSpeed);
  ledcWrite(ENA2, currentSpeed);
}

void stopMotors(){
  digitalWrite(IN1,LOW);  digitalWrite(IN2,LOW);
  digitalWrite(IN3,LOW);  digitalWrite(IN4,LOW);
  digitalWrite(IN1B,LOW); digitalWrite(IN2B,LOW);
  digitalWrite(IN3B,LOW); digitalWrite(IN4B,LOW);
  ledcWrite(ENA1, 0);
  ledcWrite(ENA2, 0);
}

void driveForward(){
  digitalWrite(IN1,HIGH); digitalWrite(IN2,LOW);
  digitalWrite(IN3,HIGH); digitalWrite(IN4,LOW);
  digitalWrite(IN1B,HIGH); digitalWrite(IN2B,LOW);
  digitalWrite(IN3B,HIGH); digitalWrite(IN4B,LOW);
  applySpeed();
}

void driveBackward(){
  digitalWrite(IN1,LOW);  digitalWrite(IN2,HIGH);
  digitalWrite(IN3,LOW);  digitalWrite(IN4,HIGH);
  digitalWrite(IN1B,LOW); digitalWrite(IN2B,HIGH);
  digitalWrite(IN3B,LOW); digitalWrite(IN4B,HIGH);
  applySpeed();
}

// FIXED: grouped by LEFT side (M1 front-left + M3 rear-left) vs
// RIGHT side (M2 front-right + M4 rear-right), instead of the old
// front-axle-vs-rear-axle grouping. Left side reverses, right side
// drives forward -> clean pivot turn to the left.
void turnLeft(){
  // Left side (M1, M3): backward
  digitalWrite(IN1,LOW);   digitalWrite(IN2,HIGH);   // M1 front-left
  digitalWrite(IN1B,LOW);  digitalWrite(IN2B,HIGH);  // M3 rear-left
  // Right side (M2, M4): forward
  digitalWrite(IN3,HIGH);  digitalWrite(IN4,LOW);    // M2 front-right
  digitalWrite(IN3B,HIGH); digitalWrite(IN4B,LOW);   // M4 rear-right
  applySpeed();
}

void turnRight(){
  // Left side (M1, M3): forward
  digitalWrite(IN1,HIGH);  digitalWrite(IN2,LOW);    // M1 front-left
  digitalWrite(IN1B,HIGH); digitalWrite(IN2B,LOW);   // M3 rear-left
  // Right side (M2, M4): backward
  digitalWrite(IN3,LOW);   digitalWrite(IN4,HIGH);   // M2 front-right
  digitalWrite(IN3B,LOW);  digitalWrite(IN4B,HIGH);  // M4 rear-right
  applySpeed();
}

void setCutter(bool on){
  cutterOn = on;
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  if (on){
    lastCutterCommandMs = millis();
    cutterWatchdogTripped = false;
  }
}

void noteCommandReceived(){
  lastCommandMs = millis();
  watchdogTripped = false;
}

// ---------------- Ultrasonic ----------------
float readDistanceCm(){
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, SENSOR_TIMEOUT_US);
  if (duration == 0) return -1;
  return duration / 58.0;
}

// ---------------- Obstacle avoidance ----------------
void updateObstacleAvoidance(){
  unsigned long now = millis();

  if (avoidState == AV_IDLE && now - lastSensorPollMs >= SENSOR_POLL_MS){
    lastSensorPollMs = now;
    lastDistanceCm = readDistanceCm();

    bool tooClose = (lastDistanceCm > 0 && lastDistanceCm < OBSTACLE_THRESHOLD_CM);
    if (tooClose && currentDir == "forward"){
      avoidState = AV_REVERSING;
      avoidStateStartMs = now;
      driveBackward();
    }
  }

  switch (avoidState){
    case AV_IDLE:
      break;

    case AV_REVERSING:
      if (now - avoidStateStartMs >= REVERSE_MS){
        avoidState = AV_TURNING;
        avoidStateStartMs = now;
        turnRight();
      }
      break;

    case AV_TURNING:
      if (now - avoidStateStartMs >= TURN_MS){
        avoidState = AV_IDLE;
        if (currentDir == "forward") driveForward();
        else if (currentDir == "backward") driveBackward();
        else if (currentDir == "left") turnLeft();
        else if (currentDir == "right") turnRight();
        else stopMotors();
      }
      break;
  }
}

// ---------------- Command watchdogs ----------------
// Drive watchdog: runs every loop(). If we're actively driving and
// haven't heard a command in WATCHDOG_TIMEOUT_MS, force a safe stop.
void updateWatchdog(){
  if (currentDir == "stop") return; // nothing active, nothing to guard

  unsigned long now = millis();
  if (now - lastCommandMs >= WATCHDOG_TIMEOUT_MS){
    if (!watchdogTripped){
      Serial.println("Drive watchdog: no command received, forcing stop.");
      watchdogTripped = true;
    }
    currentDir = "stop";
    avoidState = AV_IDLE;
    stopMotors();
  }
}

// Cutter watchdog: separate, shorter window. If the cutter is on and
// hasn't received a refreshing /cutter?state=on call within
// CUTTER_WATCHDOG_TIMEOUT_MS, force it off.
void updateCutterWatchdog(){
  if (!cutterOn) return;

  unsigned long now = millis();
  if (now - lastCutterCommandMs >= CUTTER_WATCHDOG_TIMEOUT_MS){
    if (!cutterWatchdogTripped){
      Serial.println("Cutter watchdog: no refresh received, forcing cutter off.");
      cutterWatchdogTripped = true;
    }
    setCutter(false);
  }
}

// ---------------- Setup ----------------
void connectWiFi(){
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");

  unsigned long start = millis();
  const unsigned long WIFI_TIMEOUT_MS = 15000;

  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS){
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED){
    Serial.println();
    Serial.print("Connected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connect failed, restarting...");
    delay(1000);
    ESP.restart();
  }
}

void setup(){
  Serial.begin(115200);
  pinMode(IN1,OUTPUT);  pinMode(IN2,OUTPUT);
  pinMode(IN3,OUTPUT);  pinMode(IN4,OUTPUT);
  pinMode(IN1B,OUTPUT); pinMode(IN2B,OUTPUT);
  pinMode(IN3B,OUTPUT); pinMode(IN4B,OUTPUT);
  pinMode(RELAY_PIN,OUTPUT);
  pinMode(TRIG_PIN,OUTPUT);
  pinMode(ECHO_PIN,INPUT);

  ledcAttach(ENA1, PWM_FREQ, PWM_RES_BITS);
  ledcAttach(ENA2, PWM_FREQ, PWM_RES_BITS);

  stopMotors();
  setCutter(false);
  lastCommandMs = millis();

  connectWiFi();

  // Required so server.header("X-API-Key") actually returns a value --
  // without this, the WebServer library silently drops custom headers
  // and requireAuth() would reject every header-based request.
  const char* headerKeys[] = { "X-API-Key" };
  server.collectHeaders(headerKeys, 1);

  server.on("/ping", HTTP_GET, [](){
    setCorsHeaders();
    server.send(200, "text/plain", "OK");
  });

  server.on("/status", HTTP_GET, [](){
    setCorsHeaders();
    StaticJsonDocument<256> d;
    d["ip"] = WiFi.localIP().toString();
    d["mode"] = currentMode;
    d["speed"] = currentSpeed;
    d["dir"] = currentDir;
    d["cutter"] = cutterOn;
    d["distance_cm"] = lastDistanceCm;
    d["avoiding"] = (avoidState != AV_IDLE);
    d["watchdog_tripped"] = watchdogTripped;
    d["cutter_watchdog_tripped"] = cutterWatchdogTripped;
    String s;
    serializeJson(d, s);
    server.send(200, "application/json", s);
  });

  // GET /mode?state=manual|auto  -- bookkeeping only, doesn't gate commands
  server.on("/mode", HTTP_GET, [](){
    if (!requireAuth()) return;
    if (server.hasArg("state")){
      String state = server.arg("state");
      if (state == "manual" || state == "auto"){
        currentMode = state;
        server.send(200, "application/json", "{\"mode\":\"" + currentMode + "\"}");
      } else {
        server.send(400, "text/plain", "state must be 'manual' or 'auto'");
      }
    } else {
      server.send(400, "text/plain", "missing 'state' arg (manual|auto)");
    }
  });

  server.on("/speed", HTTP_GET, [](){
    if (!requireAuth()) return;
    if (server.hasArg("value")){
      int v = server.arg("value").toInt();
      v = constrain(v, 0, PWM_MAX);
      currentSpeed = v;
      applySpeed();
      noteCommandReceived();
      server.send(200, "application/json", "{\"speed\":" + String(currentSpeed) + "}");
    } else {
      server.send(400, "text/plain", "missing 'value' arg (0-255)");
    }
  });

  server.on("/move", HTTP_GET, [](){
    if (!requireAuth()) return;
    if (server.hasArg("speed")){
      int v = server.arg("speed").toInt();
      currentSpeed = constrain(v, 0, PWM_MAX);
    }
    String dir = server.hasArg("dir") ? server.arg("dir") : "stop";
    currentDir = dir;
    avoidState = AV_IDLE; // new command cancels any in-progress avoidance
    noteCommandReceived();

    if (dir == "forward") driveForward();
    else if (dir == "backward") driveBackward();
    else if (dir == "left") turnLeft();
    else if (dir == "right") turnRight();
    else { dir = "stop"; currentDir = "stop"; stopMotors(); }

    server.send(200, "application/json",
      "{\"dir\":\"" + dir + "\",\"speed\":" + String(currentSpeed) + "}");
  });

  server.on("/stop", HTTP_GET, [](){
    if (!requireAuth()) return;
    currentDir = "stop";
    avoidState = AV_IDLE;
    stopMotors();
    setCutter(false);
    noteCommandReceived();
    server.send(200, "application/json", "{\"dir\":\"stop\",\"cutter\":false}");
  });

  server.on("/cutter", HTTP_GET, [](){
    if (!requireAuth()) return;
    if (server.hasArg("state")){
      String state = server.arg("state");
      if (state == "on") setCutter(true);
      else if (state == "off") setCutter(false);
      else {
        server.send(400, "text/plain", "state must be 'on' or 'off'");
        return;
      }
      noteCommandReceived();
      server.send(200, "application/json", String("{\"cutter\":") + (cutterOn ? "true" : "false") + "}");
    } else {
      server.send(400, "text/plain", "missing 'state' arg (on|off)");
    }
  });

  // Preflight support for browser-based dashboards calling this ESP32
  // directly across origins.
  server.on("/move", HTTP_OPTIONS, [](){ setCorsHeaders(); server.send(204); });
  server.on("/stop", HTTP_OPTIONS, [](){ setCorsHeaders(); server.send(204); });
  server.on("/speed", HTTP_OPTIONS, [](){ setCorsHeaders(); server.send(204); });
  server.on("/cutter", HTTP_OPTIONS, [](){ setCorsHeaders(); server.send(204); });
  server.on("/mode", HTTP_OPTIONS, [](){ setCorsHeaders(); server.send(204); });

  server.begin();
}

void loop(){
  server.handleClient();
  updateObstacleAvoidance();
  updateWatchdog();
  updateCutterWatchdog();
}
