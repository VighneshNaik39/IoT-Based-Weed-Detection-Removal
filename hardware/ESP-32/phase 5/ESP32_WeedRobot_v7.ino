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


// ============================================================
// WIFI
// ============================================================

const char* ssid     = "rcb";
const char* password = "987654321";

 
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
// ROBOT STATE
// ============================================================

int currentSpeed = 180;

String currentDir = "stop";

bool cutterOn = false;

float lastDistanceCm = -1;

String currentMode = "manual";


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

  digitalWrite(
    RELAY_PIN,
    on ? HIGH : LOW
  );

  if (on) {

    lastCutterCommandMs =
      millis();

    cutterWatchdogTripped =
      false;
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

  if (
    !cutterOn
  ) {

    return;
  }


  unsigned long now =
    millis();


  if (
    now - lastCutterCommandMs >=
    CUTTER_WATCHDOG_TIMEOUT_MS
  ) {

    if (
      !cutterWatchdogTripped
    ) {

      Serial.println(
        "Cutter watchdog: forcing relay OFF."
      );

      cutterWatchdogTripped =
        true;
    }


    setCutter(false);
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

  pinMode(
    RELAY_PIN,
    OUTPUT
  );


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

      StaticJsonDocument<768> d;


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
  // MODE
  // POST /mode?mode=manual|auto
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
          m == "auto"
        ) {

          currentMode =
            m;


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
            "mode must be 'manual' or 'auto'"
          );
        }

      } else {

        server.send(
          400,
          "text/plain",
          "missing 'mode' arg (manual|auto)"
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
}


// ============================================================
// LOOP
// ============================================================

void loop() {

  // Handle HTTP requests
  server.handleClient();


  // Read NEO-6M
  updateGPS();


  // Obstacle avoidance
  updateObstacleAvoidance();


  // Drive safety
  updateWatchdog();


  // Cutter safety
  updateCutterWatchdog();
}