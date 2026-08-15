// ==========================================
// MEMBER 2 - PHASE 5 CAMERA FEED
// Uses detection helpers from api.js
// ==========================================

const DETECTION_POLL_MS = 2500;
const CLEAR_AFTER_MS = 7000;


// ==========================================
// STATE
// ==========================================

let lastAcceptedDetectionAt = 0;
let streamLoaded = false;


// ==========================================
// CLOCK
// ==========================================

function tickCameraClock() {
    const el = document.getElementById("clock");

    if (el) {
        el.textContent = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }
}


// ==========================================
// FORMAT DETECTION TIME
// ==========================================

function formatDetectionTime(value) {

    if (!value) {
        return "--";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "--";
    }

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}


// ==========================================
// CONFIDENCE
// Backend normally sends 0..1
// Also supports 0..100
// ==========================================

function confidencePercent(value) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return 0;
    }

    const pct = n <= 1 ? n * 100 : n;

    return Math.max(
        0,
        Math.min(100, pct)
    );
}


// ==========================================
// SYSTEM STATUS
// ==========================================

function setSystemStatus(online, text) {

    const badge =
        document.getElementById("sys-badge");

    const dot =
        document.getElementById("device-dot");

    const deviceText =
        document.getElementById("device-status-text");


    // System badge
    if (badge) {

        badge.textContent =
            online
                ? "● System Online"
                : "● Backend Offline";

        badge.className =
            online
                ? "sys-badge online"
                : "sys-badge refreshing";
    }


    // Device dot
    if (dot) {

        dot.style.background =
            online
                ? "var(--green-400)"
                : "var(--red-600)";
    }


    // Device text
    if (deviceText) {

        deviceText.textContent =
            text ||
            (
                online
                    ? "Connected · Live"
                    : "Disconnected"
            );
    }
}


// ==========================================
// DETECTION UI
// ==========================================

function setDetectionUI(detection) {

    const chip =
        document.getElementById("detection-chip");

    const state =
        document.getElementById("detection-state");

    const overlay =
        document.getElementById("detection-overlay");

    const overlayLabel =
        document.getElementById("overlay-label");

    const icon =
        document.getElementById("detection-icon");

    const headline =
        document.getElementById("detection-headline");

    const description =
        document.getElementById("detection-description");

    const confidence =
        document.getElementById("confidence-value");

    const confidencePercentEl =
        document.getElementById("confidence-percent");

    const confidenceFill =
        document.getElementById("confidence-fill");

    const detectionTime =
        document.getElementById("detection-time");

    const frameId =
        document.getElementById("frame-id");

    const modelVersion =
        document.getElementById("model-version");

    const latestEvent =
        document.getElementById("latest-event");

    const backendStep =
        document.getElementById("backend-step");

    const cutterStep =
        document.getElementById("cutter-step");


    // ==========================================
    // Validate detection
    // ==========================================

    const hasDetection =
        detection &&
        detection.label === "weed" &&
        detection.timestamp;


    // ==========================================
    // Detection timestamp
    // ==========================================

    const detectedAt =
        hasDetection
            ? new Date(
                detection.timestamp
              ).getTime()
            : NaN;


    // ==========================================
    // Check freshness
    // ==========================================

    const age =
        Number.isFinite(detectedAt)
            ? Date.now() - detectedAt
            : Infinity;


    const fresh =
        Number.isFinite(detectedAt) &&
        age >= 0 &&
        age <= CLEAR_AFTER_MS;


    const weedDetected =
        hasDetection && fresh;


    // ==========================================
    // Confidence
    // ==========================================

    const pct =
        confidencePercent(
            detection?.confidence
        );


    // ==========================================
    // Common detection information
    // ==========================================

    if (confidence) {

        confidence.textContent =
            detection?.confidence != null
                ? `${pct.toFixed(1)}%`
                : "--";
    }


    if (confidencePercentEl) {

        confidencePercentEl.textContent =
            detection?.confidence != null
                ? `${pct.toFixed(1)}%`
                : "--";
    }


    if (confidenceFill) {

        confidenceFill.style.width =
            `${pct}%`;
    }


    if (detectionTime) {

        detectionTime.textContent =
            formatDetectionTime(
                detection?.timestamp
            );
    }


    if (frameId) {

        frameId.textContent =
            detection?.frame_id != null
                ? String(detection.frame_id)
                : "--";
    }


    if (modelVersion) {

        modelVersion.textContent =
            detection?.modelVersion ||
            "YOLOv8";
    }


    // ==========================================
    // WEED DETECTED
    // ==========================================

    if (weedDetected) {

        lastAcceptedDetectionAt =
            detectedAt;


        // Status chip
        if (chip) {

            chip.textContent =
                "WEED DETECTED";

            chip.className =
                "panel-chip weed-chip";
        }


        // Detection state
        if (state) {

            state.className =
                "detection-state weed";
        }


        // Camera overlay
        if (overlay) {

            overlay.className =
                "detection-overlay weed";
        }


        if (overlayLabel) {

            overlayLabel.textContent =
                `WEED ${pct.toFixed(0)}%`;
        }


        // Icon
        if (icon) {

            icon.textContent = "⚠";
        }


        // Headline
        if (headline) {

            headline.textContent =
                "Weed Detected!";
        }


        // Description
        if (description) {

            description.textContent =
                "YOLOv8 confirmed a weed. Backend cutter trigger requested.";
        }


        // Backend pipeline
        if (backendStep) {

            backendStep.classList.add(
                "success"
            );
        }


        // Cutter pipeline
        if (cutterStep) {

            cutterStep.classList.add(
                "success"
            );
        }


        // Latest event
        if (latestEvent) {

            latestEvent.className =
                "latest-event weed-event";

            latestEvent.innerHTML = `
                <span class="event-icon">⚠</span>

                <div>
                    <strong>Weed detected by YOLOv8</strong>

                    <p>
                        Confidence ${pct.toFixed(1)}% ·
                        Frame ${detection.frame_id ?? "--"} ·
                        ${formatDetectionTime(
                            detection.timestamp
                        )}
                    </p>
                </div>
            `;
        }

        return;
    }


    // ==========================================
    // CLEAR / NO FRESH DETECTION
    // ==========================================

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


    if (overlay) {

        overlay.className =
            "detection-overlay clear";
    }


    if (overlayLabel) {

        overlayLabel.textContent =
            "CLEAR";
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


    // Backend is no longer actively detecting
    if (backendStep) {

        backendStep.classList.remove(
            "success"
        );
    }


    if (cutterStep) {

        cutterStep.classList.remove(
            "success"
        );
    }


    // ==========================================
    // Latest event
    // ==========================================

    if (latestEvent) {

        latestEvent.className =
            "latest-event clear-event";

        if (lastAcceptedDetectionAt) {

            latestEvent.innerHTML = `
                <span class="event-icon">✔</span>

                <div>
                    <strong>Monitoring — no active weed detection</strong>

                    <p>
                        Last detection:
                        ${formatDetectionTime(
                            detection?.timestamp
                        )}
                    </p>
                </div>
            `;

        } else {

            latestEvent.innerHTML = `
                <span class="event-icon">✔</span>

                <div>
                    <strong>Waiting for YOLOv8 detection</strong>

                    <p>
                        Detection events will appear here.
                    </p>
                </div>
            `;
        }
    }
}


// ==========================================
// LOAD DETECTION STATUS
// ==========================================

async function loadDetectionStatus() {

    try {

        const result =
            await getDetectionStatus();


        if (
            !result ||
            result.success === false
        ) {
            throw new Error(
                "Invalid detection status response"
            );
        }


        const detection =
            result.detection || null;


        // Backend is working
        setSystemStatus(
            true,
            "Connected · Detection API"
        );


        // Update detection UI
        setDetectionUI(
            detection
        );

    } catch (error) {

        console.warn(
            "Camera Feed: detection status unavailable:",
            error.message
        );


        // Backend offline
        setSystemStatus(
            false,
            "Backend unavailable"
        );


        // Detection chip
        const chip =
            document.getElementById(
                "detection-chip"
            );

        if (chip) {

            chip.textContent =
                "OFFLINE";

            chip.className =
                "panel-chip weed-chip";
        }


        // Detection state
        const state =
            document.getElementById(
                "detection-state"
            );

        if (state) {

            state.className =
                "detection-state clear";
        }


        // Camera overlay
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
                "detection-overlay offline";
        }


        if (overlayLabel) {

            overlayLabel.textContent =
                "OFFLINE";
        }


        // Backend pipeline
        const backendStep =
            document.getElementById(
                "backend-step"
            );

        if (backendStep) {

            backendStep.classList.remove(
                "success"
            );
        }


        // Cutter pipeline
        const cutterStep =
            document.getElementById(
                "cutter-step"
            );

        if (cutterStep) {

            cutterStep.classList.remove(
                "success"
            );
        }
    }
}


// ==========================================
// CAMERA STREAM STATE
// ==========================================

function setStreamState(loaded) {

    const chip =
        document.getElementById(
            "stream-chip"
        );

    const placeholder =
        document.getElementById(
            "camera-placeholder"
        );

    const frameState =
        document.getElementById(
            "frame-state"
        );


    streamLoaded = loaded;


    if (loaded) {

        if (chip) {

            chip.textContent =
                "LIVE";

            chip.className =
                "panel-chip clear-chip";
        }


        if (placeholder) {

            placeholder.classList.add(
                "hidden"
            );
        }


        if (frameState) {

            frameState.textContent =
                "● Live stream";
        }

    } else {

        if (chip) {

            chip.textContent =
                "NO SIGNAL";

            chip.className =
                "panel-chip weed-chip";
        }


        if (placeholder) {

            placeholder.classList.remove(
                "hidden"
            );
        }


        if (frameState) {

            frameState.textContent =
                "Camera unavailable";
        }
    }
}


// ==========================================
// REFRESH CAMERA FEED
// ==========================================

function refreshCameraFeed() {

    const img =
        document.getElementById(
            "camera-stream"
        );


    if (!img) {
        return;
    }


    setStreamState(false);


    // Cache-busting
    img.src =
        `${getDetectionStreamUrl()}?t=${Date.now()}`;


    // Refresh detection status
    loadDetectionStatus();
}


// ==========================================
// PAGE INITIALIZATION
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const img =
            document.getElementById(
                "camera-stream"
            );


        // ======================================
        // Camera stream events
        // ======================================

        if (img) {

            img.addEventListener(
                "load",
                () => {
                    setStreamState(true);
                }
            );


            img.addEventListener(
                "error",
                () => {
                    setStreamState(false);
                }
            );
        }


        // ======================================
        // Clock
        // ======================================

        tickCameraClock();

        setInterval(
            tickCameraClock,
            1000
        );


        // ======================================
        // Initial detection check
        // ======================================

        loadDetectionStatus();


        // ======================================
        // Poll detection every 2.5 seconds
        // ======================================

        setInterval(
            loadDetectionStatus,
            DETECTION_POLL_MS
        );
    }
);