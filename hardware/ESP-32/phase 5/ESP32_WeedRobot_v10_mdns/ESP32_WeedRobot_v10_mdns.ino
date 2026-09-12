/*
  ESP32_WeedRobot_v7_GPS.ino

  Existing v7 robot firmware + NEO-6M GPS

  FEATURES
  ------------------------------------------
  - 4WD motor control
  - L298N x2
  - PWM speed control
  - HC-SR04 obstacle avoidance
  - Cutter relay
  - Cutter safety interlock
  - Drive watchdog
  - Cutter watchdog
  - API-key authentication
  - CORS support
  - Robot control REST API
  - NEO-6M GPS
  - GPS REST API
  - GPS data included in /status

  EXISTING PIN MAPPING
  ------------------------------------------

  L298N #1
    ENA1 = 12
    IN1  = 13
    IN2  = 14
    IN3  = 27
    IN4  = 26

  L298N #2
    ENA2 = 25
    IN1B = 32
    IN2B = 33
    IN3B = 15
    IN4B = 2

  Relay
    RELAY_PIN = 23

  HC-SR04
    TRIG = 5
    ECHO = 18

  NEO-6M GPS
    GPS TX -> ESP32 GPIO 16
    GPS RX -> ESP32 GPIO 17
*/


// ============================================================
// LIBRARIES
// ============================================================

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include <ESPmDNS.h>


// ============================================================
// WIFI
// ============================================================

const char* ssid     = "meowww";
const char* password = "capital v";

// Advertised as http://weedguard-robot.local on whatever network
// this board joins — no IP to hardcode, works across hotspots.
const char* HOSTNAME = "weedguard-robot";

 
// ============================================================
// API KEY
// Must match ESP32_API_KEY in backend .env
// ============================================================

const char* API_KEY = "weedguard2026robot";


// ============================================================
// MOTOR PINS
// ============================================================

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


// ============================================================
// RELAY
// ============================================================

#define RELAY_PIN 23

// Relay module logic
// true  = ACTIVE-LOW relay (LOW = ON, HIGH = OFF)
// false = ACTIVE-HIGH relay (HIGH = ON, LOW = OFF)
#define RELAY_ACTIVE_LOW false


// ============================================================
// ULTRASONIC
// ============================================================

#define TRIG_PIN 5
#define ECHO_PIN 18


// ============================================================
// NEO-6M GPS
// ============================================================

#define GPS_RX_PIN 16
#define GPS_TX_PIN 17

TinyGPSPlus gps;

HardwareSerial GPSSerial(2);


// ============================================================
// GPS STATE
// ============================================================

bool gpsFix = false;

double gpsLatitude = 0.0;
double gpsLongitude = 0.0;
double gpsAltitude = 0.0;

uint32_t gpsSatellites = 0;

double gpsHDOP = 0.0;

unsigned long gpsLastValidMs = 0;

const unsigned long GPS_FIX_TIMEOUT_MS = 5000;


// ============================================================
// PWM
// ============================================================

#define PWM_FREQ      5000
#define PWM_RES_BITS  8
#define PWM_MAX       255


// ============================================================
// OBSTACLE AVOIDANCE
// ============================================================

#define OBSTACLE_THRESHOLD_CM 20

#define REVERSE_MS 600
#define TURN_MS    500

#define SENSOR_POLL_MS 150
#define SENSOR_TIMEOUT_US 30000


// ============================================================
// WATCHDOGS
// ============================================================

#define WATCHDOG_TIMEOUT_MS 2000

#define CUTTER_WATCHDOG_TIMEOUT_MS 800

// ============================================================
// AUTONOMOUS GPS NAVIGATION
// ============================================================
#define MAX_AUTONOMOUS_WAYPOINTS 64
#define AUTONOMOUS_WAYPOINT_RADIUS_M 2.5
#define AUTONOMOUS_UPDATE_MS 500
#define AUTONOMOUS_TURN_MS 350
#define AUTONOMOUS_MIN_COURSE_SPEED_KMPH 2.0

// ============================================================
// WEED-CUT INTEGRATION (laptop YOLO -> ESP32)
// Camera -> laptop (YOLO detect) -> POST /weed-detected -> ESP32
// ============================================================
#define WEED_CUT_DEFAULT_MS 3000
#define WEED_CUT_MAX_MS     15000


// ============================================================
// ROBOT STATE
// ============================================================

int currentSpeed = 180;

String currentDir = "stop";

bool cutterOn = false;

float lastDistanceCm = -1;

String currentMode = "manual";

struct AutoWaypoint {
  double lat;
  double lng;
};

AutoWaypoint autoWaypoints[MAX_AUTONOMOUS_WAYPOINTS];
uint8_t autoWaypointCount = 0;
uint8_t autoWaypointIndex = 0;
bool autonomousRunning = false;
bool autonomousFinished = false;
unsigned long lastAutonomousUpdateMs = 0;
unsigned long autonomousTurnUntilMs = 0;
float autonomousTargetDistanceM = -1;

// ------------------------------------------------------------
// Weed-cut state (independent of manual/autonomous mode).
// Set by POST /weed-detected when the laptop's YOLO pipeline
// confirms a weed. Pauses whatever the robot was doing, runs
// the cutter for a fixed duration, then auto-resumes.
// ------------------------------------------------------------
enum WeedCutState { WC_IDLE, WC_CUTTING };
WeedCutState weedCutState = WC_IDLE;
unsigned long weedCutStartMs = 0;
unsigned long weedCutDurationMs = 0;
bool resumeAutonomousAfterCut = false;

// Forward declaration used by the autonomous plan helpers.
void stopMotors();
void setCutter(bool on);


// ============================================================
// GPS NAVIGATION HELPERS
// ============================================================

double degToRad(double deg) {
  return deg * PI / 180.0;
}

double radToDeg(double rad) {
  return rad * 180.0 / PI;
}

double gpsDistanceM(double lat1, double lng1, double lat2, double lng2) {
  const double R = 6371000.0;
  const double dLat = degToRad(lat2 - lat1);
  const double dLng = degToRad(lng2 - lng1);
  const double a =
    sin(dLat / 2.0) * sin(dLat / 2.0) +
    cos(degToRad(lat1)) * cos(degToRad(lat2)) *
    sin(dLng / 2.0) * sin(dLng / 2.0);

  return R * 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
}

double gpsBearingDeg(double lat1, double lng1, double lat2, double lng2) {
  const double phi1 = degToRad(lat1);
  const double phi2 = degToRad(lat2);
  const double dLng = degToRad(lng2 - lng1);

  const double y = sin(dLng) * cos(phi2);
  const double x =
    cos(phi1) * sin(phi2) -
    sin(phi1) * cos(phi2) * cos(dLng);

  double bearing = radToDeg(atan2(y, x));
  if (bearing < 0) bearing += 360.0;
  return bearing;
}

double normalizeHeadingError(double error) {
  while (error > 180.0) error -= 360.0;
  while (error < -180.0) error += 360.0;
  return error;
}

void clearAutonomousPlan() {
  autoWaypointCount = 0;
  autoWaypointIndex = 0;
  autonomousRunning = false;
  autonomousFinished = false;
  autonomousTargetDistanceM = -1;
  autonomousTurnUntilMs = 0;
}

void stopAutonomous() {
  autonomousRunning = false;
  autonomousFinished = false;
  autonomousTurnUntilMs = 0;
  autonomousTargetDistanceM = -1;
  autoWaypointIndex = 0;
  currentDir = "stop";
  stopMotors();

  // A hard stop always overrides an in-progress weed cut too.
  weedCutState = WC_IDLE;
  resumeAutonomousAfterCut = false;
  setCutter(false);
}

// ============================================================
// COMMAND TIMERS
// ============================================================

unsigned long lastCommandMs = 0;

unsigned long lastCutterCommandMs = 0;

bool watchdogTripped = false;

bool cutterWatchdogTripped = false;


// ============================================================
// OBSTACLE STATE
// ============================================================

enum AvoidState {
  AV_IDLE,
  AV_REVERSING,
  AV_TURNING
};

AvoidState avoidState = AV_IDLE;

unsigned long avoidStateStartMs = 0;

unsigned long lastSensorPollMs = 0;


// ============================================================
// WEB SERVER
// ============================================================

WebServer server(80);


// ============================================================
// CORS
// ============================================================

void setCorsHeaders() {

  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  server.sendHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  server.sendHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-API-Key"
  );
}


// ============================================================
// API AUTHENTICATION
// ============================================================

bool requireAuth() {

  setCorsHeaders();

  String provided =
    server.header("X-API-Key");

  if (
    provided.length() == 0 &&
    server.hasArg("key")
  ) {

    provided =
      server.arg("key");
  }

  if (
    provided == API_KEY
  ) {

    return true;
  }

  server.send(
    401,
    "application/json",
    "{\"error\":\"missing or invalid API key\"}"
  );

  return false;
}


// ============================================================
// MOTOR SPEED
// ============================================================

void applySpeed() {

  ledcWrite(
    ENA1,
    currentSpeed
  );

  ledcWrite(
    ENA2,
    currentSpeed
  );
}


// ============================================================
// STOP MOTORS
// ============================================================

void stopMotors() {

  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);

  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);

  digitalWrite(IN1B, LOW);
  digitalWrite(IN2B, LOW);

  digitalWrite(IN3B, LOW);
  digitalWrite(IN4B, LOW);

  ledcWrite(
    ENA1,
    0
  );

  ledcWrite(
    ENA2,
    0
  );
}


// ============================================================
// FORWARD
// ============================================================

void driveForward() {

  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);

  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);

  digitalWrite(IN1B, HIGH);
  digitalWrite(IN2B, LOW);

  digitalWrite(IN3B, HIGH);
  digitalWrite(IN4B, LOW);

  applySpeed();
}


// ============================================================
// BACKWARD
// ============================================================

void driveBackward() {

  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);

  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);

  digitalWrite(IN1B, LOW);
  digitalWrite(IN2B, HIGH);

  digitalWrite(IN3B, LOW);
  digitalWrite(IN4B, HIGH);

  applySpeed();
}


// ============================================================
// TURN LEFT
// ============================================================

void turnLeft() {

  // Left side backward
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);

  digitalWrite(IN1B, LOW);
  digitalWrite(IN2B, HIGH);

  // Right side forward
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);

  digitalWrite(IN3B, HIGH);
  digitalWrite(IN4B, LOW);

  applySpeed();
}


// ============================================================
// TURN RIGHT
// ============================================================

void turnRight() {

  // Left side forward
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);

  digitalWrite(IN1B, HIGH);
  digitalWrite(IN2B, LOW);

  // Right side backward
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);

  digitalWrite(IN3B, LOW);
  digitalWrite(IN4B, HIGH);

  applySpeed();
}


// ============================================================
// CUTTER
// ============================================================

void setCutter(bool on) {

  cutterOn = on;

  if (RELAY_ACTIVE_LOW) {
    digitalWrite(
      RELAY_PIN,
      on ? LOW : HIGH
    );
  } else {
    digitalWrite(
      RELAY_PIN,
      on ? HIGH : LOW
    );
  }

  if (on) {
    lastCutterCommandMs = millis();
    cutterWatchdogTripped = false;
  }
}


// ============================================================
// COMMAND TIMER
// ============================================================

void noteCommandReceived() {

  lastCommandMs =
    millis();

  watchdogTripped =
    false;
}


// ============================================================
// ULTRASONIC DISTANCE
// ============================================================

float readDistanceCm() {

  digitalWrite(
    TRIG_PIN,
    LOW
  );

  delayMicroseconds(2);

  digitalWrite(
    TRIG_PIN,
    HIGH
  );

  delayMicroseconds(10);

  digitalWrite(
    TRIG_PIN,
    LOW
  );

  long duration =
    pulseIn(
      ECHO_PIN,
      HIGH,
      SENSOR_TIMEOUT_US
    );

  if (
    duration == 0
  ) {

    return -1;
  }

  return duration / 58.0;
}


// ============================================================
// OBSTACLE AVOIDANCE
// ============================================================

void updateObstacleAvoidance() {

  unsigned long now =
    millis();


  if (
    avoidState == AV_IDLE &&
    now - lastSensorPollMs >= SENSOR_POLL_MS
  ) {

    lastSensorPollMs =
      now;

    lastDistanceCm =
      readDistanceCm();


    bool tooClose =
      (
        lastDistanceCm > 0 &&
        lastDistanceCm <
        OBSTACLE_THRESHOLD_CM
      );


    if (
      tooClose &&
      currentDir == "forward"
    ) {

      avoidState =
        AV_REVERSING;

      avoidStateStartMs =
        now;

      driveBackward();
    }
  }


  switch (
    avoidState
  ) {

    case AV_IDLE:

      break;


    case AV_REVERSING:

      if (
        now - avoidStateStartMs >=
        REVERSE_MS
      ) {

        avoidState =
          AV_TURNING;

        avoidStateStartMs =
          now;

        turnRight();
      }

      break;


    case AV_TURNING:

      if (
        now - avoidStateStartMs >=
        TURN_MS
      ) {

        avoidState =
          AV_IDLE;


        if (
          currentDir == "forward"
        ) {

          driveForward();

        } else if (
          currentDir == "backward"
        ) {

          driveBackward();

        } else if (
          currentDir == "left"
        ) {

          turnLeft();

        } else if (
          currentDir == "right"
        ) {

          turnRight();

        } else {

          stopMotors();
        }
      }

      break;
  }
}


// ============================================================
// AUTONOMOUS GPS NAVIGATION
// ============================================================
// The backend sends a lawn-mower waypoint plan generated from the
// calibrated field. The ESP32 follows the plan using NEO-6M GPS.
// GPS course is used only after the robot is moving; NEO-6M cannot
// provide a reliable heading while stationary.
// ============================================================

void updateAutonomousNavigation() {

  if (!autonomousRunning || currentMode != "autonomous") {
    return;
  }

  // Paused while the weed-cut sequence is running; updateWeedCut()
  // clears weedCutState back to WC_IDLE when the timer finishes,
  // and this function naturally picks the path back up next cycle.
  if (weedCutState != WC_IDLE) {
    return;
  }

  unsigned long now = millis();

  if (avoidState != AV_IDLE) {
    return;
  }

  if (now - lastAutonomousUpdateMs < AUTONOMOUS_UPDATE_MS) {
    return;
  }

  lastAutonomousUpdateMs = now;

  if (autoWaypointIndex >= autoWaypointCount) {
    autonomousRunning = false;
    autonomousFinished = true;
    autonomousTargetDistanceM = 0;
    currentDir = "stop";
    stopMotors();
    Serial.println("Autonomous: field path complete.");
    return;
  }

  if (!gpsFix) {
    currentDir = "stop";
    stopMotors();
    return;
  }

  const AutoWaypoint &target = autoWaypoints[autoWaypointIndex];

  autonomousTargetDistanceM =
    gpsDistanceM(
      gpsLatitude,
      gpsLongitude,
      target.lat,
      target.lng
    );

  if (autonomousTargetDistanceM <= AUTONOMOUS_WAYPOINT_RADIUS_M) {

    Serial.print("Autonomous: reached waypoint ");
    Serial.println(autoWaypointIndex + 1);

    autoWaypointIndex++;

    if (autoWaypointIndex >= autoWaypointCount) {
      autonomousRunning = false;
      autonomousFinished = true;
      autonomousTargetDistanceM = 0;
      currentDir = "stop";
      stopMotors();
      Serial.println("Autonomous: field path complete.");
      return;
    }

    return;
  }

  const double targetBearing =
    gpsBearingDeg(
      gpsLatitude,
      gpsLongitude,
      target.lat,
      target.lng
    );

  if (autonomousTurnUntilMs != 0) {
    if (now < autonomousTurnUntilMs) {
      return;
    }
    autonomousTurnUntilMs = 0;
  }

  // NEO-6M heading/course becomes useful only while moving.
  // At startup the robot should be positioned at the field origin
  // and facing the first field row (origin -> edge direction).
  if (gps.course.isValid() &&
      gps.speed.isValid() &&
      gps.speed.kmph() >= AUTONOMOUS_MIN_COURSE_SPEED_KMPH) {

    const double heading = gps.course.deg();
    const double error =
      normalizeHeadingError(targetBearing - heading);

    if (fabs(error) > 30.0) {

      if (error > 0) {
        turnRight();
      } else {
        turnLeft();
      }

      noteCommandReceived();
      autonomousTurnUntilMs = now + AUTONOMOUS_TURN_MS;
      return;
    }
  }

  driveForward();
  noteCommandReceived();
}

// ============================================================
// DRIVE WATCHDOG
// ============================================================

void updateWatchdog() {

  if (
    currentDir == "stop"
  ) {

    return;
  }


  unsigned long now =
    millis();


  if (
    now - lastCommandMs >=
    WATCHDOG_TIMEOUT_MS
  ) {

    if (
      !watchdogTripped
    ) {

      Serial.println(
        "Drive watchdog: forcing stop."
      );

      watchdogTripped =
        true;
    }


    currentDir =
      "stop";

    avoidState =
      AV_IDLE;

    stopMotors();
  }
}


// ============================================================
// CUTTER WATCHDOG
// ============================================================

void updateCutterWatchdog() {

  // MANUAL: /relay?state=on keeps the cutter ON until
  // /relay?state=off is pressed.
  // AUTONOMOUS: updateWeedCut() controls the cutter duration.
  // Therefore there is NO automatic 800 ms timeout here.
}


// ============================================================
// WEED-CUT SEQUENCE UPDATE
// Called every loop(). Just watches the timer; navigation and
// obstacle-avoidance both independently check weedCutState so
// nothing else moves the robot while this is active.
// ============================================================

void updateWeedCut() {

  if (weedCutState != WC_CUTTING) {
    return;
  }

  unsigned long now = millis();

  if (now - weedCutStartMs >= weedCutDurationMs) {

    setCutter(false);
    weedCutState = WC_IDLE;

    if (resumeAutonomousAfterCut) {
      resumeAutonomousAfterCut = false;
      // Force an immediate re-evaluation instead of waiting out
      // the remainder of AUTONOMOUS_UPDATE_MS.
      lastAutonomousUpdateMs = 0;
    }

    Serial.println("Weed-cut: complete, resuming.");
  }
}


// ============================================================
// GPS UPDATE
// ============================================================

void updateGPS() {

  while (
    GPSSerial.available() > 0
  ) {

    char c =
      GPSSerial.read();

    gps.encode(c);
  }


  // ------------------------------------------
  // Location
  // ------------------------------------------

  if (
    gps.location.isValid()
  ) {

    gpsFix =
      true;

    gpsLatitude =
      gps.location.lat();

    gpsLongitude =
      gps.location.lng();

    gpsLastValidMs =
      millis();
  }


  // ------------------------------------------
  // Altitude
  // ------------------------------------------

  if (
    gps.altitude.isValid()
  ) {

    gpsAltitude =
      gps.altitude.meters();
  }


  // ------------------------------------------
  // Satellites
  // ------------------------------------------

  if (
    gps.satellites.isValid()
  ) {

    gpsSatellites =
      gps.satellites.value();
  }


  // ------------------------------------------
  // HDOP
  // ------------------------------------------

  if (
    gps.hdop.isValid()
  ) {

    gpsHDOP =
      gps.hdop.hdop();
  }


  // ------------------------------------------
  // GPS timeout
  // ------------------------------------------

  if (
    gpsFix &&
    millis() - gpsLastValidMs >
    GPS_FIX_TIMEOUT_MS
  ) {

    gpsFix =
      false;
  }
}


// ============================================================
// GPS JSON
// ============================================================

void addGpsToJson(
  JsonDocument& d
) {

  d["gps"]["fix"] =
    gpsFix;


  if (
    gpsFix
  ) {

    d["gps"]["latitude"] =
      gpsLatitude;

    d["gps"]["longitude"] =
      gpsLongitude;

    d["gps"]["altitude"] =
      gpsAltitude;

  } else {

    d["gps"]["latitude"] =
      nullptr;

    d["gps"]["longitude"] =
      nullptr;

    d["gps"]["altitude"] =
      nullptr;
  }


  d["gps"]["satellites"] =
    gpsSatellites;

  d["gps"]["hdop"] =
    gpsHDOP;
}


// ============================================================
// WIFI
// ============================================================

void connectWiFi() {

  WiFi.persistent(true);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);

  WiFi.begin(
    ssid,
    password
  );

  Serial.print(
    "Connecting to WiFi"
  );


  unsigned long start =
    millis();

  const unsigned long
    WIFI_TIMEOUT_MS =
      15000;


  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start <
    WIFI_TIMEOUT_MS
  ) {

    delay(500);

    Serial.print(".");
  }


  if (
    WiFi.status() ==
    WL_CONNECTED
  ) {

    Serial.println();

    Serial.print(
      "Connected, IP: "
    );

    Serial.println(
      WiFi.localIP()
    );

    if (MDNS.begin(HOSTNAME)) {
      MDNS.addService("http", "tcp", 80);
      Serial.printf("[mdns] reachable at http://%s.local/\n", HOSTNAME);
    } else {
      Serial.println("[mdns] failed to start (falling back to IP only)");
    }

  } else {

    Serial.println();

    Serial.println(
      "WiFi connect failed, restarting..."
    );

    delay(1000);

    ESP.restart();
  }
}


// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(
    115200
  );


  // ==========================================
  // GPS UART
  // NEO-6M default baud = 9600
  // ==========================================

  GPSSerial.begin(
    9600,
    SERIAL_8N1,
    GPS_RX_PIN,
    GPS_TX_PIN
  );


  Serial.println();
  Serial.println(
    "================================="
  );

  Serial.println(
    "ESP32 Weed Robot v7 + NEO-6M GPS"
  );

  Serial.println(
    "GPS UART initialized"
  );

  Serial.println(
    "================================="
  );


  // ==========================================
  // MOTOR PINS
  // ==========================================

  pinMode(
    IN1,
    OUTPUT
  );

  pinMode(
    IN2,
    OUTPUT
  );

  pinMode(
    IN3,
    OUTPUT
  );

  pinMode(
    IN4,
    OUTPUT
  );

  pinMode(
    IN1B,
    OUTPUT
  );

  pinMode(
    IN2B,
    OUTPUT
  );

  pinMode(
    IN3B,
    OUTPUT
  );

  pinMode(
    IN4B,
    OUTPUT
  );


  // ==========================================
  // RELAY
  // ==========================================
  // SAFE startup: relay must be OFF before and after OUTPUT setup.
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? HIGH : LOW);


  pinMode(
    RELAY_PIN,
    OUTPUT
  );

  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? HIGH : LOW);


  // ==========================================
  // ULTRASONIC
  // ==========================================

  pinMode(
    TRIG_PIN,
    OUTPUT
  );

  pinMode(
    ECHO_PIN,
    INPUT
  );


  // ==========================================
  // PWM
  // ==========================================

  ledcAttach(
    ENA1,
    PWM_FREQ,
    PWM_RES_BITS
  );

  ledcAttach(
    ENA2,
    PWM_FREQ,
    PWM_RES_BITS
  );


  // ==========================================
  // SAFE START
  // ==========================================

  stopMotors();

  setCutter(
    false
  );


  lastCommandMs =
    millis();


  // ==========================================
  // WIFI
  // ==========================================

  connectWiFi();


  // ==========================================
  // API KEY HEADER
  // ==========================================

  const char* headerKeys[] =
    {
      "X-API-Key"
    };


  server.collectHeaders(
    headerKeys,
    1
  );


  // ============================================================
  // PING
  // ============================================================

  server.on(
    "/ping",
    HTTP_GET,
    []() {

      setCorsHeaders();

      server.send(
        200,
        "text/plain",
        "OK"
      );
    }
  );


  // ============================================================
  // STATUS
  // ============================================================

  server.on(
    "/status",
    HTTP_GET,
    []() {

      setCorsHeaders();

      StaticJsonDocument<1024> d;


      d["ip"] =
        WiFi.localIP().toString();

      d["mode"] =
        currentMode;

      d["speed"] =
        currentSpeed;

      d["dir"] =
        currentDir;

      d["cutter"] =
        cutterOn;

      d["distance_cm"] =
        lastDistanceCm;

      d["avoiding"] =
        (
          avoidState != AV_IDLE
        );

      d["watchdog_tripped"] =
        watchdogTripped;

      d["cutter_watchdog_tripped"] =
        cutterWatchdogTripped;

      d["autonomous_running"] =
        autonomousRunning;

      d["autonomous_finished"] =
        autonomousFinished;

      d["autonomous_waypoint_index"] =
        autoWaypointIndex;

      d["autonomous_waypoint_count"] =
        autoWaypointCount;

      d["autonomous_target_distance_m"] =
        autonomousTargetDistanceM;

      d["weed_cut_state"] =
        (weedCutState == WC_CUTTING) ? "cutting" : "idle";

      if (weedCutState == WC_CUTTING) {
        unsigned long elapsed = millis() - weedCutStartMs;
        long remaining = (long) weedCutDurationMs - (long) elapsed;
        d["weed_cut_remaining_ms"] = remaining > 0 ? remaining : 0;
      } else {
        d["weed_cut_remaining_ms"] = 0;
      }


      // GPS
      addGpsToJson(d);


      String response;

      serializeJson(
        d,
        response
      );


      server.send(
        200,
        "application/json",
        response
      );
    }
  );


  // ============================================================
  // GPS
  // GET /gps
  // ============================================================

  server.on(
    "/gps",
    HTTP_GET,
    []() {

      setCorsHeaders();

      StaticJsonDocument<512> d;


      d["fix"] =
        gpsFix;


      if (
        gpsFix
      ) {

        d["latitude"] =
          gpsLatitude;

        d["longitude"] =
          gpsLongitude;

        d["altitude"] =
          gpsAltitude;

      } else {

        d["latitude"] =
          nullptr;

        d["longitude"] =
          nullptr;

        d["altitude"] =
          nullptr;
      }


      d["satellites"] =
        gpsSatellites;

      d["hdop"] =
        gpsHDOP;


      String response;

      serializeJson(
        d,
        response
      );


      server.send(
        200,
        "application/json",
        response
      );
    }
  );


  // ============================================================
  // AUTONOMOUS PLAN
  // POST /autonomous/plan
  // Body: {"waypoints":[{"lat":...,"lng":...}, ...]}
  // ============================================================

  server.on(
    "/autonomous/plan",
    HTTP_POST,
    []() {

      if (!requireAuth()) {
        return;
      }

      if (!server.hasArg("plain")) {
        server.send(400, "application/json",
          "{\"error\":\"missing JSON body\"}");
        return;
      }

      StaticJsonDocument<8192> d;
      DeserializationError err =
        deserializeJson(d, server.arg("plain"));

      if (err) {
        server.send(400, "application/json",
          "{\"error\":\"invalid JSON plan\"}");
        return;
      }

      JsonArray waypoints = d["waypoints"].as<JsonArray>();

      if (waypoints.isNull() || waypoints.size() == 0 ||
          waypoints.size() > MAX_AUTONOMOUS_WAYPOINTS) {
        server.send(400, "application/json",
          "{\"error\":\"waypoints must contain 1-64 points\"}");
        return;
      }

      stopAutonomous();
      autoWaypointCount = 0;

      for (JsonObject point : waypoints) {
        if (!point["lat"].is<double>() || !point["lng"].is<double>()) {
          clearAutonomousPlan();
          server.send(400, "application/json",
            "{\"error\":\"each waypoint needs numeric lat and lng\"}");
          return;
        }

        double lat = point["lat"].as<double>();
        double lng = point["lng"].as<double>();

        if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0) {
          clearAutonomousPlan();
          server.send(400, "application/json",
            "{\"error\":\"waypoint coordinates out of range\"}");
          return;
        }

        autoWaypoints[autoWaypointCount].lat = lat;
        autoWaypoints[autoWaypointCount].lng = lng;
        autoWaypointCount++;
      }

      autoWaypointIndex = 0;
      autonomousFinished = false;
      autonomousTargetDistanceM = -1;

      String response =
        String("{\"count\":") +
        String(autoWaypointCount) +
        "}";

      server.send(200, "application/json", response);
    }
  );

  // ============================================================
  // AUTONOMOUS START
  // POST /autonomous/start
  // ============================================================

  server.on(
    "/autonomous/start",
    HTTP_POST,
    []() {

      if (!requireAuth()) {
        return;
      }

      if (autoWaypointCount == 0) {
        server.send(409, "application/json",
          "{\"error\":\"no autonomous waypoint plan loaded\"}");
        return;
      }

      currentMode = "autonomous";
      autonomousRunning = true;
      autonomousFinished = false;
      autoWaypointIndex = 0;
      autonomousTurnUntilMs = 0;
      autonomousTargetDistanceM = -1;
      noteCommandReceived();

      server.send(200, "application/json",
        "{\"mode\":\"autonomous\",\"running\":true}");
    }
  );

  // ============================================================
  // AUTONOMOUS STOP
  // POST /autonomous/stop
  // ============================================================

  server.on(
    "/autonomous/stop",
    HTTP_POST,
    []() {

      if (!requireAuth()) {
        return;
      }

      stopAutonomous();
      currentMode = "manual";
      noteCommandReceived();

      server.send(200, "application/json",
        "{\"mode\":\"manual\",\"running\":false}");
    }
  );

  // ============================================================
  // AUTONOMOUS STATUS
  // GET /autonomous/status
  // ============================================================

  server.on(
    "/autonomous/status",
    HTTP_GET,
    []() {

      setCorsHeaders();

      StaticJsonDocument<512> d;
      d["mode"] = currentMode;
      d["running"] = autonomousRunning;
      d["finished"] = autonomousFinished;
      d["waypoint_index"] = autoWaypointIndex;
      d["waypoint_count"] = autoWaypointCount;
      d["target_distance_m"] = autonomousTargetDistanceM;

      String response;
      serializeJson(d, response);
      server.send(200, "application/json", response);
    }
  );

  // ============================================================
  // WEED DETECTED
  // POST /weed-detected?duration=<ms optional, default 3000>
  //
  // Called by the laptop after YOLO confirms a weed in frame:
  //   camera -> laptop (YOLO) -> POST /weed-detected -> ESP32
  //
  // Stops whatever the robot is doing, runs the cutter for
  // `duration` ms, then auto-resumes autonomous navigation if
  // that's what was interrupted.
  // ============================================================

  server.on(
    "/weed-detected",
    HTTP_POST,
    []() {

      if (!requireAuth()) {
        return;
      }

      if (weedCutState == WC_CUTTING) {
        server.send(409, "application/json",
          "{\"error\":\"already cutting\"}");
        return;
      }

      // Don't interrupt an obstacle-avoidance maneuver mid-turn.
      if (avoidState != AV_IDLE) {
        server.send(409, "application/json",
          "{\"error\":\"cannot cut mid obstacle-avoidance, try again shortly\"}");
        return;
      }

      unsigned long duration = WEED_CUT_DEFAULT_MS;
      if (server.hasArg("duration")) {
        long d = server.arg("duration").toInt();
        if (d > 0) duration = (unsigned long) d;
      }
      if (duration > WEED_CUT_MAX_MS) duration = WEED_CUT_MAX_MS;

      resumeAutonomousAfterCut =
        (currentMode == "autonomous" && autonomousRunning);

      currentDir = "stop";
      stopMotors();
      setCutter(true);

      weedCutState = WC_CUTTING;
      weedCutStartMs = millis();
      weedCutDurationMs = duration;

      noteCommandReceived();

      server.send(200, "application/json",
        "{\"cutting\":true,\"duration_ms\":" + String(duration) +
        ",\"resume_autonomous\":" +
        (resumeAutonomousAfterCut ? "true" : "false") + "}");
    }
  );

  // ============================================================
  // MODE
  // POST /mode?mode=manual|autonomous
  // ============================================================

  server.on(
    "/mode",
    HTTP_POST,
    []() {

      if (
        !requireAuth()
      ) {

        return;
      }


      if (
        server.hasArg("mode")
      ) {

        String m =
          server.arg("mode");


        if (
          m == "manual" ||
          m == "autonomous" ||
          m == "auto"
        ) {

          if (m == "auto") {
            m = "autonomous";
          }

          if (m == "manual") {
            stopAutonomous();

            // Manual mode always starts with cutter OFF.
            weedCutState = WC_IDLE;
            resumeAutonomousAfterCut = false;
            setCutter(false);
          } else if (autoWaypointCount == 0) {
            server.send(
              409,
              "application/json",
              "{\"error\":\"autonomous mode requires a loaded waypoint plan\"}"
            );
            return;
          }

          // Never carry a manually enabled cutter into autonomous mode.
          if (m == "autonomous") {
            setCutter(false);
            weedCutState = WC_IDLE;
            resumeAutonomousAfterCut = false;
          }

          currentMode =
            m;

          if (currentMode == "autonomous") {
            autonomousRunning = true;
            autonomousFinished = false;
            autoWaypointIndex = 0;
            autonomousTurnUntilMs = 0;
          }


          server.send(
            200,
            "application/json",
            "{\"mode\":\"" +
            currentMode +
            "\"}"
          );

        } else {

          server.send(
            400,
            "text/plain",
            "mode must be 'manual' or 'autonomous'"
          );
        }

      } else {

        server.send(
          400,
          "text/plain",
          "missing 'mode' arg (manual|autonomous)"
        );
      }
    }
  );


  // ============================================================
  // SPEED
  // POST /speed?value=0-255
  // ============================================================

  server.on(
    "/speed",
    HTTP_POST,
    []() {

      if (
        !requireAuth()
      ) {

        return;
      }


      if (
        server.hasArg("value")
      ) {

        int v =
          server.arg(
            "value"
          ).toInt();


        v =
          constrain(
            v,
            0,
            PWM_MAX
          );


        currentSpeed =
          v;


        applySpeed();

        noteCommandReceived();


        server.send(
          200,
          "application/json",
          "{\"speed\":" +
          String(currentSpeed) +
          "}"
        );

      } else {

        server.send(
          400,
          "text/plain",
          "missing 'value' arg (0-255)"
        );
      }
    }
  );


  // ============================================================
  // MOVE
  // POST /move?dir=forward|backward|left|right|stop
  // ============================================================

  server.on(
    "/move",
    HTTP_POST,
    []() {

      if (
        !requireAuth()
      ) {

        return;
      }


      if (
        server.hasArg("speed")
      ) {

        int v =
          server.arg(
            "speed"
          ).toInt();


        currentSpeed =
          constrain(
            v,
            0,
            PWM_MAX
          );
      }


      String dir =
        server.hasArg("dir")
          ? server.arg("dir")
          : "stop";

      if (currentMode == "autonomous" && dir != "stop") {
        server.send(
          409,
          "application/json",
          "{\"error\":\"manual movement disabled in autonomous mode\"}"
        );
        return;
      }

      currentDir =
        dir;


      avoidState =
        AV_IDLE;


      noteCommandReceived();


      if (
        dir == "forward"
      ) {

        driveForward();

      } else if (
        dir == "backward"
      ) {

        driveBackward();

      } else if (
        dir == "left"
      ) {

        turnLeft();

      } else if (
        dir == "right"
      ) {

        turnRight();

      } else {

        dir =
          "stop";

        currentDir =
          "stop";

        stopMotors();
      }


      server.send(
        200,
        "application/json",
        "{\"dir\":\"" +
        dir +
        "\",\"speed\":" +
        String(currentSpeed) +
        "}"
      );
    }
  );


  // ============================================================
  // STOP
  // ============================================================

  server.on(
    "/stop",
    HTTP_POST,
    []() {

      if (
        !requireAuth()
      ) {

        return;
      }


      stopAutonomous();
      currentMode = "manual";

      currentDir =
        "stop";


      avoidState =
        AV_IDLE;


      stopMotors();


      // Always turn cutter OFF
      setCutter(false);


      noteCommandReceived();


      server.send(
        200,
        "application/json",
        "{\"dir\":\"stop\",\"cutter\":false}"
      );
    }
  );


  // ============================================================
  // RELAY / CUTTER
  // POST /relay?state=on|off
  // ============================================================

  server.on(
    "/relay",
    HTTP_POST,
    []() {

      if (
        !requireAuth()
      ) {

        return;
      }


      if (
        server.hasArg("state")
      ) {

        String state =
          server.arg(
            "state"
          );


        // --------------------------------------
        // Cutter ON
        // --------------------------------------

        if (
          state == "on"
        ) {

          // Safety interlock
          if (
            avoidState != AV_IDLE
          ) {

            server.send(
              409,
              "application/json",
              "{\"error\":\"cutter blocked: robot mid obstacle-avoidance\",\"avoiding\":true}"
            );

            return;
          }


          setCutter(
            true
          );
        }


        // --------------------------------------
        // Cutter OFF
        // --------------------------------------

        else if (
          state == "off"
        ) {

          setCutter(
            false
          );

        } else {

          server.send(
            400,
            "text/plain",
            "state must be 'on' or 'off'"
          );

          return;
        }


        noteCommandReceived();


        server.send(
          200,
          "application/json",
          String(
            "{\"cutter\":" 
          ) +
          (
            cutterOn
              ? "true"
              : "false"
          ) +
          "}"
        );

      } else {

        server.send(
          400,
          "text/plain",
          "missing 'state' arg (on|off)"
        );
      }
    }
  );


  // ============================================================
  // OPTIONS / CORS
  // ============================================================

  server.on(
    "/move",
    HTTP_OPTIONS,
    []() {

      setCorsHeaders();

      server.send(
        204
      );
    }
  );


  server.on(
    "/stop",
    HTTP_OPTIONS,
    []() {

      setCorsHeaders();

      server.send(
        204
      );
    }
  );


  server.on(
    "/speed",
    HTTP_OPTIONS,
    []() {

      setCorsHeaders();

      server.send(
        204
      );
    }
  );


  server.on(
    "/relay",
    HTTP_OPTIONS,
    []() {

      setCorsHeaders();

      server.send(
        204
      );
    }
  );


  server.on(
    "/mode",
    HTTP_OPTIONS,
    []() {

      setCorsHeaders();

      server.send(
        204
      );
    }
  );


  server.on(
    "/weed-detected",
    HTTP_OPTIONS,
    []() {

      setCorsHeaders();

      server.send(
        204
      );
    }
  );


  // ============================================================
  // START SERVER
  // ============================================================

  server.begin();

  Serial.println(
    "HTTP server started"
  );

  Serial.println(
    "GPS endpoint: /gps"
  );

  Serial.println(
    "Status endpoint: /status"
  );

  Serial.println(
    "Autonomous endpoints: /autonomous/plan, /autonomous/start, /autonomous/stop"
  );

  Serial.println(
    "Weed-cut endpoint: /weed-detected?duration=<ms>"
  );
}


// ============================================================
// WIFI WATCHDOG
// Router hiccups / brief signal loss leave WiFi.status() !=
// WL_CONNECTED. WiFi.setAutoReconnect(true) helps but isn't
// fully reliable on the ESP32 WiFi stack, so we also poll and
// force a reconnect ourselves. This is why the board used to
// come back online only after a USB-triggered reset (setup()
// re-running connectWiFi()) instead of recovering on its own.
// ============================================================

#define WIFI_CHECK_INTERVAL_MS 5000

unsigned long lastWifiCheckMs = 0;
bool wifiWasConnected = true;

void updateWifiWatchdog() {

  unsigned long now = millis();

  if (now - lastWifiCheckMs < WIFI_CHECK_INTERVAL_MS) {
    return;
  }

  lastWifiCheckMs = now;

  bool connectedNow = (WiFi.status() == WL_CONNECTED);

  if (!connectedNow) {

    if (wifiWasConnected) {
      Serial.println("WiFi watchdog: connection lost, reconnecting...");
    }

    wifiWasConnected = false;

    // A WiFi drop mid-drive/mid-cut is treated like any other
    // safety-critical fault: stop moving and stop cutting first.
    stopAutonomous();
    currentDir = "stop";
    stopMotors();
    setCutter(false);

    WiFi.disconnect();
    WiFi.begin(ssid, password);
    return;
  }

  if (!wifiWasConnected) {

    // Just came back — the DHCP IP may have changed, so the mDNS
    // responder needs to be restarted to advertise the new one.
    Serial.print("WiFi watchdog: reconnected, IP: ");
    Serial.println(WiFi.localIP());

    MDNS.end();

    if (MDNS.begin(HOSTNAME)) {
      MDNS.addService("http", "tcp", 80);
      Serial.printf("[mdns] reachable again at http://%s.local/\n", HOSTNAME);
    }

    wifiWasConnected = true;
  }
}


// ============================================================
// LOOP
// ============================================================

void loop() {

  // Handle HTTP requests
  server.handleClient();


  // WiFi connection health
  updateWifiWatchdog();


  // Read NEO-6M
  updateGPS();


  // Obstacle avoidance
  updateObstacleAvoidance();


  // Autonomous GPS navigation
  updateAutonomousNavigation();


  // Drive safety
  updateWatchdog();


  // Cutter safety
  updateCutterWatchdog();


  // Weed-cut sequence (laptop-triggered)
  updateWeedCut();
}