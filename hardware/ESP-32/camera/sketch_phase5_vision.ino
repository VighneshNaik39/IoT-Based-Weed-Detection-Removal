/*
  sketch_phase5_vision.ino
  WeedGuard Phase 5 -- Member 3 (ESP32 / Vision Hardware)

  Purpose
  -------
  Firmware for the SECOND ESP32 board -- the LILYGO T-SIMCAM
  (ESP32-S3 + OV5640) -- dedicated purely to camera bring-up and
  live MJPEG streaming over Wi-Fi. This board does NOT drive motors
  or the cutter relay. The existing Phase 4 firmware
  (hardware/ESP-32/sketch_apr12a_v3/esp32_phase4_v1_3) keeps running,
  unmodified, on the original drive-motor ESP32.

  detect_stream.py (on the laptop) opens the MJPEG stream this board
  serves, runs YOLOv8 inference on the frames, and calls the Node
  backend's POST /api/detection/weed when a weed is found. That
  backend call is what ultimately reaches the drive ESP32's /cutter
  endpoint -- this board never talks to the drive ESP32 directly.

  What this firmware does
  ------------------------
    1. Brings up the OV5640 camera over the DVP/parallel interface.
    2. Connects to Wi-Fi (same network as the drive ESP32 + backend).
    3. Serves:
         GET /stream  -> multipart/x-mixed-replace MJPEG stream
                          (this is the URL detect_stream.py reads)
         GET /capture -> single JPEG snapshot
         GET /status  -> JSON health/info for the dashboard or for
                          manual debugging
         OPTIONS *    -> CORS preflight (harmless if unused)

  Two-ESP32 coexistence
  ----------------------
  This board and the drive-motor ESP32 both join the SAME Wi-Fi
  network but must NOT collide on IP/hostname:
    - Drive ESP32   -> static/DHCP-reserved IP set in the Phase 5
                       firmware (see esp32_phase4_v1_3 / WeedRobot v5),
                       hostname left default.
    - This board    -> hostname "weedguard-cam" (set below), and
                       CAM_STATIC_IP below if you want a fixed IP
                       instead of relying on DHCP. Give it a DIFFERENT
                       IP from the drive ESP32's ESP32_IP value in
                       software/backend/.env.
  Check your router's DHCP client list (or Serial output on boot)
  before wiring the IP into detect_stream.py's --cam-url.

  Camera pin mapping (T-SIMCAM / "TTGO_T_CAM_SIM" board variant,
  ESP32-S3 + OV5640, DVP interface)
  -----------------------------------------------------------------
  These pins come from LilyGO's own camera-series pin tables for the
  T-SIMCAM board. If your specific T-SIMCAM revision behaves
  differently (blank frames, camera init error), double check against
  the schematic for your board revision before assuming the firmware
  is wrong -- LilyGO has shipped more than one T-SIMCAM hardware
  revision.

  Library requirements (Arduino IDE -> Library Manager, or
  Boards Manager for the core):
    - esp32 board package (Espressif) v2.0.x+ , board:
        "ESP32S3 Dev Module" (or the LilyGO T-SIMCAM entry if your
        board index includes it)
    - Enable PSRAM in Tools > PSRAM > "OPI PSRAM" (T-SIMCAM has PSRAM;
      required for higher JPEG frame sizes / double buffering)
    - Uses the built-in "esp_camera" driver that ships with the
      esp32 board package -- no extra camera library install needed.
*/

#include "esp_camera.h"
#include <WiFi.h>
#include "esp_http_server.h"
#include "esp_timer.h"
#include <ESPmDNS.h>

// ===================== USER CONFIG =====================

const char* WIFI_SSID     = "rcb";
const char* WIFI_PASSWORD = "987654321";

// Give the camera board its own identity on the network, distinct
// from the drive ESP32, so mDNS / DHCP reservations don't collide.
const char* HOSTNAME = "weedguard-cam";

// Set USE_STATIC_IP to true and fill these in if you'd rather pin
// the camera's IP than rely on DHCP + reading it off Serial each
// boot. Must NOT match the drive ESP32's IP (see software/backend/.env
// -> ESP32_IP) or the backend's own host IP.
#define USE_STATIC_IP false
IPAddress CAM_STATIC_IP(10, 15, 101, 233);
IPAddress CAM_GATEWAY(10, 15, 101, 1);
IPAddress CAM_SUBNET(255, 255, 255, 0);

// Optional shared secret for the /status and /stream endpoints.
// Blank ("") disables the check -- fine for a closed lab network,
// but set this before running anywhere less trusted, and give the
// same value to detect_stream.py via --cam-key.
const char* CAM_KEY = "";

// ===================== CAMERA PIN MAP =====================
// T-SIMCAM (ESP32-S3 + OV5640), DVP/parallel camera interface.
#define PWDN_GPIO_NUM    -1   // not used on this board
#define RESET_GPIO_NUM   18
#define XCLK_GPIO_NUM    14
#define SIOD_GPIO_NUM    4    // SCCB/I2C data (camera control)
#define SIOC_GPIO_NUM    5    // SCCB/I2C clock

#define Y9_GPIO_NUM      15   // D7
#define Y8_GPIO_NUM      16   // D6
#define Y7_GPIO_NUM      17   // D5
#define Y6_GPIO_NUM      12   // D4
#define Y5_GPIO_NUM      10   // D3
#define Y4_GPIO_NUM      8    // D2
#define Y3_GPIO_NUM      9    // D1
#define Y2_GPIO_NUM      11   // D0

#define VSYNC_GPIO_NUM   6
#define HREF_GPIO_NUM    7
#define PCLK_GPIO_NUM    13

// ===================== STREAM CONFIG =====================
// Keep this modest -- detect_stream.py only pulls ~1 frame/sec for
// inference, and a smaller frame keeps Wi-Fi + inference latency
// down. Bump to FRAMESIZE_SVGA/VGA later if detection accuracy needs
// more detail and your Wi-Fi link can keep up.
#define STREAM_FRAMESIZE     FRAMESIZE_VGA   // 640x480
#define STREAM_JPEG_QUALITY  12              // 0 (best) - 63 (worst)

static const char* STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=frame";
static const char* STREAM_BOUNDARY     = "\r\n--frame\r\n";
static const char* STREAM_PART_HEADER  = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t streamServer = NULL;
unsigned long bootMillis = 0;
uint32_t framesServed = 0;

// ===================== AUTH HELPER =====================
static bool checkKey(httpd_req_t* req) {
  if (strlen(CAM_KEY) == 0) return true; // auth disabled
  char buf[128];
  if (httpd_req_get_hdr_value_str(req, "X-API-Key", buf, sizeof(buf)) == ESP_OK) {
    if (strcmp(buf, CAM_KEY) == 0) return true;
  }
  httpd_resp_set_status(req, "401 Unauthorized");
  httpd_resp_send(req, "{\"error\":\"unauthorized\"}", HTTPD_RESP_USE_STRLEN);
  return false;
}

static void setCors(httpd_req_t* req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, OPTIONS");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "Content-Type, X-API-Key");
}

// ===================== HANDLERS =====================

// GET /stream -> MJPEG multipart stream (what detect_stream.py reads)
static esp_err_t streamHandler(httpd_req_t* req) {
  if (!checkKey(req)) return ESP_OK;

  camera_fb_t* fb = NULL;
  esp_err_t res = ESP_OK;
  char partBuf[64];

  setCors(req);
  res = httpd_resp_set_type(req, STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[stream] camera capture failed");
      res = ESP_FAIL;
    } else {
      if (fb->format != PIXFORMAT_JPEG) {
        Serial.println("[stream] non-JPEG frame, dropping");
        esp_camera_fb_return(fb);
        continue;
      }
      size_t hlen = snprintf(partBuf, sizeof(partBuf), STREAM_PART_HEADER, fb->len);
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, STREAM_BOUNDARY, strlen(STREAM_BOUNDARY));
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, partBuf, hlen);
      if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
      esp_camera_fb_return(fb);
      framesServed++;
    }
    if (res != ESP_OK) break; // client disconnected or camera error
  }
  return res;
}

// GET /capture -> single JPEG snapshot (handy for quick curl checks
// while setting up, or if a script prefers pull-a-frame over reading
// the continuous stream).
static esp_err_t captureHandler(httpd_req_t* req) {
  if (!checkKey(req)) return ESP_OK;
  setCors(req);

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }
  httpd_resp_set_type(req, "image/jpeg");
  esp_err_t res = httpd_resp_send(req, (const char*)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  framesServed++;
  return res;
}

// GET /status -> JSON health info
static esp_err_t statusHandler(httpd_req_t* req) {
  if (!checkKey(req)) return ESP_OK;
  setCors(req);

  char json[256];
  unsigned long uptimeS = (millis() - bootMillis) / 1000;
  snprintf(json, sizeof(json),
    "{\"ok\":true,\"ip\":\"%s\",\"rssi\":%d,\"uptimeSec\":%lu,"
    "\"framesServed\":%lu,\"freeHeap\":%u}",
    WiFi.localIP().toString().c_str(), WiFi.RSSI(), uptimeS,
    (unsigned long)framesServed, ESP.getFreeHeap());

  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, json, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t optionsHandler(httpd_req_t* req) {
  setCors(req);
  httpd_resp_send(req, NULL, 0);
  return ESP_OK;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.stack_size = 8192;
  config.max_uri_handlers = 8;

  httpd_uri_t streamUri  = { "/stream",  HTTP_GET,     streamHandler,  NULL };
  httpd_uri_t captureUri = { "/capture", HTTP_GET,     captureHandler, NULL };
  httpd_uri_t statusUri  = { "/status",  HTTP_GET,     statusHandler,  NULL };
  httpd_uri_t optsUri    = { "/*",       HTTP_OPTIONS, optionsHandler, NULL };

  if (httpd_start(&streamServer, &config) == ESP_OK) {
    httpd_register_uri_handler(streamServer, &streamUri);
    httpd_register_uri_handler(streamServer, &captureUri);
    httpd_register_uri_handler(streamServer, &statusUri);
    httpd_register_uri_handler(streamServer, &optsUri);
    Serial.println("[http] camera server started");
  } else {
    Serial.println("[http] FAILED to start camera server");
  }
}

// ===================== SETUP / LOOP =====================

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Use PSRAM for bigger frame buffers / double-buffering if present
  // (T-SIMCAM has PSRAM -- make sure it's enabled in Tools menu).
  if (psramFound()) {
    config.frame_size = STREAM_FRAMESIZE;
    config.jpeg_quality = STREAM_JPEG_QUALITY;
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;
  } else {
    Serial.println("[camera] WARNING: no PSRAM found, falling back to a "
                    "smaller frame size. Enable PSRAM in Tools menu for "
                    "better stream quality.");
    config.frame_size = FRAMESIZE_QVGA; // 320x240
    config.jpeg_quality = 15;
    config.fb_count = 1;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[camera] init FAILED, error 0x%x\n", err);
    return false;
  }

  // OV5640-specific tweaks -- mirror/flip if the module is mounted
  // upside down or reversed on your chassis; tune once you see the
  // first stream frames.
  sensor_t* s = esp_camera_sensor_get();
  if (s) {
    s->set_vflip(s, 0);
    s->set_hmirror(s, 0);
  }

  Serial.println("[camera] init OK");
  return true;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOSTNAME);

#if USE_STATIC_IP
  if (!WiFi.config(CAM_STATIC_IP, CAM_GATEWAY, CAM_SUBNET)) {
    Serial.println("[wifi] static IP config failed, falling back to DHCP");
  }
#endif

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[wifi] connecting");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
    if (millis() - start > 20000) {
      Serial.println("\n[wifi] still not connected after 20s, retrying begin()");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      start = millis();
    }
  }
  Serial.println();
  Serial.printf("[wifi] connected, IP = %s  hostname = %s\n",
                WiFi.localIP().toString().c_str(), HOSTNAME);

  if (MDNS.begin(HOSTNAME)) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("[mdns] reachable at http://%s.local/\n", HOSTNAME);
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== WeedGuard Phase 5 -- T-SIMCAM vision node ===");

  if (!initCamera()) {
    Serial.println("[fatal] camera init failed -- halting. Check wiring / "
                    "board revision / PSRAM setting and reset.");
    while (true) delay(1000);
  }

  connectWiFi();
  startCameraServer();

  bootMillis = millis();
  Serial.println("[ready] GET /stream for MJPEG, /capture for a single "
                  "frame, /status for JSON health info.");
  Serial.printf("[ready] point detect_stream.py at: http://%s/stream\n",
                WiFi.localIP().toString().c_str());
}

void loop() {
  // The HTTP server runs its own FreeRTOS task; nothing needed here
  // beyond keeping the sketch alive and reconnecting Wi-Fi if it
  // drops mid-session (Wi-Fi router hiccup, interference, etc.).
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[wifi] connection lost, reconnecting...");
    connectWiFi();
  }
  delay(2000);
}
