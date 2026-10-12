const esp32Service = require("../services/esp32Service");
const sessionService = require("../services/sessionService");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getIp } = require("../services/mdnsDiscovery");

// Camera configuration
const CAMERA_HOSTNAME = process.env.CAMERA_HOSTNAME || "weedguard-cam";
const AUTOMATIC_CUTTING_ENABLED =
    process.env.ENABLE_AUTOMATIC_CUTTING === "true";

// Detection cooldown
let lastDetectionTime = 0;
const DETECTION_COOLDOWN = 4000;

// Cutter duration
const WEED_CUT_DURATION_MS = 3000;

// Latest detection
let lastDetection = null;


// ==========================================
// POST /api/detection/weed
// Receives detection from YOLO / AI system
// ==========================================
exports.handleWeedDetection = async (req, res) => {
    console.log("🌿 Weed detection received");

    const {
        label,
        confidence,
        timestamp,
        frame_id,
        modelVersion
    } = req.body;

    // Validate required fields
    if (
        !label ||
        confidence === undefined ||
        !timestamp ||
        frame_id === undefined
    ) {
        return res.status(400).json({
            success: false,
            message: "Missing required detection data"
        });
    }

    // Validate label
    if (label !== "weed") {
        return res.status(400).json({
            success: false,
            message: "Invalid detection label"
        });
    }

    // Validate confidence
    if (
        typeof confidence !== "number" ||
        confidence < 0 ||
        confidence > 1
    ) {
        return res.status(400).json({
            success: false,
            message: "Confidence must be between 0 and 1"
        });
    }

    // Validate timestamp
    const detectionTimestamp = new Date(timestamp);

    if (Number.isNaN(detectionTimestamp.getTime())) {
        return res.status(400).json({
            success: false,
            message: "Invalid timestamp"
        });
    }

    const isoTimestamp = detectionTimestamp.toISOString();

    // Prevent duplicate detections
    const currentTime = Date.now();

    if (currentTime - lastDetectionTime < DETECTION_COOLDOWN) {
        return res.status(429).json({
            success: false,
            message: "Detection ignored due to cooldown"
        });
    }

    lastDetectionTime = currentTime;

    // Store latest detection
    lastDetection = {
        label: "weed",
        confidence: confidence,
        timestamp: isoTimestamp,
        frame_id: frame_id,
        modelVersion: modelVersion || "YOLOv8"
    };

    // Detection log file
    const logFile = path.join(
        __dirname,
        "../data/logs.json"
    );

    const logEntry = {
        time: isoTimestamp,
        status: "Weed detected",
        moisture: null,
        confidence: confidence,
        frame_id: frame_id,
        modelVersion: modelVersion || "YOLOv8",
        source: "ai-vision"
    };

    let logs = [];

    try {
        if (fs.existsSync(logFile)) {
            const data = fs.readFileSync(
                logFile,
                "utf8"
            );

            logs = data ? JSON.parse(data) : [];

            if (!Array.isArray(logs)) {
                logs = [];
            }
        }
    } catch (error) {
        console.error(
            "Failed to read logs.json:",
            error.message
        );

        logs = [];
    }

    logs.unshift(logEntry);

    // Keep maximum 100 logs
    if (logs.length > 100) {
        logs = logs.slice(0, 100);
    }

    try {
        fs.writeFileSync(
            logFile,
            JSON.stringify(logs, null, 2)
        );

        console.log("AI detection saved to logs.json");
    } catch (error) {
        console.error(
            "Failed to write logs.json:",
            error.message
        );
    }
        // ==========================================
    // Update current session
    // ==========================================
    try {
        sessionService.recordDetection({
            weed: true,
            moisture: null
        });

        console.log("AI detection added to current session");
    } catch (error) {
        console.error(
            "Session update failed:",
            error.message
        );
    }

    // ==========================================
    // Automatic cutting safety
    // ==========================================
    let cutterTriggered = false;

    let cutterMessage =
        "Automatic cutting is disabled; detection was logged only.";

    if (AUTOMATIC_CUTTING_ENABLED) {
        try {
            const robotStatus = await esp32Service.status();

            if (robotStatus.mode !== "autonomous") {
                cutterMessage =
                    "Automatic cutting skipped because the robot is not in autonomous mode.";

            } else if (
                robotStatus.avoiding ||
                robotStatus.obstacle
            ) {
                cutterMessage =
                    "Automatic cutting skipped during obstacle avoidance.";

            } else {
                const cutResponse =
                    await esp32Service.weedDetected(
                        WEED_CUT_DURATION_MS
                    );

                cutterTriggered = true;

                cutterMessage =
                    "ESP32 accepted the weed-cut command.";

                console.log(
                    "Weed-cut sequence requested:",
                    cutResponse
                );
            }
        } catch (error) {
            cutterMessage =
                "Automatic cutting safety check failed: " +
                error.message;

            console.error(
                "Automatic cutting safety check failed:",
                error.message
            );
        }
    }

    // ==========================================
    // Detection information
    // ==========================================
    console.log("Weed detection accepted");
    console.log("Confidence:", confidence);
    console.log("Frame ID:", frame_id);
    console.log("Model:", modelVersion || "YOLOv8");

    // ==========================================
    // Response
    // ==========================================
    return res.json({
        success: true,
        message: "Weed detection logged successfully",
        detection: lastDetection,
        cutterTriggered,
        cutterMessage
    });
};


// ==========================================
// GET /api/detection/status
// Returns latest YOLO detection
// ==========================================
exports.getDetectionStatus = (req, res) => {
    return res.json({
        success: true,
        detection: lastDetection
    });
};
// ==========================================
// SHARED UPSTREAM MJPEG STREAM PROXY
// ==========================================
// Multiplexes the single ESP32-CAM MJPEG stream across multiple consumers
// (browser dashboard, multiple tabs, and Python YOLO detection pipeline)
// to prevent starving the single-threaded ESP32-CAM stream listener.

let activeUpstreamStream = null;
let isConnectingUpstream = false;
let upstreamContentType = "multipart/x-mixed-replace; boundary=frame";
const activeStreamClients = new Set();

function resolveCameraStreamUrl() {
    if (process.env.CAMERA_STREAM_URL) {
        try {
            return new URL(process.env.CAMERA_STREAM_URL).toString();
        } catch (e) {
            return process.env.CAMERA_STREAM_URL;
        }
    }

    const discoveredIp = getIp(CAMERA_HOSTNAME, undefined);
    if (discoveredIp) {
        return `http://${discoveredIp}:81/stream`;
    }

    return null;
}

async function connectSharedUpstream() {
    if (activeUpstreamStream || isConnectingUpstream || activeStreamClients.size === 0) {
        return;
    }

    const cameraStreamUrl = resolveCameraStreamUrl();
    if (!cameraStreamUrl) {
        console.error("Camera stream URL could not be resolved");
        return;
    }

    isConnectingUpstream = true;
    console.log("Connecting shared camera stream to:", cameraStreamUrl);

    try {
        const response = await axios.get(cameraStreamUrl, {
            responseType: "stream",
            timeout: 8000,
            headers: {
                Accept: "multipart/x-mixed-replace, image/jpeg"
            },
            validateStatus: status => status >= 200 && status < 300
        });

        activeUpstreamStream = response.data;
        isConnectingUpstream = false;

        if (response.headers["content-type"]) {
            upstreamContentType = response.headers["content-type"];
        }

        console.log("Shared camera stream connected to ESP32-CAM");

        activeUpstreamStream.on("data", chunk => {
            for (const clientRes of activeStreamClients) {
                if (!clientRes.writableEnded && !clientRes.destroyed) {
                    clientRes.write(chunk);
                }
            }
        });

        const handleUpstreamClose = () => {
            if (activeUpstreamStream) {
                activeUpstreamStream.removeAllListeners();
                activeUpstreamStream = null;
            }
            isConnectingUpstream = false;
            console.log("Shared camera stream upstream closed");

            if (activeStreamClients.size > 0) {
                setTimeout(connectSharedUpstream, 1000);
            }
        };

        activeUpstreamStream.on("end", handleUpstreamClose);
        activeUpstreamStream.on("error", err => {
            console.error("Shared camera stream upstream error:", err.message);
            handleUpstreamClose();
        });

    } catch (error) {
        isConnectingUpstream = false;
        activeUpstreamStream = null;
        console.error("Failed to connect shared camera stream:", error.message);

        if (activeStreamClients.size > 0) {
            setTimeout(connectSharedUpstream, 2000);
        }
    }
}

exports.getDetectionStream = (req, res) => {
    console.log(`Camera stream client connected (total active: ${activeStreamClients.size + 1})`);

    res.status(200);
    res.setHeader("Content-Type", upstreamContentType);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    activeStreamClients.add(res);

    res.on("close", () => {
        activeStreamClients.delete(res);
        console.log(`Camera stream client disconnected (remaining: ${activeStreamClients.size})`);

        if (activeStreamClients.size === 0 && activeUpstreamStream) {
            console.log("All camera stream clients disconnected; closing upstream stream");
            activeUpstreamStream.destroy();
            activeUpstreamStream = null;
        }
    });

    connectSharedUpstream();
};
// ==========================================
// GET /api/detection/capture
// Returns a single JPEG image from ESP32-CAM
// ==========================================
exports.getDetectionCapture = async (req, res) => {
    try {
        let cameraUrl;

        if (process.env.CAMERA_STREAM_URL) {
            const streamUrl = new URL(
                process.env.CAMERA_STREAM_URL
            );

            // The ESP32-CAM serves captures on port 80.
            streamUrl.port = "80";
            streamUrl.pathname = "/capture";
            streamUrl.search = "";

            cameraUrl = streamUrl.toString();

        } else {
            const discoveredIp = getIp(
                CAMERA_HOSTNAME,
                undefined
            );

            if (!discoveredIp) {
                return res.status(503).json({
                    success: false,
                    message: "Camera not discovered yet"
                });
            }

            cameraUrl =
                `http://${discoveredIp}/capture`;
        }

        console.log(
            "Requesting camera capture:",
            cameraUrl
        );

        const upstream = await axios.get(
            cameraUrl,
            {
                responseType: "stream",
                timeout: 8000
            }
        );

        res.setHeader(
            "Content-Type",
            upstream.headers["content-type"] ||
            "image/jpeg"
        );

        res.setHeader(
            "Cache-Control",
            "no-cache, no-store, must-revalidate"
        );

        upstream.data.pipe(res);

        // Clean up if the browser disconnects.
        res.on("close", () => {
            if (!upstream.data.destroyed) {
                upstream.data.destroy();
            }
        });

        upstream.data.on("error", error => {
            console.error(
                "Camera capture stream error:",
                error.message
            );

            if (!res.writableEnded) {
                res.destroy(error);
            }
        });

    } catch (error) {
        console.error(
            "Camera capture failed:",
            error.message
        );

        if (!res.headersSent) {
            return res.status(502).json({
                success: false,
                message:
                    `Camera capture failed: ${error.message}`
            });
        }

        if (!res.writableEnded) {
            res.end();
        }
    }
};