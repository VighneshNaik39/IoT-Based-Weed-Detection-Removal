#include "esp_camera.h"
#include <WiFi.h>
#include "esp_http_server.h"

// =====================================================
// WIFI
// =====================================================

const char* WIFI_SSID     = "meowww";
const char* WIFI_PASSWORD = "capital v";

// =====================================================
// AI THINKER ESP32-CAM
// OV5640
// =====================================================

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

// =====================================================
// HTTP
// =====================================================

httpd_handle_t camera_httpd = NULL;
httpd_handle_t stream_httpd = NULL;

// =====================================================
// WEB PAGE
// =====================================================

static const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>

<html>

<head>

<meta name="viewport"
      content="width=device-width,initial-scale=1">

<title>WeedGuard Camera</title>

<style>

body {
    background:#111;
    color:white;
    font-family:Arial;
    text-align:center;
}

h1 {
    margin:20px;
}

img {
    width:95%;
    max-width:640px;
    border:2px solid #444;
}

button {
    padding:12px 20px;
    margin:10px;
    font-size:18px;
}

</style>

</head>

<body>

<h1>WeedGuard OV5640</h1>

<img src="/stream">

<br>

<a href="/capture"
   target="_blank">

<button>
Capture
</button>

</a>

</body>

</html>
)rawliteral";

// =====================================================
// INDEX
// =====================================================

static esp_err_t index_handler(
    httpd_req_t *req
) {

    httpd_resp_set_type(
        req,
        "text/html"
    );

    return httpd_resp_send(
        req,
        INDEX_HTML,
        strlen(INDEX_HTML)
    );
}

// =====================================================
// STATUS
// =====================================================

static esp_err_t status_handler(
    httpd_req_t *req
) {

    sensor_t *sensor =
        esp_camera_sensor_get();

    String json = "{";

    json += "\"camera\":\"OV5640\",";
    json += "\"board\":\"AI Thinker ESP32-CAM\",";

    if (sensor != NULL) {

        json += "\"pid\":";
        json += String(sensor->id.PID);
        json += ",";
    }

    json += "\"width\":160,";
    json += "\"height\":120,";
    json += "\"wifi\":\"connected\",";
    json += "\"ip\":\"";
    json += WiFi.localIP().toString();
    json += "\"";

    json += "}";

    httpd_resp_set_type(
        req,
        "application/json"
    );

    return httpd_resp_send(
        req,
        json.c_str(),
        json.length()
    );
}

// =====================================================
// CAPTURE
// =====================================================

static esp_err_t capture_handler(
    httpd_req_t *req
) {

    camera_fb_t *fb =
        esp_camera_fb_get();

    if (!fb) {

        Serial.println(
            "CAPTURE FAILED"
        );

        httpd_resp_send_500(req);

        return ESP_FAIL;
    }

    Serial.print(
        "CAPTURE: "
    );

    Serial.print(fb->width);
    Serial.print("x");
    Serial.print(fb->height);

    Serial.print("  ");

    Serial.print(fb->len);

    Serial.println(
        " bytes"
    );

    httpd_resp_set_type(
        req,
        "image/jpeg"
    );

    httpd_resp_set_hdr(
        req,
        "Cache-Control",
        "no-cache"
    );

    esp_err_t result =
        httpd_resp_send(
            req,
            (const char*)fb->buf,
            fb->len
        );

    esp_camera_fb_return(fb);

    return result;
}

// =====================================================
// STREAM
// =====================================================

static esp_err_t stream_handler(
    httpd_req_t *req
) {

    camera_fb_t *fb = NULL;

    esp_err_t result = ESP_OK;

    char part_buf[64];

    const char* content_type =
        "multipart/x-mixed-replace;boundary=frame";

    const char* boundary =
        "\r\n--frame\r\n";

    const char* part =
        "Content-Type: image/jpeg\r\n"
        "Content-Length: %u\r\n\r\n";

    result =
        httpd_resp_set_type(
            req,
            content_type
        );

    if (result != ESP_OK)
        return result;

    while (true) {

        fb =
            esp_camera_fb_get();

        if (!fb) {

            Serial.println(
                "STREAM CAPTURE FAILED"
            );

            result = ESP_FAIL;

            break;
        }

        size_t header_len =
            snprintf(
                part_buf,
                sizeof(part_buf),
                part,
                fb->len
            );

        result =
            httpd_resp_send_chunk(
                req,
                boundary,
                strlen(boundary)
            );

        if (result == ESP_OK) {

            result =
                httpd_resp_send_chunk(
                    req,
                    part_buf,
                    header_len
                );
        }

        if (result == ESP_OK) {

            result =
                httpd_resp_send_chunk(
                    req,
                    (const char*)fb->buf,
                    fb->len
                );
        }

        esp_camera_fb_return(fb);

        if (result != ESP_OK)
            break;

        delay(30);
    }

    return result;
}

// =====================================================
// START SERVER
// =====================================================

void startCameraServer() {

    httpd_config_t config =
        HTTPD_DEFAULT_CONFIG();

    config.server_port = 80;

    httpd_uri_t index_uri = {
        .uri       = "/",
        .method    = HTTP_GET,
        .handler   = index_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t capture_uri = {
        .uri       = "/capture",
        .method    = HTTP_GET,
        .handler   = capture_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t status_uri = {
        .uri       = "/status",
        .method    = HTTP_GET,
        .handler   = status_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t stream_uri = {
        .uri       = "/stream",
        .method    = HTTP_GET,
        .handler   = stream_handler,
        .user_ctx  = NULL
    };

    if (
        httpd_start(
            &camera_httpd,
            &config
        ) == ESP_OK
    ) {

        httpd_register_uri_handler(
            camera_httpd,
            &index_uri
        );

        httpd_register_uri_handler(
            camera_httpd,
            &capture_uri
        );

        httpd_register_uri_handler(
            camera_httpd,
            &status_uri
        );

        httpd_register_uri_handler(
            camera_httpd,
            &stream_uri
        );
    }

    Serial.println(
        "CAMERA HTTP SERVER STARTED"
    );
}

// =====================================================
// SETUP
// =====================================================

void setup() {

    Serial.begin(115200);

    delay(2000);

    Serial.println();
    Serial.println(
        "================================"
    );
    Serial.println(
        "WEEDGUARD ESP32-CAM"
    );
    Serial.println(
        "AI THINKER + OV5640"
    );
    Serial.println(
        "================================"
    );

    // =================================================
    // CAMERA CONFIG
    // =================================================

    camera_config_t config;

    config.ledc_channel =
        LEDC_CHANNEL_0;

    config.ledc_timer =
        LEDC_TIMER_0;

    config.pin_d0 =
        Y2_GPIO_NUM;

    config.pin_d1 =
        Y3_GPIO_NUM;

    config.pin_d2 =
        Y4_GPIO_NUM;

    config.pin_d3 =
        Y5_GPIO_NUM;

    config.pin_d4 =
        Y6_GPIO_NUM;

    config.pin_d5 =
        Y7_GPIO_NUM;

    config.pin_d6 =
        Y8_GPIO_NUM;

    config.pin_d7 =
        Y9_GPIO_NUM;

    config.pin_xclk =
        XCLK_GPIO_NUM;

    config.pin_pclk =
        PCLK_GPIO_NUM;

    config.pin_vsync =
        VSYNC_GPIO_NUM;

    config.pin_href =
        HREF_GPIO_NUM;

    config.pin_sccb_sda =
        SIOD_GPIO_NUM;

    config.pin_sccb_scl =
        SIOC_GPIO_NUM;

    config.pin_pwdn =
        PWDN_GPIO_NUM;

    config.pin_reset =
        RESET_GPIO_NUM;

    config.xclk_freq_hz =
        20000000;

    config.pixel_format =
        PIXFORMAT_JPEG;

    // IMPORTANT
    // Start with 160x120

    config.frame_size =
        FRAMESIZE_VGA;

    config.jpeg_quality =
        12;

    config.fb_count =
        2;

    config.grab_mode =
        CAMERA_GRAB_WHEN_EMPTY;

    config.fb_location =
        CAMERA_FB_IN_PSRAM;

    // =================================================
    // CAMERA INIT
    // =================================================

    Serial.println(
        "Initializing OV5640..."
    );

    esp_err_t err =
        esp_camera_init(
            &config
        );

    if (err != ESP_OK) {

        Serial.print(
            "Camera initialization FAILED: 0x"
        );

        Serial.println(
            err,
            HEX
        );

        while (true) {
            delay(1000);
        }
    }

    Serial.println(
        "Camera initialized!"
    );

    // =================================================
    // SENSOR
    // =================================================

    sensor_t *sensor =
        esp_camera_sensor_get();

    if (sensor == NULL) {

        Serial.println(
            "Sensor ERROR"
        );

        while (true) {
            delay(1000);
        }
    }

    Serial.print(
        "Sensor PID: 0x"
    );

    Serial.println(
        sensor->id.PID,
        HEX
    );

    if (
        sensor->id.PID ==
        OV5640_PID
    ) {

        Serial.println(
            "OV5640 DETECTED!"
        );

    } else {

        Serial.println(
            "WARNING: OV5640 NOT DETECTED"
        );
    }

    // =================================================
    // TEST IMAGE
    // =================================================

    Serial.println(
        "Testing camera capture..."
    );

    camera_fb_t *fb =
        esp_camera_fb_get();

    if (!fb) {

        Serial.println(
            "TEST CAPTURE FAILED!"
        );

    } else {

        Serial.println(
            "TEST CAPTURE SUCCESS!"
        );

        Serial.print(
            "Resolution: "
        );

        Serial.print(
            fb->width
        );

        Serial.print("x");

        Serial.println(
            fb->height
        );

        Serial.print(
            "JPEG: "
        );

        Serial.print(
            fb->len
        );

        Serial.println(
            " bytes"
        );

        esp_camera_fb_return(fb);
    }

    // =================================================
    // WIFI
    // =================================================

    Serial.println(
        "Connecting WiFi..."
    );

    WiFi.setHostname(
        "weedguard-camera"
    );

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD
    );

    while (
        WiFi.status() != WL_CONNECTED
    ) {

        delay(500);

        Serial.print(".");
    }

    Serial.println();
    Serial.println(
        "WIFI CONNECTED"
    );

    Serial.print(
        "Camera IP: "
    );

    Serial.println(
        WiFi.localIP()
    );

    // =================================================
    // SERVER
    // =================================================

    startCameraServer();

    Serial.println();
    Serial.println(
        "================================"
    );

    Serial.print(
        "Camera URL: http://"
    );

    Serial.println(
        WiFi.localIP()
    );

    Serial.print(
        "Stream URL: http://"
    );

    Serial.print(
        WiFi.localIP()
    );

    Serial.println(
        "/stream"
    );

    Serial.print(
        "Capture URL: http://"
    );

    Serial.print(
        WiFi.localIP()
    );

    Serial.println(
        "/capture"
    );

    Serial.println(
        "================================"
    );
}

void loop() {

    delay(1000);
}