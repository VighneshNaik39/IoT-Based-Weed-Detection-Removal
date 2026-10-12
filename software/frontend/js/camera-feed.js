// ============================================================
// WEEDGUARD CAMERA FEED
// AI-Thinker ESP32-CAM
// Corrected version
// ============================================================

(function () {
    "use strict";

    // Prevent duplicate initialization
    if (window.__WEEDGUARD_CAMERA_FEED_LOADED__) {
        console.warn("WeedGuard camera dashboard already loaded.");
        return;
    }

    window.__WEEDGUARD_CAMERA_FEED_LOADED__ = true;

    // ============================================================
    // CONFIGURATION
    // ============================================================

    // Camera IP is reported by the backend (/api/camera/status); nothing is hard-coded.
    const ESP32_CAMERA_IP = "unknown";

    // Camera video stream through the backend proxy
    const ESP32_STREAM_URL = "/api/camera/stream";

    // Camera status must also use the backend proxy.
    // We will add this endpoint in the backend code.
    const CAMERA_STATUS_URL = "/api/camera/status";

    // YOLO detection status endpoint
    const DETECTION_STATUS_URL = "/api/detection/status";

    // Refresh intervals
    const DETECTION_POLL_MS = 2500;
    const CAMERA_STATUS_POLL_MS = 5000;

    // Timers
    let clockTimer = null;
    let detectionTimer = null;
    let cameraStatusTimer = null;
    let cameraCheckTimer = null;

    // ============================================================
    // HTML ELEMENT HELPERS
    // ============================================================

    function getElement(id) {
        return document.getElementById(id);
    }

    // IMPORTANT:
    // The correct HTML image ID is camera-stream,
    // not camera-feed.
    function getCameraElement() {
        return getElement("camera-stream");
    }

    // ============================================================
    // CLOCK
    // ============================================================

    function updateClock() {
        const clock = getElement("clock");

        if (!clock) {
            return;
        }

        clock.textContent = new Date().toLocaleTimeString(
            "en-IN",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );
    }

    // ============================================================
    // CAMERA STATUS DISPLAY
    // ============================================================

    function setCameraLive() {
        const chip = getElement("stream-chip");
        const frame = getElement("frame-state");
        const device = getElement("device-status-text");
        const badge = getElement("sys-badge");
        const dot = getElement("device-dot");
        const error = getElement("camera-error");

        if (chip) {
            chip.textContent = "LIVE";
            chip.className = "panel-chip clear-chip";
        }

        if (frame) {
            frame.textContent = "● LIVE";
        }

        if (device) {
            device.textContent = "Connected - Live";
        }

        if (badge) {
            badge.textContent = "● Camera Online";
            badge.className = "sys-badge online";
        }

        if (dot) {
            dot.style.background = "#35b86b";
        }

        if (error) {
            error.style.display = "none";
        }
    }

    function setCameraConnecting() {
        const chip = getElement("stream-chip");
        const frame = getElement("frame-state");
        const device = getElement("device-status-text");
        const badge = getElement("sys-badge");

        if (chip) {
            chip.textContent = "CONNECTING";
            chip.className = "panel-chip stream-chip";
        }

        if (frame) {
            frame.textContent = "CONNECTING...";
        }

        if (device) {
            device.textContent = "Connecting...";
        }

        if (badge) {
            badge.textContent = "● Connecting";
            badge.className = "sys-badge refreshing";
        }
    }

    function setCameraOffline() {
        const chip = getElement("stream-chip");
        const frame = getElement("frame-state");
        const device = getElement("device-status-text");
        const badge = getElement("sys-badge");
        const dot = getElement("device-dot");
        const error = getElement("camera-error");

        if (chip) {
            chip.textContent = "OFFLINE";
            chip.className = "panel-chip stream-chip";
        }

        if (frame) {
            frame.textContent = "NO SIGNAL";
        }

        if (device) {
            device.textContent = "Camera unavailable";
        }

        if (badge) {
            badge.textContent = "● Camera Offline";
            badge.className = "sys-badge offline";
        }

        if (dot) {
            dot.style.background = "#d9534f";
        }

        if (error) {
            error.style.display = "block";
        }
    }

    // ============================================================
    // END OF PART 1
    // PART 2 WILL ADD CAMERA STREAM CONNECTION AND STATUS CHECKS.
    // ============================================================
        // ============================================================
    // CAMERA STREAM CONNECTION
    // ============================================================

    function connectCamera() {
    const camera = getCameraElement();

    if (!camera) {
        console.error("Camera element #camera-stream not found");
        setCameraOffline();
        return;
    }

    console.log("Connecting to WeedGuard camera stream...");
    setCameraConnecting();

    // Stop the previous connection check.
    if (cameraCheckTimer !== null) {
        clearInterval(cameraCheckTimer);
        cameraCheckTimer = null;
    }

    let connectionConfirmed = false;

    // Handle stream errors.
  camera.onerror = function (event) {
    console.error("Camera image error:", event);
    console.error("Camera stream URL:", camera.src);
  };

  camera.onload = function () {
    connectionConfirmed = true;
    setCameraLive();
  };

    // Detect when the browser receives a camera frame.
    function checkCameraImage() {
        if (
            (camera.naturalWidth > 0 && camera.naturalHeight > 0) ||
            (camera.clientWidth > 0 && camera.clientHeight > 0) ||
            camera.complete
        ) {
            connectionConfirmed = true;
            setCameraLive();
            return true;
        }

        return false;
    }

    // Check for the first frame.
    cameraCheckTimer = setInterval(function () {
        if (checkCameraImage()) {
            clearInterval(cameraCheckTimer);
            cameraCheckTimer = null;
        }
    }, 500);

    // Only set src if not already connected
    if (!camera.src || !camera.src.includes("/api/camera/stream")) {
        camera.src = "/api/camera/stream";
    }

    console.log("Camera stream URL:", camera.src);

    // Report if no frame arrives within 10 seconds.
    setTimeout(function () {
        if (checkCameraImage()) {
            return;
        }

        if (!connectionConfirmed) {
            console.warn(
                "No camera frame received yet. Check the Network tab."
            );
        }
    }, 10000);
}

    // ============================================================
    // RECONNECT CAMERA
    // ============================================================

    function reconnectCamera() {
        console.log(
            "Attempting to reconnect to ESP32-CAM..."
        );

        const camera = getCameraElement();
        if (camera) {
            camera.src = "/api/camera/stream?t=" + Date.now();
        }

        connectCamera();
    }

    // ============================================================
    // CAMERA STATUS THROUGH BACKEND
    // ============================================================

    async function refreshCameraStatus() {
        try {
            const response = await fetch(
                CAMERA_STATUS_URL,
                {
                    method: "GET",
                    cache: "no-store",
                    signal: AbortSignal.timeout(5000)
                }
            );

            if (!response.ok) {
                throw new Error(
                    "Camera status HTTP " +
                    response.status
                );
            }

            const data = await response.json();

            console.log(
                "Camera status:",
                data
            );

            const cameraStatus =
                getElement("camera-status");

            if (cameraStatus) {
                cameraStatus.textContent =
                    data.cameraConnected
                        ? "Connected"
                        : "Disconnected";
            }

            const cameraName =
                getElement("camera-name");

            if (cameraName && data.camera) {
                cameraName.textContent = data.camera;
            }

            const cameraIP =
                getElement("camera-ip");

            if (cameraIP) {
                cameraIP.textContent =
                    data.ip || ESP32_CAMERA_IP;
            }

            // A successful status response means the camera's
            // HTTP status endpoint is reachable through Express.
            if (data.cameraConnected === true) {
                console.log(
                    "ESP32-CAM status endpoint is reachable."
                );
                setCameraLive();
            }

        } catch (error) {
            console.warn(
                "Camera status unavailable:",
                error.message
            );

            // Do not mark the stream offline here.
            // The video stream can work even if the separate
            // status endpoint is unavailable.
        }
    }

    // ============================================================
    // PERIODIC CAMERA STATUS CHECK
    // ============================================================

    function startCameraStatusRefresh() {
        refreshCameraStatus();

        if (cameraStatusTimer !== null) {
            clearInterval(cameraStatusTimer);
        }

        cameraStatusTimer = setInterval(
            refreshCameraStatus,
            CAMERA_STATUS_POLL_MS
        );
    }

    // ============================================================
    // END OF PART 2
    // PART 3 WILL ADD YOLO DETECTION DISPLAY AND POLLING.
    // ============================================================
        // ============================================================
    // YOLO WEED DETECTION
    // ============================================================

    async function refreshDetectionStatus() {
        try {
            const response = await fetch(
                DETECTION_STATUS_URL,
                {
                    method: "GET",
                    cache: "no-store",
                    signal: AbortSignal.timeout(5000)
                }
            );

            if (!response.ok) {
                throw new Error(
                    "Detection API returned HTTP " +
                    response.status
                );
            }

            const data = await response.json();

            console.log(
                "YOLO detection status:",
                data
            );

            updateDetectionInformation(data);

        } catch (error) {
            console.warn(
                "Detection status unavailable:",
                error.message
            );
        }
    }

    // ============================================================
    // UPDATE DETECTION INFORMATION
    // ============================================================

    function updateDetectionInformation(data) {
        if (!data || typeof data !== "object") {
            return;
        }

        // Support responses such as:
        // { success: true, detection: {...} }
        // { status: "Weed detected", confidence: 0.92 }
        // { detection: null }

        const detection =
            data.detection &&
            typeof data.detection === "object"
                ? data.detection
                : data;

        // --------------------------------------------------------
        // DETECTION STATUS
        // --------------------------------------------------------

        const statusElement =
            getElement("detection-status");

        if (statusElement) {
            let status =
                detection.status ||
                detection.detectionStatus ||
                detection.message;

            if (!status && data.detection === null) {
                status = "Waiting for YOLOv8 detection";
            }

            if (status) {
                statusElement.textContent = status;
            }
        }

        // --------------------------------------------------------
        // WEED COUNT
        // --------------------------------------------------------

        const countElement =
            getElement("weeds-detected");

        if (countElement) {
            const count =
                detection.weedsDetected ??
                detection.weedCount ??
                detection.count;

            if (
                count !== undefined &&
                count !== null &&
                Number.isFinite(Number(count))
            ) {
                countElement.textContent = String(count);
            }
        }

        // --------------------------------------------------------
        // CONFIDENCE
        // --------------------------------------------------------

        const confidenceElement =
            getElement("detection-confidence");

        const confidenceBar =
            getElement("confidence-bar");

        if (confidenceElement) {
            let confidence =
                detection.confidence ??
                detection.averageConfidence;

            if (
                confidence !== undefined &&
                confidence !== null &&
                Number.isFinite(Number(confidence))
            ) {
                confidence = Number(confidence);

                // Convert decimal confidence to percentage.
                if (confidence >= 0 && confidence <= 1) {
                    confidence *= 100;
                }

                // Keep the value within 0–100%.
                confidence = Math.max(
                    0,
                    Math.min(100, confidence)
                );

                confidenceElement.textContent =
                    confidence.toFixed(1) + "%";

                if (confidenceBar) {
                    confidenceBar.style.width =
                        confidence + "%";
                }
            }
        }

        // --------------------------------------------------------
        // LAST DETECTION TIME
        // --------------------------------------------------------

        const timeElement =
            getElement("last-detection-time");

        if (timeElement) {
            const timestamp =
                detection.timestamp ||
                detection.lastDetectionTime ||
                detection.time;

            if (timestamp) {
                const date = new Date(timestamp);

                timeElement.textContent =
                    Number.isNaN(date.getTime())
                        ? String(timestamp)
                        : date.toLocaleTimeString("en-IN");
            }
        }

        // --------------------------------------------------------
        // FRAME ID
        // --------------------------------------------------------

        const frameElement =
            getElement("frame-id");

        if (frameElement) {
            const frameId =
                detection.frameId ??
                detection.frame_id;

            if (frameId !== undefined && frameId !== null) {
                frameElement.textContent = String(frameId);
            }
        }

        // --------------------------------------------------------
        // LATEST AI EVENT
        // --------------------------------------------------------

        const eventElement =
            getElement("latest-ai-event");

        if (eventElement) {
            const eventText =
                detection.event ||
                detection.status ||
                detection.message;

            if (eventText) {
                eventElement.textContent = eventText;
            }
        }

        // Log the complete response for debugging.
        console.log(
            "Updated WeedGuard detection display."
        );
    }

    // ============================================================
    // START PERIODIC DETECTION UPDATES
    // ============================================================

    function startDetectionUpdates() {
        refreshDetectionStatus();

        if (detectionTimer !== null) {
            clearInterval(detectionTimer);
        }

        detectionTimer = setInterval(
            refreshDetectionStatus,
            DETECTION_POLL_MS
        );
    }

    // ============================================================
    // END OF PART 3
    // PART 4 WILL INITIALIZE THE DASHBOARD AND BUTTONS.
    // ============================================================
        // ============================================================
    // CAMERA BUTTONS
    // ============================================================

    function setupCameraButtons() {

        // Refresh camera feed
        const refreshButton =
            getElement("refresh-camera");

        if (refreshButton) {
            refreshButton.addEventListener(
                "click",
                reconnectCamera
            );
        }

        // Reconnect camera
        const reconnectButton =
            getElement("reconnect-camera");

        if (reconnectButton) {
            reconnectButton.addEventListener(
                "click",
                reconnectCamera
            );
        }

        // Retry camera
        const retryButton =
            getElement("retry-camera");

        if (retryButton) {
            retryButton.addEventListener(
                "click",
                reconnectCamera
            );
        }

        // Refresh camera and detection status
        const refreshStatusButton =
            getElement("refresh-camera-status");

        if (refreshStatusButton) {
            refreshStatusButton.addEventListener(
                "click",
                function () {
                    refreshCameraStatus();
                    refreshDetectionStatus();
                }
            );
        }
    }

    // ============================================================
    // REFRESH CAMERA FEED
    // Used by the HTML refresh button
    // ============================================================

    function refreshCameraFeed() {
        reconnectCamera();
        refreshCameraStatus();
        refreshDetectionStatus();
    }

    // ============================================================
    // INITIALIZE DASHBOARD
    // ============================================================

    function initializeCameraDashboard() {

        console.log(
            "Initializing WeedGuard camera dashboard..."
        );

        // Start the clock
        updateClock();

        if (clockTimer !== null) {
            clearInterval(clockTimer);
        }

        clockTimer = setInterval(
            updateClock,
            1000
        );

        // Configure buttons
        setupCameraButtons();

        // Start camera
        connectCamera();

        // Start camera status polling
        startCameraStatusRefresh();

        // Start YOLO status polling
        startDetectionUpdates();

        console.log(
            "WeedGuard camera dashboard initialized."
        );
    }

    // ============================================================
    // WAIT FOR HTML TO LOAD
    // ============================================================

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            initializeCameraDashboard,
            { once: true }
        );

    } else {

        initializeCameraDashboard();

    }

    // ============================================================
    // CLEANUP TIMERS
    // ============================================================

    window.addEventListener(
        "beforeunload",
        function () {

            if (clockTimer !== null) {
                clearInterval(clockTimer);
            }

            if (detectionTimer !== null) {
                clearInterval(detectionTimer);
            }

            if (cameraStatusTimer !== null) {
                clearInterval(cameraStatusTimer);
            }

            if (cameraCheckTimer !== null) {
                clearInterval(cameraCheckTimer);
            }

        }
    );

    // ============================================================
    // EXPOSE FUNCTIONS TO THE HTML
    // ============================================================

    window.WeedGuardCamera = {

        connect: connectCamera,

        reconnect: reconnectCamera,

        refreshStatus: refreshCameraStatus,

        refreshDetection: refreshDetectionStatus

    };

    window.refreshCameraFeed = refreshCameraFeed;

    console.log(
        "WeedGuard camera-feed.js loaded successfully."
    );

})();