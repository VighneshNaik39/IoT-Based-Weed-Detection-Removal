// ============================================================
// WEEDGUARD - CAMERA FEED
// ESP32-S3 N16R8 + OV5640
// DIRECT MJPEG STREAM
// ============================================================


// ============================================================
// ESP32 CAMERA CONFIGURATION
// ============================================================

const ESP32_CAMERA_IP = "10.128.75.113";

const ESP32_STREAM_URL =
    `http://${ESP32_CAMERA_IP}:81/stream`;


// ============================================================
// DETECTION CONFIGURATION
// ============================================================

const DETECTION_API_URL =
    "/api/detection/status";

const DETECTION_POLL_MS =
    2500;


// ============================================================
// STATE
// ============================================================

let cameraConnected = false;

let lastDetection = null;

let detectionTimer = null;

let clockTimer = null;


// ============================================================
// CLOCK
// ============================================================

function tickCameraClock() {

    const clock =
        document.getElementById("clock");

    if (!clock) {
        return;
    }

    clock.textContent =
        new Date().toLocaleTimeString(
            "en-US",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );
}


// ============================================================
// CAMERA STATUS
// ============================================================

function setCameraStatus(
    connected
) {

    cameraConnected =
        connected;


    const streamChip =
        document.getElementById(
            "stream-chip"
        );

    const frameState =
        document.getElementById(
            "frame-state"
        );

    const deviceDot =
        document.getElementById(
            "device-dot"
        );

    const deviceStatus =
        document.getElementById(
            "device-status-text"
        );

    const streamUrl =
        document.getElementById(
            "stream-url"
        );

    const placeholder =
        document.getElementById(
            "camera-placeholder"
        );


    if (connected) {

        // ----------------------------------------
        // LIVE
        // ----------------------------------------

        if (streamChip) {

            streamChip.textContent =
                "LIVE";

            streamChip.className =
                "panel-chip clear-chip";
        }


        if (frameState) {

            frameState.textContent =
                "● Live stream";
        }


        if (deviceDot) {

            deviceDot.style.background =
                "var(--green-400)";
        }


        if (deviceStatus) {

            deviceStatus.textContent =
                "Connected · Live";
        }


        if (streamUrl) {

            streamUrl.textContent =
                `ESP32 · ${ESP32_CAMERA_IP}`;
        }


        if (placeholder) {

            placeholder.style.display =
                "none";
        }

    } else {

        // ----------------------------------------
        // CONNECTING / OFFLINE
        // ----------------------------------------

        if (streamChip) {

            streamChip.textContent =
                "CONNECTING";

            streamChip.className =
                "panel-chip stream-chip";
        }


        if (frameState) {

            frameState.textContent =
                "Connecting...";
        }


        if (deviceDot) {

            deviceDot.style.background =
                "var(--yellow-400)";
        }


        if (deviceStatus) {

            deviceStatus.textContent =
                "Connecting...";
        }


        if (streamUrl) {

            streamUrl.textContent =
                `ESP32 · ${ESP32_CAMERA_IP}`;
        }


        if (placeholder) {

            placeholder.style.display =
                "flex";
        }
    }
}


// ============================================================
// START ESP32 CAMERA STREAM
// ============================================================

function refreshCameraFeed() {

    const camera =
        document.getElementById(
            "camera-stream"
        );


    if (!camera) {

        console.error(
            "ERROR: #camera-stream not found"
        );

        return;
    }


    console.log(
        "================================"
    );

    console.log(
        "Starting ESP32 camera stream"
    );

    console.log(
        ESP32_STREAM_URL
    );

    console.log(
        "================================"
    );


    // ----------------------------------------
    // Show connecting state
    // ----------------------------------------

    setCameraStatus(
        false
    );


    // ----------------------------------------
    // Camera image settings
    // ----------------------------------------

    camera.style.display =
        "block";

    camera.style.width =
        "100%";

    camera.style.height =
        "100%";

    camera.style.objectFit =
        "contain";

    camera.style.background =
        "#000";


    // ----------------------------------------
    // Remove previous stream
    // ----------------------------------------

    camera.src = "";


    // Small delay prevents browser caching
    // and allows the old connection to close.

    setTimeout(
        function () {

            const url =
                `${ESP32_STREAM_URL}?t=${Date.now()}`;


            console.log(
                "Connecting:",
                url
            );


            camera.src =
                url;


            // ------------------------------------------------
            // IMPORTANT:
            //
            // MJPEG is a continuous HTTP stream.
            // Do NOT wait for img.onload to declare LIVE.
            // ------------------------------------------------

            setCameraStatus(
                true
            );

        },
        100
    );


    // ----------------------------------------
    // Stream error
    // ----------------------------------------

    camera.onerror =
        function () {

            console.error(
                "ESP32 camera stream ERROR"
            );


            setCameraStatus(
                false
            );
        };
}


// ============================================================
// DETECTION STATUS
// ============================================================

async function loadDetectionStatus() {

    try {

        const response =
            await fetch(
                DETECTION_API_URL,
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
            "Detection API:",
            data
        );


        updateDetectionUI(
            data
        );


    } catch (error) {

        console.warn(
            "Detection API unavailable:",
            error.message
        );


        // Camera can still be LIVE even
        // if detection backend is offline.

        setDetectionOffline();
    }
}


// ============================================================
// UPDATE DETECTION UI
// ============================================================

function updateDetectionUI(
    data
) {

    // --------------------------------------------------------
    // Try different possible backend formats
    // --------------------------------------------------------

    let detection =
        data?.detection ||
        data?.result ||
        data;


    if (
        detection &&
        detection.detection
    ) {

        detection =
            detection.detection;
    }


    lastDetection =
        detection;


    // --------------------------------------------------------
    // Determine weed state
    // --------------------------------------------------------

    const status =
        String(
            data?.status ||
            detection?.status ||
            detection?.label ||
            ""
        ).toLowerCase();


    const isWeed =
        status.includes("weed");


    // --------------------------------------------------------
    // Confidence
    // --------------------------------------------------------

    let confidence =
        Number(
            detection?.confidence ??
            data?.confidence ??
            0
        );


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


    // --------------------------------------------------------
    // Elements
    // --------------------------------------------------------

    const detectionChip =
        document.getElementById(
            "detection-chip"
        );

    const detectionState =
        document.getElementById(
            "detection-state"
        );

    const detectionIcon =
        document.getElementById(
            "detection-icon"
        );

    const detectionHeadline =
        document.getElementById(
            "detection-headline"
        );

    const detectionDescription =
        document.getElementById(
            "detection-description"
        );

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

    const frameId =
        document.getElementById(
            "frame-id"
        );

    const modelVersion =
        document.getElementById(
            "model-version"
        );

    const latestEvent =
        document.getElementById(
            "latest-event"
        );


    // ========================================================
    // WEED DETECTED
    // ========================================================

    if (isWeed) {

        if (detectionChip) {

            detectionChip.textContent =
                "WEED DETECTED";

            detectionChip.className =
                "panel-chip weed-chip";
        }


        if (detectionState) {

            detectionState.className =
                "detection-state weed";
        }


        if (detectionIcon) {

            detectionIcon.textContent =
                "⚠";
        }


        if (detectionHeadline) {

            detectionHeadline.textContent =
                "Weed Detected!";
        }


        if (detectionDescription) {

            detectionDescription.textContent =
                "YOLOv8 detected a weed in the camera frame.";
        }


        if (confidenceValue) {

            confidenceValue.textContent =
                `${confidence.toFixed(1)}%`;
        }


        if (confidencePercent) {

            confidencePercent.textContent =
                `${confidence.toFixed(1)}%`;
        }


        if (confidenceFill) {

            confidenceFill.style.width =
                `${confidence}%`;
        }


        if (frameId) {

            frameId.textContent =
                detection?.frame_id ??
                detection?.frameId ??
                data?.frame_id ??
                "--";
        }


        if (modelVersion) {

            modelVersion.textContent =
                detection?.modelVersion ||
                data?.model ||
                "YOLOv8";
        }


        if (latestEvent) {

            latestEvent.innerHTML = `
                <span class="event-icon">⚠</span>

                <div>

                    <strong>
                        Weed detected by YOLOv8
                    </strong>

                    <p>
                        Confidence:
                        ${confidence.toFixed(1)}%
                    </p>

                </div>
            `;

            latestEvent.className =
                "latest-event weed-event";
        }


        return;
    }


    // ========================================================
    // CLEAR
    // ========================================================

    if (detectionChip) {

        detectionChip.textContent =
            "CLEAR";

        detectionChip.className =
            "panel-chip clear-chip";
    }


    if (detectionState) {

        detectionState.className =
            "detection-state clear";
    }


    if (detectionIcon) {

        detectionIcon.textContent =
            "✓";
    }


    if (detectionHeadline) {

        detectionHeadline.textContent =
            "No Weed Detected";
    }


    if (detectionDescription) {

        detectionDescription.textContent =
            "YOLOv8 is monitoring the camera feed.";
    }


    if (confidenceValue) {

        confidenceValue.textContent =
            "--";
    }


    if (confidencePercent) {

        confidencePercent.textContent =
            "0%";
    }


    if (confidenceFill) {

        confidenceFill.style.width =
            "0%";
    }


    if (frameId) {

        frameId.textContent =
            "--";
    }


    if (modelVersion) {

        modelVersion.textContent =
            data?.model ||
            "YOLOv8";
    }


    if (latestEvent) {

        latestEvent.innerHTML = `
            <span class="event-icon">✓</span>

            <div>

                <strong>
                    Waiting for YOLOv8 detection
                </strong>

                <p>
                    Detection events will appear here.
                </p>

            </div>
        `;

        latestEvent.className =
            "latest-event clear-event";
    }
}


// ============================================================
// DETECTION API OFFLINE
// ============================================================

function setDetectionOffline() {

    const detectionChip =
        document.getElementById(
            "detection-chip"
        );

    const detectionHeadline =
        document.getElementById(
            "detection-headline"
        );

    const detectionDescription =
        document.getElementById(
            "detection-description"
        );


    if (detectionChip) {

        detectionChip.textContent =
            "OFFLINE";

        detectionChip.className =
            "panel-chip stream-chip";
    }


    if (detectionHeadline) {

        detectionHeadline.textContent =
            "Detection API Offline";
    }


    if (detectionDescription) {

        detectionDescription.textContent =
            "Camera stream can still operate independently.";
    }
}


// ============================================================
// SYSTEM STATUS
// ============================================================

function updateSystemStatus() {

    const badge =
        document.getElementById(
            "sys-badge"
        );


    if (!badge) {
        return;
    }


    if (cameraConnected) {

        badge.textContent =
            "● System Online";

        badge.className =
            "sys-badge online";

    } else {

        badge.textContent =
            "● Camera Offline";

        badge.className =
            "sys-badge refreshing";
    }
}


// ============================================================
// INITIALIZATION
// ============================================================

function initializeCameraPage() {

    console.log(
        "================================"
    );

    console.log(
        "WEEDGUARD CAMERA FEED"
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
        "================================"
    );


    // ----------------------------------------
    // Clock
    // ----------------------------------------

    tickCameraClock();


    if (clockTimer) {

        clearInterval(
            clockTimer
        );
    }


    clockTimer =
        setInterval(
            tickCameraClock,
            1000
        );


    // ----------------------------------------
    // Start camera
    // ----------------------------------------

    refreshCameraFeed();


    // ----------------------------------------
    // Detection
    // ----------------------------------------

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


    // ----------------------------------------
    // System status
    // ----------------------------------------

    updateSystemStatus();


    setInterval(
        updateSystemStatus,
        1000
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

} else {

    initializeCameraPage();
}