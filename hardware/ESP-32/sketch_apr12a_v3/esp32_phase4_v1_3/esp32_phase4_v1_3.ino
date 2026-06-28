// ============================================================
// IoT Weed Removal Robot — Phase 4 v1.3 ESP32 Firmware
// Member 3 — ESP32 Developer
// Implements Parts 1–4 of the Firmware Upgrade Guide
// No external libraries required
// ============================================================

#include <WiFi.h>
#include <WebServer.h>

// ============================================================
// Wi-Fi CONFIG — update these if network changes
// ============================================================
const char* ssid       = "meowww";
const char* password   = "capital v";
const char* serverBase = "http://192.168.218.135:5000";

WebServer server(80);

// ============================================================
// PIN DEFINITIONS
// ============================================================

// L298N #1 — Front motors (M1 L.Front, M2 R.Front)
// ENA jumper REMOVED — GPIO12 controls speed via PWM
// ENB jumper STAYS ON
#define ENA1  12
#define IN1   13   // M1 L.Front direction A
#define IN2   14   // M1 L.Front direction B
#define IN3   27   // M2 R.Front direction A
#define IN4   26   // M2 R.Front direction B

// L298N #2 — Rear motors (M3 L.Rear, M4 R.Rear)
// ENA jumper REMOVED — GPIO25 controls speed via PWM
// ENB jumper STAYS ON
#define ENA2  25
#define IN1B  32   // M3 L.Rear direction A
#define IN2B  33   // M3 L.Rear direction B
#define IN3B  15   // M4 R.Rear direction A
#define IN4B  2    // M4 R.Rear direction B

// Relay — RS775 Cutter Motor
// HIGH = relay closes = cutter ON
// LOW  = relay open   = cutter OFF
#define RELAY_PIN 23

// HC-SR04 — Obstacle Detection
#define TRIG_PIN  5
#define ECHO_PIN  18

// ============================================================
// TUNABLE CONSTANTS
// ============================================================
#define MOTOR_SPEED        200    // PWM 0-255 (tune if motors too fast/slow)
#define OBSTACLE_CM        25     // Stop if obstacle closer than this (cm)
#define STATUS_INTERVAL    3000   // ms — how often to push status to backend
#define OBSTACLE_INTERVAL  100    // ms — how often to check HC-SR04

// --- Part 1: Autonomous timing constants ---
#define BACKUP_TIME_MS     800    // ms to reverse when obstacle detected
#define TURN_TIME_MS       600    // ms to turn when avoiding obstacle

// ============================================================
// RUNTIME STATE
// ============================================================
String        currentCmd      = "stop";
bool          cutterOn        = false;
bool          obstacleBlocked = false;
unsigned long lastStatus      = 0;
unsigned long lastObstacle    = 0;

// --- Part 1: Autonomous mode globals ---
bool autonomousMode = false;   // false = Manual, true = Autonomous
bool turnLeftNext   = true;    // alternates turn direction for better coverage

// --- Phase 4 Demo: Simulated weed detection ---
// Temporary stand-in for Phase 5 YOLO/camera detection.
// Set demoWeedMode = false to disable without deleting any code.
// Replace checkFakeWeed() trigger with backend YOLO command in Phase 5.
bool          demoWeedMode  = true;
unsigned long lastWeedCheck = 0;
#define WEED_INTERVAL  8000   // ms — how often to look for a fake weed
#define WEED_CUT_MS    3000   // ms — cutter runs for this long per weed

// ============================================================
// MOTOR HELPERS
// ============================================================
void motorsStop() {
  digitalWrite(IN1,  LOW); digitalWrite(IN2,  LOW);
  digitalWrite(IN3,  LOW); digitalWrite(IN4,  LOW);
  digitalWrite(IN1B, LOW); digitalWrite(IN2B, LOW);
  digitalWrite(IN3B, LOW); digitalWrite(IN4B, LOW);
}

// Left side  = IN1/IN2 (L.Front) + IN1B/IN2B (L.Rear)
// Right side = IN3/IN4 (R.Front) + IN3B/IN4B (R.Rear)
void setLeft(bool fwd) {
  digitalWrite(IN1,  fwd ? HIGH : LOW);
  digitalWrite(IN2,  fwd ? LOW  : HIGH);
  digitalWrite(IN1B, fwd ? HIGH : LOW);
  digitalWrite(IN2B, fwd ? LOW  : HIGH);
}

void setRight(bool fwd) {
  digitalWrite(IN3,  fwd ? HIGH : LOW);
  digitalWrite(IN4,  fwd ? LOW  : HIGH);
  digitalWrite(IN3B, fwd ? HIGH : LOW);
  digitalWrite(IN4B, fwd ? LOW  : HIGH);
}

void moveForward()  { setLeft(true);  setRight(true);  }
void moveBackward() { setLeft(false); setRight(false); }
void turnLeft()     { setLeft(false); setRight(true);  }  // pivot left
void turnRight()    { setLeft(true);  setRight(false); }  // pivot right

// ============================================================
// Part 1 + Part 3: applyCommand()
// Manual movement is blocked while autonomous mode is active.
// ============================================================
void applyCommand(String cmd) {
  // Part 3: Block manual movement in autonomous mode
  if (autonomousMode && cmd != "stop") {
    Serial.println("⚠️  Auto mode active — manual movement ignored");
    return;
  }

  // Block forward if obstacle detected
  if (obstacleBlocked && cmd == "forward") {
    Serial.println("⛔ Obstacle blocking — ignoring forward");
    motorsStop();
    return;
  }

  if      (cmd == "forward")  moveForward();
  else if (cmd == "backward") moveBackward();
  else if (cmd == "left")     turnLeft();
  else if (cmd == "right")    turnRight();
  else                        motorsStop();
}

// ============================================================
// CUTTER CONTROL
// ============================================================
void setCutter(bool on) {
  cutterOn = on;
  digitalWrite(RELAY_PIN, on ? HIGH : LOW);
  Serial.println(on ? "🔪 Cutter ON" : "⏹  Cutter OFF");
}

// ============================================================
// HC-SR04 — DISTANCE
// ============================================================
float getDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000);
  if (dur == 0) return 999.0;
  return dur * 0.034 / 2.0;
}

// ============================================================
// Part 1 + Part 3: avoidObstacle()
// Stop → Reverse → Turn (alternating L/R) → Continue forward.
// Part 3: Improved — re-checks distance after backup before turning.
// Part 4: Optional random turns via randomSeed().
// ============================================================
void avoidObstacle() {
  Serial.println("🚧 OBSTACLE DETECTED — Starting avoidance sequence");

  // Step 1: Stop
  motorsStop();
  delay(200);

  // Step 2: Reverse
  Serial.println("⬅️  Reversing...");
  moveBackward();
  delay(BACKUP_TIME_MS);
  motorsStop();
  delay(150);

  // Part 3 safety: re-check distance before turning
  float distAfterBackup = getDistanceCm();
  Serial.printf("   Distance after backup: %.1f cm\n", distAfterBackup);

  // Step 3: Turn (alternating direction for better coverage)
  if (turnLeftNext) {
    Serial.println("↩️  Turning LEFT");
    turnLeft();
  } else {
    Serial.println("↪️  Turning RIGHT");
    turnRight();
  }
  turnLeftNext = !turnLeftNext;   // alternate for next avoidance
  delay(TURN_TIME_MS);
  motorsStop();
  delay(150);

  // Step 4: Mark obstacle cleared — only continue if still in autonomous mode.
  // Fix 3: If someone switched to Manual during avoidance, stop here safely.
  obstacleBlocked = false;
  if (!autonomousMode) {
    Serial.println("⚠️  Mode switched to Manual during avoidance — halting");
    motorsStop();
    currentCmd = "stop";
    return;
  }
  Serial.println("✅ Avoidance done — continuing forward");
  currentCmd = "forward";
  moveForward();
}

// ============================================================
// Phase 4 Demo: checkFakeWeed()
// Simulates weed detection every WEED_INTERVAL ms with a 25% hit rate.
// Only runs in autonomous + demo mode so it never fires during manual use.
//
// --- Phase 5 migration note ---
// When the YOLO camera backend is ready, delete this function entirely
// and handle the "weed_detected" event from the backend instead:
//
//   if (backendSaysWeedDetected) {
//     motorsStop();  currentCmd = "stop";
//     setCutter(true);  delay(WEED_CUT_MS);  setCutter(false);
//     currentCmd = "forward";  moveForward();
//   }
//
// Everything else in the firmware stays unchanged.
// ============================================================
void checkFakeWeed() {
  if (!autonomousMode || !demoWeedMode) return;

  unsigned long now = millis();
  if (now - lastWeedCheck < WEED_INTERVAL) return;
  lastWeedCheck = now;

  // 25% chance of a simulated weed hit
  if (random(100) >= 25) return;

  Serial.println("🌿 Weed Detected! (simulated)");

  // Stop and cut
  motorsStop();
  currentCmd = "stop";
  setCutter(true);
  delay(WEED_CUT_MS);
  setCutter(false);
  Serial.println("✅ Weed Removed");

  // Guard: user may have switched to Manual during the 3-second cut
  if (!autonomousMode) {
    Serial.println("⚠️  Mode switched during cut — staying stopped");
    currentCmd = "stop";
    return;
  }

  // Resume autonomous forward movement
  currentCmd = "forward";
  moveForward();
}

// ============================================================
// Part 2: checkObstacle()
// In autonomous mode calls avoidObstacle(); in manual mode
// it just stops/resumes as before.
// ============================================================
void checkObstacle() {
  float dist = getDistanceCm();

  if (dist < OBSTACLE_CM) {
    if (!obstacleBlocked) {
      obstacleBlocked = true;
      Serial.printf("🚧 OBSTACLE %.1f cm\n", dist);

      if (autonomousMode) {
        avoidObstacle();           // Part 2: autonomous avoidance
      } else {
        motorsStop();              // Manual: just stop
        Serial.println("⛔ AUTO STOP — obstacle in manual mode");
      }
    }
  } else {
    if (obstacleBlocked) {
      obstacleBlocked = false;
      Serial.println("✅ Path clear");
      if (!autonomousMode) {
        // Fix 2: Resume whatever command the user last sent.
        // • "forward" → continues moving  ✔
        // • "stop"    → stays stopped     ✔
        // • "left"/"right" → resumes turn ⚠ intentional — user had a
        //   direction held; change currentCmd to "stop" in handleStop()
        //   if you prefer a clean slate after every obstacle.
        applyCommand(currentCmd);
      }
      // Autonomous mode re-issues forward in loop() via Fix 1 above.
    }
  }
}

// ============================================================
// Part 2: pushStatus()
// Now includes "mode" and "distanceCm" fields.
// ============================================================
void pushStatus() {
  if (WiFi.status() != WL_CONNECTED) return;

  float dist = getDistanceCm();

  WiFiClient client;
  if (!client.connect("192.168.218.135", 5000)) return;

  String modeStr = autonomousMode ? "autonomous" : "manual";

  String body = "{"
              + String("\"command\":\"")  + currentCmd  + "\","
              + "\"cutter\":"    + (cutterOn        ? "true" : "false") + ","
              + "\"obstacle\":"  + (obstacleBlocked ? "true" : "false") + ","
              + "\"mode\":\""    + modeStr + "\","
              + "\"distanceCm\":" + String(dist, 1) + ","
              + "\"connected\":true}";

  client.println("POST /api/esp32/status HTTP/1.1");
  client.println("Host: 192.168.218.135:5000");
  client.println("Content-Type: application/json");
  client.println("Connection: close");
  client.println("Content-Length: " + String(body.length()));
  client.println();
  client.println(body);
  client.stop();
  Serial.println("📤 Status pushed");
}

// ============================================================
// JSON HELPER — extract string value from raw JSON body
// e.g. getValue("{\"command\":\"forward\"}", "command") → "forward"
// ============================================================
String getValue(String json, String key) {
  String search = "\"" + key + "\":\"";
  int start = json.indexOf(search);
  if (start == -1) {
    // Try boolean / number (no quotes)
    search = "\"" + key + "\":";
    start = json.indexOf(search);
    if (start == -1) return "";
    start += search.length();
    int end = json.indexOf(",", start);
    if (end == -1) end = json.indexOf("}", start);
    return json.substring(start, end);
  }
  start += search.length();
  int end = json.indexOf("\"", start);
  return json.substring(start, end);
}

// ============================================================
// REST HANDLERS
// ============================================================

// POST /move   body: {"command":"forward"}
// Part 3: Rejects movement commands if in autonomous mode.
void handleMove() {
  String body = server.arg("plain");
  String cmd  = getValue(body, "command");
  cmd.toLowerCase();
  cmd.trim();

  if (cmd.length() == 0) {
    server.send(400, "application/json", "{\"error\":\"missing command\"}");
    return;
  }

  // Part 3: Reject if autonomous
  if (autonomousMode) {
    server.send(409, "application/json",
      "{\"error\":\"switch to manual mode first\",\"mode\":\"autonomous\"}");
    Serial.println("⚠️  /move rejected — autonomous mode active");
    return;
  }

  currentCmd = cmd;
  applyCommand(cmd);

  Serial.println("🕹  CMD: " + cmd);
  server.send(200, "application/json",
    "{\"success\":true,\"command\":\"" + cmd + "\"}");
}

// POST /stop   (no body needed)
// Part 3: Works in both modes — always honoured as an emergency stop.
void handleStop() {
  currentCmd = "stop";
  motorsStop();

  // Part 3: Also exit autonomous mode for safety
  if (autonomousMode) {
    autonomousMode = false;
    Serial.println("🛑 EMERGENCY STOP — switched to Manual");
  } else {
    Serial.println("🛑 STOP");
  }

  server.send(200, "application/json",
    "{\"success\":true,\"command\":\"stop\","
    "\"mode\":\"manual\"}");
}

// POST /cutter   body: {"on":true} or {"on":false}
void handleCutter() {
  String body = server.arg("plain");
  String val  = getValue(body, "on");
  val.trim();
  bool on = (val == "true");
  setCutter(on);
  server.send(200, "application/json",
    "{\"success\":true,\"cutter\":" + String(on ? "true" : "false") + "}");
}

// POST /mode   body: {"mode":"autonomous"} or {"mode":"manual"}
// Part 2 + Part 4: Switch between Manual and Autonomous modes.
void handleMode() {
  String body    = server.arg("plain");
  String modeVal = getValue(body, "mode");
  modeVal.toLowerCase();
  modeVal.trim();

  if (modeVal == "autonomous") {
    autonomousMode = true;
    currentCmd     = "forward";   // start moving immediately
    moveForward();
    Serial.println("🤖 MODE → AUTONOMOUS");
    server.send(200, "application/json",
      "{\"success\":true,\"mode\":\"autonomous\"}");

  } else if (modeVal == "manual") {
    autonomousMode = false;
    currentCmd     = "stop";
    motorsStop();
    Serial.println("🕹  MODE → MANUAL");
    server.send(200, "application/json",
      "{\"success\":true,\"mode\":\"manual\"}");

  } else {
    server.send(400, "application/json",
      "{\"error\":\"mode must be 'manual' or 'autonomous'\"}");
  }
}

// GET /status   — returns live robot state
// Fix 4: JSON field order matches the agreed spec:
//   { "mode", "command", "distanceCm", "obstacle", "cutter", "connected" }
void handleStatus() {
  float dist     = getDistanceCm();
  String modeStr = autonomousMode ? "autonomous" : "manual";

  String res = "{"
             + String("\"mode\":\"")    + modeStr    + "\","
             + "\"command\":\""         + currentCmd + "\","
             + "\"distanceCm\":"        + String(dist, 1) + ","
             + "\"obstacle\":"          + (obstacleBlocked ? "true" : "false") + ","
             + "\"cutter\":"            + (cutterOn        ? "true" : "false") + ","
             + "\"connected\":true}";

  server.send(200, "application/json", res);
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n🚀 Booting Phase 4 v1.3 Firmware...");

  // Part 4: Seed RNG for optional random turn selection
  randomSeed(analogRead(0));

  // Motor pins
  int motorPins[] = {ENA1, IN1, IN2, IN3, IN4,
                     ENA2, IN1B, IN2B, IN3B, IN4B};
  for (int p : motorPins) pinMode(p, OUTPUT);

  // Speed via PWM
  analogWrite(ENA1, MOTOR_SPEED);
  analogWrite(ENA2, MOTOR_SPEED);

  // Part 4: Safe startup — always begin in Manual mode, motors off
  autonomousMode = false;
  currentCmd     = "stop";
  motorsStop();
  Serial.println("🕹  Safe startup: Manual mode, motors stopped");

  // Relay
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);   // cutter OFF on boot

  // HC-SR04
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi Connected!");
    Serial.print("📡 ESP32 IP: ");
    Serial.println(WiFi.localIP());
    Serial.println("👆 Give this IP to Member 1 for backend config");
  } else {
    Serial.println("\n❌ Wi-Fi failed — running offline");
  }

  // Register routes
  server.on("/move",   HTTP_POST, handleMove);
  server.on("/stop",   HTTP_POST, handleStop);
  server.on("/cutter", HTTP_POST, handleCutter);
  server.on("/mode",   HTTP_POST, handleMode);   // Part 2: new endpoint
  server.on("/status", HTTP_GET,  handleStatus);
  server.begin();

  Serial.println("🌐 ESP32 web server started on port 80");
  Serial.println("✅ Phase 4 v1.3 Firmware ready!\n");
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  server.handleClient();

  unsigned long now = millis();

  // Obstacle check every 100 ms
  if (now - lastObstacle >= OBSTACLE_INTERVAL) {
    lastObstacle = now;
    checkObstacle();
    checkFakeWeed();   // Phase 4 demo: simulated weed detection
  }

  // Part 2: Keep robot moving forward in autonomous mode.
  // Fix 1: Only issue the command when state actually changes,
  //         not on every loop iteration.
  if (autonomousMode && !obstacleBlocked && currentCmd != "forward") {
    currentCmd = "forward";
    moveForward();
  }

  // Push status to backend every 3 s
  if (now - lastStatus >= STATUS_INTERVAL) {
    lastStatus = now;
    pushStatus();
  }
}
