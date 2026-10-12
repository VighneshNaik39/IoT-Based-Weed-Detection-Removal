#include "esp_camera.h"
#include <WiFi.h>
#include <ESPmDNS.h>
#include "esp_http_server.h"
#include <string.h>

// ============================================================
// WEEDGUARD ESP32-CAM FIRMWARE
// Board: AI-Thinker ESP32-CAM
// Camera: Compatible OV2640 / OV5640 sensors, depending on module
// Camera HTTP server: Port 80
// MJPEG stream server: Port 81
// ============================================================

// -------------------- WIFI CONFIGURATION --------------------

const char* WIFI_SSID = "ESP32TEST";
const char* WIFI_PASSWORD = "12345678";
const char* CAMERA_HOSTNAME = "weedguard-cam";

// -------------------- AI-THINKER CAMERA PINS ----------------

#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5

#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// -------------------- SERVER HANDLES ------------------------

static httpd_handle_t camera_httpd = nullptr;
static httpd_handle_t stream_httpd = nullptr;

static const char* STREAM_CONTENT_TYPE =
    "multipart/x-mixed-replace;boundary=frame";

static const char* STREAM_BOUNDARY =
    "\r\n--frame\r\n";

static const char* STREAM_PART =
    "Content-Type: image/jpeg\r\n"
    "Content-Length: %u\r\n\r\n";

// -------------------- WEB PAGE ------------------------------

static const char INDEX_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WeedGuard ESP32-CAM</title>

<style>
body {
    font-family: Arial, sans-serif;
    background: #111;
    color: #eee;
    text-align: center;
    margin: 20px;
}
img {
    width: 100%;
    max-width: 640px;
    height: auto;
    border: 2px solid #555;
}
a {
    color: #9f9;
    margin: 8px;
}
button {
    padding: 10px 16px;
    margin: 5px;
}
</style>
</head>

<body>
<h2>WeedGuard — ESP32-CAM</h2>
<p>Live camera stream</p>

<img id="camera" src="/stream" alt="Camera stream">

<p>
<a href="/capture" target="_blank">Capture JPEG</a>
<a href="/status" target="_blank">Camera status</a>
</p>

<button onclick="refreshStream()">Reconnect stream</button>

<script>
function refreshStream() {
    document.getElementById("camera").src =
        "/stream?t=" + Date.now();
}
</script>
</body>
</html>
)HTML";

// ============================================================
// HTTP HANDLERS
// ============================================================

// -------------------- INDEX PAGE ----------------------------

static esp_err_t index_handler(httpd_req_t* req) {
    httpd_resp_set_type(req, "text/html; charset=utf-8");

    return httpd_resp_send(
        req,
        INDEX_HTML,
        HTTPD_RESP_USE_STRLEN
    );
}

// -------------------- CAMERA STATUS -------------------------

static esp_err_t status_handler(httpd_req_t* req) {
    sensor_t* sensor = esp_camera_sensor_get();

    char json[320];

    String ip = WiFi.localIP().toString();

    int pid = sensor ? sensor->id.PID : -1;
    int frameSize = sensor
        ? (int)sensor->status.framesize
        : -1;

    snprintf(
        json,
        sizeof(json),
        "{"
        "\"success\":true,"
        "\"board\":\"AI-Thinker ESP32-CAM\","
        "\"sensorPid\":%d,"
        "\"frameSizeCode\":%d,"
        "\"wifi\":\"%s\","
        "\"ip\":\"%s\","
        "\"streamUrl\":\"http://%s:81/stream\""
        "}",
        pid,
        frameSize,
        WiFi.status() == WL_CONNECTED
            ? "connected"
            : "disconnected",
        ip.c_str(),
        ip.c_str()
    );

    httpd_resp_set_type(req, "application/json");

    httpd_resp_set_hdr(
        req,
        "Cache-Control",
        "no-store"
    );

    return httpd_resp_send(
        req,
        json,
        HTTPD_RESP_USE_STRLEN
    );
}

// -------------------- SINGLE JPEG CAPTURE -------------------

static esp_err_t capture_handler(httpd_req_t* req) {
    camera_fb_t* fb = esp_camera_fb_get();

    if (!fb) {
        httpd_resp_send_err(
            req,
            HTTPD_500_INTERNAL_SERVER_ERROR,
            "Camera capture failed"
        );

        return ESP_FAIL;
    }

    if (fb->format != PIXFORMAT_JPEG) {
        esp_camera_fb_return(fb);

        httpd_resp_send_err(
            req,
            HTTPD_500_INTERNAL_SERVER_ERROR,
            "Camera frame is not JPEG"
        );

        return ESP_FAIL;
    }

    httpd_resp_set_type(req, "image/jpeg");

    httpd_resp_set_hdr(
        req,
        "Content-Disposition",
        "inline; filename=capture.jpg"
    );

    httpd_resp_set_hdr(
        req,
        "Cache-Control",
        "no-store"
    );

    esp_err_t result = httpd_resp_send(
        req,
        reinterpret_cast<const char*>(fb->buf),
        fb->len
    );

    esp_camera_fb_return(fb);

    return result;
}

// -------------------- MJPEG STREAM --------------------------

static esp_err_t stream_handler(httpd_req_t* req) {
    esp_err_t result = httpd_resp_set_type(
        req,
        STREAM_CONTENT_TYPE
    );

    if (result != ESP_OK) {
        return result;
    }

    httpd_resp_set_hdr(
        req,
        "Access-Control-Allow-Origin",
        "*"
    );

    httpd_resp_set_hdr(
        req,
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

    Serial.println("MJPEG client connected");

    while (true) {
        camera_fb_t* fb = esp_camera_fb_get();

        if (!fb) {
            Serial.println("Camera frame capture failed");

            result = ESP_FAIL;
            break;
        }

        if (fb->format != PIXFORMAT_JPEG) {
            esp_camera_fb_return(fb);

            Serial.println("Camera frame is not JPEG");

            result = ESP_FAIL;
            break;
        }

        char partHeader[96];

        int headerLength = snprintf(
            partHeader,
            sizeof(partHeader),
            STREAM_PART,
            (unsigned int)fb->len
        );

        result = httpd_resp_send_chunk(
            req,
            STREAM_BOUNDARY,
            strlen(STREAM_BOUNDARY)
        );

        if (result == ESP_OK) {
            result = httpd_resp_send_chunk(
                req,
                partHeader,
                headerLength
            );
        }

        if (result == ESP_OK) {
            result = httpd_resp_send_chunk(
                req,
                reinterpret_cast<const char*>(fb->buf),
                fb->len
            );
        }

        // Always release the camera frame buffer.
        esp_camera_fb_return(fb);

        if (result != ESP_OK) {
            Serial.println("MJPEG client disconnected");
            break;
        }

        // Yield briefly to allow Wi-Fi and other tasks to run.
        delay(10);
    }

    return result;
}

// ============================================================
// START HTTP SERVERS
// ============================================================

static void startCameraServer() {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();

    config.server_port = 80;
    config.ctrl_port = 32768;
    config.max_uri_handlers = 8;
    config.lru_purge_enable = true;

    httpd_uri_t indexUri = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = index_handler,
        .user_ctx = nullptr
    };

    httpd_uri_t statusUri = {
        .uri = "/status",
        .method = HTTP_GET,
        .handler = status_handler,
        .user_ctx = nullptr
    };

    httpd_uri_t captureUri = {
        .uri = "/capture",
        .method = HTTP_GET,
        .handler = capture_handler,
        .user_ctx = nullptr
    };

    if (httpd_start(&camera_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(camera_httpd, &indexUri);
        httpd_register_uri_handler(camera_httpd, &statusUri);
        httpd_register_uri_handler(camera_httpd, &captureUri);

        Serial.println("Camera HTTP server started on port 80");
    } else {
        Serial.println("ERROR: Could not start camera HTTP server");
    }

    config.server_port = 81;
    config.ctrl_port = 32769;

    httpd_uri_t streamUri = {
        .uri = "/stream",
        .method = HTTP_GET,
        .handler = stream_handler,
        .user_ctx = nullptr
    };

    if (httpd_start(&stream_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(stream_httpd, &streamUri);

        Serial.println("MJPEG stream server started on port 81");
    } else {
        Serial.println("ERROR: Could not start stream server");
    }
}

// ============================================================
// CAMERA IMAGE SETTINGS
// ============================================================

static void configureCameraSensor() {
    sensor_t* sensor = esp_camera_sensor_get();

    if (!sensor) {
        Serial.println("ERROR: Could not obtain camera sensor");
        return;
    }

    Serial.printf(
        "Camera sensor PID: 0x%04X\n",
        sensor->id.PID
    );

    // JPEG quality: lower value means higher image quality.
    sensor->set_quality(sensor, 10);

    // Keep the stream at QVGA initially.
    sensor->set_framesize(sensor, FRAMESIZE_QVGA);

    // Automatic white balance.
    sensor->set_whitebal(sensor, 1);
    sensor->set_awb_gain(sensor, 1);

    // Automatic exposure and gain.
    sensor->set_exposure_ctrl(sensor, 1);
    sensor->set_gain_ctrl(sensor, 1);

    // Conservative image appearance adjustments.
    sensor->set_brightness(sensor, 0);
    sensor->set_contrast(sensor, 0);
    sensor->set_saturation(sensor, 0);

    // Image correction features.
    sensor->set_lenc(sensor, 1);
    sensor->set_raw_gma(sensor, 1);
    sensor->set_bpc(sensor, 1);
    sensor->set_wpc(sensor, 1);

    Serial.println("Camera image settings applied");
}

// ============================================================
// SETUP
// ============================================================

void setup() {
    Serial.begin(115200);
    Serial.setDebugOutput(false);

    delay(1000);

    Serial.println();
    Serial.println("======================================");
    Serial.println(" WeedGuard ESP32-CAM");
    Serial.println(" AI-Thinker camera firmware");
    Serial.println("======================================");

    // -------------------- CAMERA CONFIG ---------------------

    camera_config_t config = {};

    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;

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

    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;

    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;

    config.xclk_freq_hz = 20000000;

    config.pixel_format = PIXFORMAT_JPEG;

    // Conservative resolution for reliable MJPEG streaming.
    config.frame_size = FRAMESIZE_QVGA;

    // Higher JPEG quality than the previous setting of 12.
    config.jpeg_quality = 10;

    // Use PSRAM if detected.
    config.fb_count = psramFound() ? 2 : 1;

    config.grab_mode = CAMERA_GRAB_LATEST;

    config.fb_location = psramFound()
        ? CAMERA_FB_IN_PSRAM
        : CAMERA_FB_IN_DRAM;

    Serial.printf(
        "PSRAM: %s\n",
        psramFound() ? "FOUND" : "NOT FOUND"
    );

    // -------------------- INITIALIZE CAMERA -----------------

    esp_err_t err = esp_camera_init(&config);

    if (err != ESP_OK) {
        Serial.printf(
            "ERROR: Camera initialization failed: 0x%x\n",
            err
        );

        Serial.println(
            "Check board selection, camera ribbon and stable 5V power."
        );

        while (true) {
            delay(1000);
        }
    }

    configureCameraSensor();

    // -------------------- WIFI ------------------------------

    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.setHostname(CAMERA_HOSTNAME);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("Connecting to Wi-Fi");

    unsigned long startTime = millis();

    while (
        WiFi.status() != WL_CONNECTED &&
        millis() - startTime < 30000
    ) {
        delay(500);
        Serial.print(".");
    }

    Serial.println();

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println(
            "ERROR: Wi-Fi connection failed. Check SSID and password."
        );

        return;
    }

    Serial.println("Wi-Fi connected");

    Serial.print("Camera IP: ");
    Serial.println(WiFi.localIP());

    // -------------------- MDNS ------------------------------

    if (MDNS.begin(CAMERA_HOSTNAME)) {
        MDNS.addService("http", "tcp", 80);

        Serial.println(
            "mDNS available at http://weedguard-cam.local/"
        );
    } else {
        Serial.println("mDNS initialization failed");
    }

    // -------------------- START SERVERS ---------------------

    startCameraServer();

    Serial.println();
    Serial.println("Camera ready");
    Serial.println("Status:  http://<camera-ip>/status");
    Serial.println("Capture: http://<camera-ip>/capture");
    Serial.println("Stream:  http://<camera-ip>:81/stream");
    Serial.println("======================================");
}

// ============================================================
// MAIN LOOP
// ============================================================

void loop() {
    delay(1000);
}