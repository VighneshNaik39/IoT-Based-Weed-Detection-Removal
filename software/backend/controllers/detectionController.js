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
let lastDetection = {
    label: null,
    confidence: null,
    timestamp: null,
    frame_id: null,
    modelVersion: "YOLOv8"
};

// ==========================================
// POST /api/detection/weed
// ==========================================
exports.handleWeedDetection = async (req, res) => {

    console.log("🌿 Weed detection received");

    const {
        label,
        confidence,
        timestamp,
        frame_id
    } = req.body;

    // ------------------------------------------
    // Validate required fields
    // ------------------------------------------
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

    // ------------------------------------------
    // Validate label
    // ------------------------------------------
    if (label !== "weed") {
        return res.status(400).json({
            success: false,
            message: "Invalid detection label"
        });
    }

    // ------------------------------------------
    // Validate confidence
    // ------------------------------------------
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

    // ------------------------------------------
    // 4-second cooldown
    // ------------------------------------------
    const currentTime = Date.now();

    if (
        currentTime - lastDetectionTime <
        DETECTION_COOLDOWN
    ) {
        return res.status(429).json({
            success: false,
            message: "Detection ignored due to cooldown"
        });
    }

    lastDetectionTime = currentTime;

    // ------------------------------------------
    // Store latest detection
    // ------------------------------------------
    lastDetection = {
        label: label,
        confidence: confidence,
        timestamp: timestamp,
        frame_id: frame_id,
        modelVersion: "YOLOv8"
    };

    // ------------------------------------------
    // Save detection to logs.json
    // ------------------------------------------
    const logFile = path.join(
        __dirname,
        "../data/logs.json"
    );

    const logEntry = {
        timestamp: timestamp,
        status: "Weed detected",
        confidence: confidence,
        frame_id: frame_id,
        source: "ai-vision"
    };

    let logs = [];

    if (fs.existsSync(logFile)) {

        const data = fs.readFileSync(
            logFile,
            "utf8"
        );

        logs = data ? JSON.parse(data) : [];
    }

    logs.push(logEntry);

    fs.writeFileSync(
        logFile,
        JSON.stringify(logs, null, 2)
    );

    // ------------------------------------------
    // Update current session
    // ------------------------------------------
    sessionService.recordDetection({
        weed: true,
        moisture: null
    });

    console.log(
        "📊 AI detection added to current session"
    );

    console.log(
        "📝 AI detection saved to logs.json"
    );

    // ------------------------------------------
    // Trigger cutter through ESP32 service
    // ------------------------------------------
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

    // ------------------------------------------
    // Console information
    // ------------------------------------------
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

    // ------------------------------------------
    // Send response
    // ------------------------------------------
    return res.json({
        success: true,
        message: "Weed detection logged successfully",
        data: logEntry
    });
};

// ==========================================
// GET /api/detection/status
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
// Proxies the live T-SIMCAM/MJPEG stream
// to the frontend.
//
// CAMERA_STREAM_URL should be defined in .env
// ==========================================
exports.getDetectionStream = async (req, res) => {

    console.log("📹 Camera stream requested");

    const cameraStreamUrl =
        process.env.CAMERA_STREAM_URL;

    // ------------------------------------------
    // Check camera URL configuration
    // ------------------------------------------
    if (!cameraStreamUrl) {

        return res.status(503).json({
            success: false,
            message: "Camera stream URL is not configured"
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

        // --------------------------------------
        // Forward camera content type
        // --------------------------------------
        if (response.headers["content-type"]) {

            res.setHeader(
                "Content-Type",
                response.headers["content-type"]
            );

        } else {

            // Default MJPEG content type
            res.setHeader(
                "Content-Type",
                "multipart/x-mixed-replace"
            );

        }

        // --------------------------------------
        // Prevent caching
        // --------------------------------------
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

        // --------------------------------------
        // Pipe camera stream to frontend
        // --------------------------------------
        response.data.pipe(res);

        // --------------------------------------
        // Handle camera stream errors
        // --------------------------------------
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

        // --------------------------------------
        // Client disconnected
        // --------------------------------------
        req.on("close", () => {

            console.log(
                "📴 Camera stream client disconnected"
            );

            if (response.data.destroy) {
                response.data.destroy();
            }

        });

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