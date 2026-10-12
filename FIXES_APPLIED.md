# WeedGuard Correction Log

## Step-by-Step Issues Identified and Fixed

### 1. Camera Stream and Status Dynamic Resolution (`software/backend/server.js`)
- **Issue**: `/api/camera/stream` and `/api/camera/status` used a hardcoded IP (`10.200.254.161`) and bypassed mDNS discovery and `CAMERA_STREAM_URL` configured in `.env`.
- **Fix**: Replaced with dynamic resolution via `resolveCameraIp()`, querying mDNS discovery (`weedguard-cam.local`) and falling back to `CAMERA_STREAM_URL` / `ESP32_CAMERA_IP`. Delegated `/api/camera/stream` to `detectionController.getDetectionStream` so the dashboard and AI scripts use the same streaming handler.

### 2. Frontend Detection Status DOM Elements Mismatch (`software/frontend/js/camera-feed.js`)
- **Issue**: `handleDetectionStatus()` referenced obsolete element IDs (`weeds-detected`, `detection-confidence`, `confidence-bar`, `last-detection-time`, `latest-ai-event`) that did not exist in `pages/camera-feed.html`, preventing the AI detection display from ever updating.
- **Fix**: Re-mapped to actual DOM element IDs (`detection-headline`, `detection-description`, `detection-chip`, `detection-state`, `detection-icon`, `confidence-value`, `confidence-percent`, `confidence-fill`, `detection-time`, `frame-id`, `latest-event`). Removed hardcoded IP fallback in favor of status API reporting.

### 3. Missing Robot Cutter Route (`software/backend/routes/robot.js`)
- **Issue**: The dashboard Robot Control page (`robot-control.js`) called `POST /api/robot/cutter` with `{ state: true | false }`. This route was missing from `routes/robot.js`, causing HTTP 404 errors when toggling the cutter.
- **Fix**: Added `router.post("/cutter", cutterController.setCutter)` to `routes/robot.js`, properly bridging frontend commands to the cutter controller.

### 4. Fabricated Battery Percentage and Missing Metric Updates (`software/frontend/index.html`, `js/api.js`)
- **Issue**: When `data.battery` was `null` (since battery telemetry is not implemented on hardware), the frontend defaulted to `80%` and displayed a hardcoded `80%` initial state. Furthermore, `fullRefresh()` in `index.html` never updated the `#kpi-removed` element from `data.weedsRemoved`.
- **Fix**: Updated both `index.html` and `api.js` to render `--` and a 0% progress bar when `battery` is null. Added `removedEl.innerText = data.weedsRemoved ?? "0"` in `fullRefresh()`.

### 5. Dataset Path Portability (`software/ai-vision/dataset/annotations.runtime.yaml`)
- **Issue**: `annotations.runtime.yaml` had a machine-specific absolute path (`path: D:\WeedGuard-Project\software\ai-vision\dataset\labeled`), causing training and YOLO CLI commands to fail if executed in any other path.
- **Fix**: Changed the dataset root in `annotations.runtime.yaml` to the portable relative path `./labeled`.

### 6. Sidebar Navigation Consistency (`software/frontend/pages/alerts.html`, `pages/camera-feed.html`)
- **Issue**: `alerts.html` had the `active` link class placed on the Dashboard item rather than the Alerts item. `camera-feed.html` placed the Camera Feed link above the `SYSTEM` section divider, inconsistent with all other pages.
- **Fix**: Set `class="nav-item active"` on Alerts in `alerts.html`. Relocated the Camera Feed navigation entry under the `SYSTEM` section in `camera-feed.html`.

### 7. Cleaned Invalid Arduino Firmware File (`hardware/ESP-32/phase 5/updated/updated.ino`)
- **Issue**: `updated.ino` was a leftover scratch file containing a 1-line curl command (`curl.exe http://localhost:5000/api/robot/status`), causing Arduino IDE/CLI compilation errors.
- **Fix**: Removed the invalid `updated.ino` and its directory.

### 8. Environment Configuration (`software/backend/.env`)
- **Issue**: Missing `.env` file upon clean extraction prevented the backend from configuring fallback IPs.
- **Fix**: Generated `software/backend/.env` with local fallbacks configured for `ESP32_IP` (`10.200.254.232`) and `CAMERA_STREAM_URL` (`http://10.200.254.161:81/stream`), while preserving safety default `ENABLE_AUTOMATIC_CUTTING=false`.

### 9. Camera Stream Multiplexing & Multi-Consumer Architecture (`software/backend/controllers/detectionController.js`)
- **Issue**: The AI-Thinker ESP32-CAM HTTP server runs a single-threaded blocking loop in `stream_handler` on port 81. When the browser opened `/api/camera/stream`, opening a second stream client (such as another browser tab or the Python YOLO script `detect_stream.py`) caused port 81 socket starvation, connection timeouts, and black video screens.
- **Fix**: Refactored `getDetectionStream` into a shared upstream stream multiplexer. The Express backend maintains a single persistent upstream connection to `http://<camera-ip>:81/stream` and broadcasts arriving MJPEG chunks to all connected client responses (`res` streams). The upstream stream connects automatically on first client and safely disconnects when all clients disconnect.

### 10. Frontend Stream Connection and CSS Containment (`software/frontend/js/camera-feed.js`, `css/camera-feed.css`, `pages/camera-feed.html`)
- **Issue**: `camera-feed.js` assigned `camera.src = "/api/camera/stream?t=" + Date.now()` on every page load despite the HTML `<img>` tag already specifying `src="/api/camera/stream"`, generating duplicate connection requests. Furthermore, `camera-feed.css` styled `.camera-stream` (class) whereas `camera-feed.html` used `<img id="camera-stream">` without the class, leaving the image unstyled and potentially collapsed.
- **Fix**: Updated `camera-feed.js` to avoid re-assigning `camera.src` on load if already pointing to `/api/camera/stream`. Added `#camera-stream` selector to CSS rules and added `class="camera-stream"` to the HTML image tag. Enhanced `reconnectCamera()` to force a timestamped reconnect only when the user explicitly clicks the "Refresh" button.

### 11. Replaced Unused Soil Moisture & Battery Indicators with Active Telemetry (`frontend`)
- **Context**: The physical robot build does not include a soil moisture probe or battery voltage divider ADC telemetry. Showing dead `--%` moisture and battery placeholders created visual clutter and confusion.
- **Fix**: Replaced the unused KPI cards on the main dashboard (`index.html`) with active system metrics: **AI Vision Model** (showing YOLOv8 status and latest detection confidence) and **Camera Stream** (live status and ESP32-CAM resolution/IP). In `robot-control.html`, replaced the battery indicator with **Cutter Relay** (`Ready / Active (GPIO 4)`). In `logs.html` and `analytics.html`, replaced moisture columns with **Confidence / Detail** and **Duration**.

### 12. Sidebar Device Status Indicator in Activity Logs (`software/frontend/js/logs.js`)
- **Issue**: In `pages/logs.html`, the sidebar device indicator displayed `ESP32 Module Connecting...` indefinitely because `logs.js` only fetched `/api/logs` and never checked `/api/status` or updated `#device-status-text` / `#device-dot`.
- **Fix**: Added `updateDeviceStatus()` to `logs.js` which polls `GET /api/status` and updates the indicator to `Connected` (green) when the backend / ESP32 is online and `Disconnected` (red) if offline.

### 13. Autonomous Mode False Disconnect and Waypoint Generation Error (`robotController.js`, `fieldService.js`, `robot-control.js`)
- **Issue**: Clicking "Autonomous" mode caused the robot to instantly display as `Disconnected` in the UI. When `origin` and `edge` coordinates in `data/field.json` were identical (or within < 0.5m), `generateAutonomousWaypoints` threw an unhandled error resulting in HTTP 500. `robot-control.js` caught this error and called `flashUnreachable()`, marking the healthy ESP32 as disconnected and disabling the UI controls.
- **Fix**:
  1. Updated `robot-control.js` `setMode()` error handling to display the rejection message in an alert rather than executing `flashUnreachable()`.
  2. Wrapped `fieldService.generateAutonomousWaypoints` in `robotController.mode` with try/catch returning a clear HTTP 409 explaining field configuration is needed.
  3. Added coordinate separation validation (`Math.hypot >= 0.5m`) in `fieldService.isConfigured()`.
  4. Configured valid field boundaries around the robot's live GPS fix (`12.85828267, 74.8500565`), generating 11 GPS waypoints successfully.

---



## Validation Performed

### Backend & API
- Loaded all 12 Express route modules, 8 controllers, and 6 service modules without error.
- Verified backend server endpoints on active port 5000:
  - `GET /api/data`: Returns HTTP 200 `{ "success": true, "message": "WeedGuard backend is running" }`.
  - `GET /api/camera/status`: Successfully reports camera online (`AI-Thinker ESP32-CAM`, `10.200.254.161`).
  - `GET /api/camera/stream`: Actively streams multipart MJPEG video (`200 OK`).
  - `GET /api/sessions`: Returns grouped historical and active sessions (e.g. Session #145).
  - `POST /api/detection/weed`: Correctly receives detections, saves to `logs.json`, and updates session detection counts.

### Hardware & Camera
- Verified snapshot capture directly from ESP32-CAM via `http://10.200.254.161/capture` (10.9 KB JPEG image verified).
- Confirmed live video feed streaming rendered in Microsoft Edge at `http://localhost:5000/pages/camera-feed.html`.

### AI Vision Pipeline (`detect_stream.py`)
- Verified YOLOv8 weed detection model (`software/ai-vision/models/yolov8_weed.pt`) loaded cleanly (`classes: {0: 'crop', 1: 'weed'}`).
- Executed `detect_stream.py` connected to live camera stream:
  - Successfully detected weeds at frame 9 (conf 0.50), frame 23 (conf 0.56), and frame 28 (conf 0.60).
  - Cooldown logic verified at frame 29 (4.0s debounce).
  - POST requests delivered to backend with HTTP 200 OK responses.
  - Live detection card on `camera-feed.html` updated with confidence percentage, timestamp, and frame ID.
