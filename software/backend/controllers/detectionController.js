const esp32Service = require("../services/esp32Service");
const sessionService = require("../services/sessionService");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// ==========================================
// Detection cooldown
// ==========================================
let lastDetectionTime = 0;

const DETECTION_COOLDOWN = 4000;

// ==========================================
// Latest detection information
// ==========================================
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

    // ==========================================
    // Validate required fields
    // ==========================================
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

    // ==========================================
    // Validate label
    // ==========================================
    if (label !== "weed") {
        return res.status(400).json({
            success: false,
            message: "Invalid detection label"
        });
    }

    // ==========================================
    // Validate confidence
    // ==========================================
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

    // ==========================================
    // Detection cooldown
    // Prevent duplicate detections
    // ==========================================
    const currentTime = Date.now();

    if (
        currentTime - lastDetectionTime <
        DETECTION_COOLDOWN
    ) {

        console.log("⏳ Detection ignored due to cooldown");

        return res.status(429).json({
            success: false,
            message: "Detection ignored due to cooldown"
        });
    }

    lastDetectionTime = currentTime;

    // ==========================================
    // Normalize timestamp
    // ==========================================
    const detectionTimestamp =
        new Date(timestamp);

    if (Number.isNaN(detectionTimestamp.getTime())) {
        return res.status(400).json({
            success: false,
            message: "Invalid timestamp"
        });
    }

    const isoTimestamp =
        detectionTimestamp.toISOString();

    // ==========================================
    // Store latest detection
    // ==========================================
    lastDetection = {
        label: "weed",
        confidence: confidence,
        timestamp: isoTimestamp,
        frame_id: frame_id,
        modelVersion: modelVersion || "YOLOv8"
    };

    // ==========================================
    // Save detection to logs.json
    // ==========================================
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

            logs = data
                ? JSON.parse(data)
                : [];

            if (!Array.isArray(logs)) {
                logs = [];
            }
        }

    } catch (error) {

        console.error(
            "❌ Failed to read logs.json:",
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

        console.log(
            "📝 AI detection saved to logs.json"
        );

    } catch (error) {

        console.error(
            "❌ Failed to write logs.json:",
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

        console.log(
            "📊 AI detection added to current session"
        );

    } catch (error) {

        console.error(
            "❌ Session update failed:",
            error.message
        );
    }

    // ==========================================
    // Trigger cutter
    // ==========================================
    try {

        const cutterResponse =
            await esp32Service.relay("on");

        console.log("🔪 Cutter activated");

        console.log(
            "ESP32 response:",
            cutterResponse
        );

    } catch (error) {

        console.error(
            "❌ Failed to activate cutter:",
            error.message
        );
    }

    // ==========================================
    // Console information
    // ==========================================
    console.log(
        "✅ Weed detection accepted"
    );

    console.log(
        "Confidence:",
        confidence
    );

    console.log(
        "Frame ID:",
        frame_id
    );

    console.log(
        "Model:",
        modelVersion || "YOLOv8"
    );

    // ==========================================
    // Response
    // ==========================================
    return res.json({
        success: true,
        message: "Weed detection logged successfully",
        detection: lastDetection
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
// GET /api/detection/stream
//
// Proxies the live ESP32-S3-CAM/MJPEG stream
// to the frontend.
//
// .env:
// CAMERA_STREAM_URL=http://ESP32_CAMERA_IP/stream
// ==========================================
exports.getDetectionStream = async (req, res) => {

    console.log("📹 Camera stream requested");

    const cameraStreamUrl =
        process.env.CAMERA_STREAM_URL;

    // ==========================================
    // Check camera URL
    // ==========================================
    if (!cameraStreamUrl) {

        return res.status(503).json({
            success: false,
            message:
                "Camera stream URL is not configured"
        });
    }

    try {

        console.log(
            "📡 Connecting to camera:",
            cameraStreamUrl
        );

        const response = await axios.get(
            cameraStreamUrl,
            {
                responseType: "stream",
                timeout: 10000
            }
        );

        // ==========================================
        // Forward content type
        // ==========================================
        if (response.headers["content-type"]) {

            res.setHeader(
                "Content-Type",
                response.headers["content-type"]
            );

        } else {

            res.setHeader(
                "Content-Type",
                "multipart/x-mixed-replace"
            );
        }

        // ==========================================
        // Prevent caching
        // ==========================================
        res.setHeader(
            "Cache-Control",
            "no-cache, no-store, must-revalidate"
        );

        res.setHeader(
            "Pragma",
            "no-cache"
        );

        res.setHeader(
            "Connection",
            "keep-alive"
        );

        // ==========================================
        // Pipe camera stream
        // ==========================================
        response.data.pipe(res);

        // ==========================================
        // Camera stream error
        // ==========================================
        response.data.on(
            "error",
            (error) => {

                console.error(
                    "❌ Camera stream error:",
                    error.message
                );

                if (!res.headersSent) {

                    res.status(502).json({
                        success: false,
                        message:
                            "Camera stream connection failed"
                    });

                } else {

                    res.end();
                }
            }
        );

        // ==========================================
        // Frontend disconnected
        // ==========================================
        req.on(
            "close",
            () => {

                console.log(
                    "📴 Camera stream client disconnected"
                );

                if (
                    response.data &&
                    typeof response.data.destroy === "function"
                ) {
                    response.data.destroy();
                }
            }
        );

    } catch (error) {

        console.error(
            "❌ Unable to connect to camera:",
            error.message
        );

        if (!res.headersSent) {

            return res.status(502).json({
                success: false,
                message:
                    "Unable to connect to camera stream"
            });
        }
    }
};