// ============================================================
// WEEDGUARD CAMERA FEED
// ESP32-S3 + OV5640
// Corrected direct MJPEG stream version
// ============================================================

(function () {

    // Prevent duplicate script execution
    if (window.__WEEDGUARD_CAMERA_FEED_LOADED__) {
        console.warn(
            "WeedGuard camera-feed.js already loaded; skipping duplicate instance."
        );
        return;
    }

    window.__WEEDGUARD_CAMERA_FEED_LOADED__ = true;


    // ============================================================
    // ESP32 CAMERA
    // ============================================================

    const ESP32_CAMERA_IP = "192.168.152.161";

    const ESP32_STREAM_URL =
        "http://192.168.152.161/stream";


    // ============================================================
    // YOLO DETECTION API
    // ============================================================

    const DETECTION_STATUS_URL =
        "/api/detection/status";

    const DETECTION_POLL_MS =
        2500;


    // ============================================================
    // TIMERS
    // ============================================================

    let detectionTimer = null;
    let clockTimer = null;


    // ============================================================
    // CLOCK
    // ============================================================

    function updateClock() {

        const clock =
            document.getElementById("clock");

        if (!clock) {
            return;
        }

        clock.textContent =
            new Date().toLocaleTimeString(
                "en-IN",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            );
    }


    // ============================================================
    // CAMERA LIVE
    // ============================================================

    function setCameraLive() {

        const chip =
            document.getElementById("stream-chip");

        const frame =
            document.getElementById("frame-state");

        const device =
            document.getElementById("device-status-text");

        const badge =
            document.getElementById("sys-badge");

        const dot =
            document.getElementById("device-dot");

        const error =
            document.getElementById("camera-error");


        if (chip) {
            chip.textContent = "LIVE";
            chip.className =
                "panel-chip clear-chip";
        }

        if (frame) {
            frame.textContent = "● LIVE";
        }

        if (device) {
            device.textContent =
                "Connected · Live";
        }

        if (badge) {
            badge.textContent =
                "● Camera Online";

            badge.className =
                "sys-badge online";
        }

        if (dot) {
            dot.style.background =
                "#35b86b";
        }

        if (error) {
            error.style.display =
                "none";
        }
    }


    // ============================================================
    // CAMERA CONNECTING
    // ============================================================

    function setCameraConnecting() {

        const chip =
            document.getElementById("stream-chip");

        const frame =
            document.getElementById("frame-state");

        const device =
            document.getElementById("device-status-text");

        const badge =
            document.getElementById("sys-badge");


        if (chip) {
            chip.textContent =
                "CONNECTING";

            chip.className =
                "panel-chip stream-chip";
        }

        if (frame) {
            frame.textContent =
                "CONNECTING...";
        }

        if (device) {
            device.textContent =
                "Connecting...";
        }

        if (badge) {
            badge.textContent =
                "● Connecting";

            badge.className =
                "sys-badge refreshing";
        }
    }


    // ============================================================
    // CAMERA OFFLINE
    // ============================================================

    function setCameraOffline() {

        const chip =
            document.getElementById("stream-chip");

        const frame =
            document.getElementById("frame-state");

        const device =
            document.getElementById("device-status-text");

        const badge =
            document.getElementById("sys-badge");

        const error =
            document.getElementById("camera-error");


        if (chip) {
            chip.textContent =
                "OFFLINE";

            chip.className =
                "panel-chip stream-chip";
        }

        if (frame) {
            frame.textContent =
                "NO SIGNAL";
        }

        if (device) {
            device.textContent =
                "Camera unavailable";
        }

        if (badge) {
            badge.textContent =
                "● Camera Offline";

            badge.className =
                "sys-badge refreshing";
        }

        if (error) {
            error.style.display =
                "block";
        }
    }


    // ============================================================
    // START ESP32 CAMERA STREAM
    // ============================================================

    function startCameraStream() {

        const camera =
            document.getElementById(
                "camera-stream"
            );


        if (!camera) {

            console.error(
                "ERROR: camera-stream element not found"
            );

            return;
        }


        console.log(
            "===================================="
        );

        console.log(
            "WEEDGUARD ESP32 CAMERA"
        );

        console.log(
            "ESP32 IP:",
            ESP32_CAMERA_IP
        );

        console.log(
            "STREAM:",
            ESP32_STREAM_URL
        );

        console.log(
            "===================================="
        );


        setCameraConnecting();


        // --------------------------------------------------------
        // ESP32-S3 sends MJPEG.
        // Therefore use the IMG element directly.
        // --------------------------------------------------------

        camera.onload =
            function () {

                console.log(
                    "CAMERA STREAM CONNECTED"
                );

                setCameraLive();
            };


        camera.onerror =
            function () {

                console.error(
                    "CAMERA STREAM ERROR:",
                    ESP32_STREAM_URL
                );

                setCameraOffline();
            };


        // IMPORTANT:
        // Direct connection to the working ESP32 stream.
        camera.src =
            ESP32_STREAM_URL;
    }


    // ============================================================
    // REFRESH CAMERA
    // ============================================================

    function refreshCameraFeed() {

        console.log(
            "Refreshing ESP32 camera..."
        );


        const camera =
            document.getElementById(
                "camera-stream"
            );


        if (!camera) {
            return;
        }


        setCameraConnecting();


        // Close current stream
        camera.src =
            "about:blank";


        // Reconnect
        setTimeout(
            function () {

                startCameraStream();

            },
            200
        );
    }


    // ============================================================
    // DETECTION STATUS
    // ============================================================

    async function loadDetectionStatus() {

        try {

            const response =
                await fetch(
                    DETECTION_STATUS_URL,
                    {
                        method: "GET",

                        cache: "no-store",

                        headers: {
                            "Accept":
                                "application/json"
                        }
                    }
                );


            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );
            }


            const data =
                await response.json();


            console.log(
                "YOLO DATA:",
                data
            );


            const status =
                String(
                    data.status || ""
                ).toLowerCase();


            if (
                status.includes("weed")
            ) {

                updateWeedDetection({

                    confidence:
                        data.confidence,

                    frame_id:
                        data.frame_id ??
                        data.frameId,

                    timestamp:
                        data.time ??
                        data.timestamp

                });

            }
            else {

                updateClearDetection();

            }

        }
        catch (error) {

            // Detection failure must not stop the camera.
            console.warn(
                "YOLO API unavailable:",
                error.message
            );
        }
    }


    // ============================================================
    // CLEAR DETECTION
    // ============================================================

    function updateClearDetection() {

        const chip =
            document.getElementById(
                "detection-chip"
            );

        const state =
            document.getElementById(
                "detection-state"
            );

        const icon =
            document.getElementById(
                "detection-icon"
            );

        const headline =
            document.getElementById(
                "detection-headline"
            );

        const description =
            document.getElementById(
                "detection-description"
            );

        const confidence =
            document.getElementById(
                "confidence-value"
            );

        const percent =
            document.getElementById(
                "confidence-percent"
            );

        const fill =
            document.getElementById(
                "confidence-fill"
            );

        const overlay =
            document.getElementById(
                "detection-overlay"
            );

        const overlayLabel =
            document.getElementById(
                "overlay-label"
            );


        if (chip) {

            chip.textContent =
                "CLEAR";

            chip.className =
                "panel-chip clear-chip";
        }


        if (state) {

            state.className =
                "detection-state clear";
        }


        if (icon) {

            icon.textContent =
                "✔";
        }


        if (headline) {

            headline.textContent =
                "No Weed Detected";
        }


        if (description) {

            description.textContent =
                "YOLOv8 is monitoring the camera feed.";
        }


        if (confidence) {

            confidence.textContent =
                "--";
        }


        if (percent) {

            percent.textContent =
                "0%";
        }


        if (fill) {

            fill.style.width =
                "0%";
        }


        if (overlay) {

            overlay.className =
                "detection-overlay clear";
        }


        if (overlayLabel) {

            overlayLabel.textContent =
                "CLEAR";
        }


        const latest =
            document.getElementById(
                "latest-event"
            );


        if (latest) {

            latest.className =
                "latest-event";


            latest.innerHTML = `

                <span class="event-icon">
                    ℹ
                </span>

                <div>

                    <strong>
                        Waiting for a YOLOv8 detection
                    </strong>

                    <p>
                        Detection events will appear here.
                    </p>

                </div>

            `;
        }
    }


    // ============================================================
    // WEED DETECTED
    // ============================================================

    function updateWeedDetection(
        detection
    ) {

        let confidence =
            Number(
                detection.confidence
            );


        if (!Number.isFinite(confidence)) {

            confidence = 0;
        }


        // Convert 0.92 → 92
        if (
            confidence > 0 &&
            confidence <= 1
        ) {

            confidence *= 100;
        }


        confidence =
            Math.max(
                0,
                Math.min(
                    100,
                    confidence
                )
            );


        const chip =
            document.getElementById(
                "detection-chip"
            );

        const state =
            document.getElementById(
                "detection-state"
            );

        const icon =
            document.getElementById(
                "detection-icon"
            );

        const headline =
            document.getElementById(
                "detection-headline"
            );

        const description =
            document.getElementById(
                "detection-description"
            );


        if (chip) {

            chip.textContent =
                "WEED DETECTED";

            chip.className =
                "panel-chip weed-chip";
        }


        if (state) {

            state.className =
                "detection-state weed";
        }


        if (icon) {

            icon.textContent =
                "⚠";
        }


        if (headline) {

            headline.textContent =
                "Weed Detected!";
        }


        if (description) {

            description.textContent =
                "YOLOv8 detected a weed in the camera frame.";
        }


        // --------------------------------------------------------
        // Confidence
        // --------------------------------------------------------

        const confidenceValue =
            document.getElementById(
                "confidence-value"
            );

        const confidencePercent =
            document.getElementById(
                "confidence-percent"
            );

        const confidenceFill =
            document.getElementById(
                "confidence-fill"
            );


        if (confidenceValue) {

            confidenceValue.textContent =
                confidence.toFixed(1) +
                "%";
        }


        if (confidencePercent) {

            confidencePercent.textContent =
                confidence.toFixed(1) +
                "%";
        }


        if (confidenceFill) {

            confidenceFill.style.width =
                confidence +
                "%";
        }


        // --------------------------------------------------------
        // Frame ID
        // --------------------------------------------------------

        const frameId =
            document.getElementById(
                "frame-id"
            );


        if (frameId) {

            frameId.textContent =
                detection.frame_id ??
                detection.frameId ??
                "--";
        }


        // --------------------------------------------------------
        // Detection time
        // --------------------------------------------------------

        const detectionTime =
            document.getElementById(
                "detection-time"
            );


        if (detectionTime) {

            const value =
                detection.timestamp ||
                detection.time;


            if (value) {

                detectionTime.textContent =
                    new Date(value)
                        .toLocaleTimeString(
                            "en-IN"
                        );

            }
            else {

                detectionTime.textContent =
                    "--";
            }
        }


        // --------------------------------------------------------
        // Camera overlay
        // --------------------------------------------------------

        const overlay =
            document.getElementById(
                "detection-overlay"
            );

        const overlayLabel =
            document.getElementById(
                "overlay-label"
            );


        if (overlay) {

            overlay.className =
                "detection-overlay weed";
        }


        if (overlayLabel) {

            overlayLabel.textContent =
                "WEED " +
                confidence.toFixed(0) +
                "%";
        }


        // --------------------------------------------------------
        // Latest AI event
        // --------------------------------------------------------

        const latest =
            document.getElementById(
                "latest-event"
            );


        if (latest) {

            latest.className =
                "latest-event weed-event";


            latest.innerHTML = `

                <span class="event-icon">
                    ⚠
                </span>

                <div>

                    <strong>
                        Weed detected by YOLOv8
                    </strong>

                    <p>
                        Confidence:
                        ${confidence.toFixed(1)}%
                        · Frame:
                        ${
                            detection.frame_id ??
                            detection.frameId ??
                            "--"
                        }
                    </p>

                </div>

            `;
        }
    }


    // ============================================================
    // INITIALIZE CAMERA PAGE
    // ============================================================

    function initializeCameraPage() {

        console.log(
            "======================================"
        );

        console.log(
            "WEEDGUARD CAMERA PAGE"
        );

        console.log(
            "ESP32:",
            ESP32_CAMERA_IP
        );

        console.log(
            "STREAM:",
            ESP32_STREAM_URL
        );

        console.log(
            "======================================"
        );


        // --------------------------------------------------------
        // Clock
        // --------------------------------------------------------

        updateClock();


        if (clockTimer) {

            clearInterval(
                clockTimer
            );
        }


        clockTimer =
            setInterval(
                updateClock,
                1000
            );


        // --------------------------------------------------------
        // Camera
        // --------------------------------------------------------

        startCameraStream();


        // --------------------------------------------------------
        // YOLO
        // --------------------------------------------------------

        loadDetectionStatus();


        if (detectionTimer) {

            clearInterval(
                detectionTimer
            );
        }


        detectionTimer =
            setInterval(
                loadDetectionStatus,
                DETECTION_POLL_MS
            );
    }


    // ============================================================
    // PAGE LOAD
    // ============================================================

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initializeCameraPage
        );

    }
    else {

        initializeCameraPage();

    }


    // ============================================================
    // REFRESH BUTTON
    // ============================================================

    window.refreshCameraFeed =
        refreshCameraFeed;


})();