// ============================================================
// WEEDGUARD BACKEND
// ESP32 Robot + ESP32-CAM + Dashboard + Detection
// ============================================================

// Load environment variables
require("dotenv").config();

// ============================================================
// BUILT-IN MODULES
// ============================================================

const fs = require("fs");

const http = require("http");
const path = require("path");

// ============================================================
// EXTERNAL MODULES
// ============================================================

const express = require("express");
const cors = require("cors");

// ============================================================
// ROUTES
// ============================================================

const movementRoutes = require("./routes/movement");
const modeRoutes = require("./routes/mode");
const cutterRoutes = require("./routes/cutter");
const stopRoutes = require("./routes/stop");
const robotRoutes = require("./routes/robot");
const settingsRoutes = require("./routes/settings");
const logsRoutes = require("./routes/logs");
const apiContractRoutes = require("./routes/apiContract");
const detectionRoutes = require("./routes/detection");
const gpsRoutes = require("./routes/gps");
const fieldRoutes = require("./routes/field");

// ============================================================
// SERVICES
// ============================================================

const loggerService = require("./services/loggerService");
const sessionService = require("./services/sessionService");
const esp32Service = require("./services/esp32Service");
const mdnsDiscovery = require("./services/mdnsDiscovery");

// ============================================================
// EXPRESS APPLICATION
// ============================================================

const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

app.use(express.json());

// ============================================================
// CONFIGURATION
// ============================================================

// ESP32-CAM IP address
// Change this if the camera receives a different IP.

// No hard-coded IP: resolved via CAMERA_STREAM_URL, mDNS (weedguard-cam),
// or the optional ESP32_CAMERA_IP fallback in .env.
const { getIp } = require("./services/mdnsDiscovery");
const detectionController = require("./controllers/detectionController");

const CAMERA_HOSTNAME = process.env.CAMERA_HOSTNAME || "weedguard-cam";

function resolveCameraIp() {
    if (process.env.CAMERA_STREAM_URL) {
        try {
            return new URL(process.env.CAMERA_STREAM_URL).hostname;
        } catch (e) { /* fall through */ }
    }
    return getIp(
        CAMERA_HOSTNAME,
        (process.env.ESP32_CAMERA_IP || "").trim() || undefined
    );
}

// ESP32-CAM MJPEG stream port
const ESP32_CAMERA_PORT = 81;

// Camera stream endpoint
const ESP32_CAMERA_STREAM_PATH = "/stream";

// Robot connection timeout
const ESP32_TIMEOUT_MS = 15000;

// Backend port
const PORT = Number(process.env.PORT || 5000);

// ============================================================
// FRONTEND STATIC FILES
// ============================================================

app.use(
    express.static(
        path.join(__dirname, "../frontend")
    )
);

// ============================================================
// LOGGER SERVICE
// ============================================================

const { readLogs, writeLogs } = loggerService;

// ============================================================
// LIVE ROBOT DATA
// ============================================================

let latestData = {
    status: "No weed detected",
    moisture: null,
    battery: null,
    time: null
};

let lastDataReceivedAt = null;

// ============================================================
// ROBOT CONNECTION STATUS
// ============================================================

function isESP32Connected() {

    if (!lastDataReceivedAt) {
        return false;
    }

    return (
        Date.now() - lastDataReceivedAt <
        ESP32_TIMEOUT_MS
    );
}

// ============================================================
// DASHBOARD SESSION STATISTICS
// ============================================================

function localDateKey() {

    const now = new Date();

    return (
        `${now.getFullYear()}-` +
        `${String(now.getMonth() + 1).padStart(2, "0")}-` +
        `${String(now.getDate()).padStart(2, "0")}`
    );
}

let sessionStats = {
    scansToday: 0,
    scanDate: localDateKey()
};

// ============================================================
// ROBOT CONTROL STATE
// ============================================================

let control = {
    autoMode: true,
    removal: false
};
// ============================================================
// ESP32-CAM MJPEG STREAM PROXY
// ============================================================

// Same discovery/proxy logic as /api/detection/stream, so the dashboard
// and the YOLO script always reach the camera the same way.
app.get("/api/camera/stream", detectionController.getDetectionStream);

// ============================================================
// ESP32-CAM STATUS API
// ============================================================

app.get("/api/camera/status", (req, res) => {
    console.log("Checking ESP32-CAM status...");

    const cameraIp = resolveCameraIp();

    if (!cameraIp) {
        return res.status(503).json({
            success: false,
            cameraConnected: false,
            error: "Camera not discovered yet (mDNS) and no fallback configured"
        });
    }

    const cameraUrl = `http://${cameraIp}/status`;

    const cameraRequest = http.get(
        cameraUrl,
        {
            timeout: 5000
        },
        (cameraResponse) => {
            let body = "";

            cameraResponse.setEncoding("utf8");

            cameraResponse.on("data", (chunk) => {
                body += chunk;
            });

            cameraResponse.on("end", () => {
                if (cameraResponse.statusCode !== 200) {
                    return res.status(502).json({
                        success: false,
                        cameraConnected: false,
                        error: `ESP32-CAM returned HTTP ${cameraResponse.statusCode}`
                    });
                }

                try {
                    const cameraData = JSON.parse(body);

                    return res.status(200).json({
                        success: true,
                        cameraConnected: true,
                        camera: cameraData.board || "ESP32-CAM",
                        ip: cameraData.ip || cameraIp,
                        streamUrl: "/api/camera/stream"
                    });

                } catch (error) {
                    console.error(
                        "Invalid camera status response:",
                        error.message
                    );

                    return res.status(502).json({
                        success: false,
                        cameraConnected: false,
                        error: "Invalid JSON received from ESP32-CAM"
                    });
                }
            });
        }
    );

    cameraRequest.on("error", (error) => {
        console.error(
            "ESP32-CAM status request failed:",
            error.message
        );

        if (!res.headersSent) {
            res.status(502).json({
                success: false,
                cameraConnected: false,
                error: "Cannot connect to ESP32-CAM"
            });
        }
    });

    cameraRequest.on("timeout", () => {
        cameraRequest.destroy(
            new Error("ESP32-CAM status request timed out")
        );
    });
});
// ============================================================
// ROUTE REGISTRATION
// ============================================================

app.use("/api/move", movementRoutes);
app.use("/api/stop", stopRoutes);
app.use("/api/mode", modeRoutes);
app.use("/api/cutter", cutterRoutes);

app.use("/api/detection", detectionRoutes);
app.use("/api/gps", gpsRoutes);
app.use("/api/field", fieldRoutes);

app.use("/api/robot", robotRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/logs", logsRoutes);

app.use("/api", apiContractRoutes);

// ============================================================
// HOME PAGE
// ============================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "../frontend/index.html")
    );
});

// ============================================================
// BASIC API TEST
// ============================================================

app.get("/api/data", (req, res) => {

    res.json({
        success: true,
        message: "WeedGuard backend is running"
    });
});
// ============================================================
// ROBOT STATUS
// ============================================================

app.get("/api/status", async (req, res) => {

    const logs = readLogs();

    const newestLog =
        logs.length > 0 ? logs[0] : null;

    const newestLogTime = newestLog
        ? Date.parse(
            newestLog.time ||
            newestLog.timestamp ||
            ""
        )
        : NaN;

    const newestDetectionIsFresh =
        newestLog &&
        newestLog.source === "ai-vision" &&
        Number.isFinite(newestLogTime) &&
        Date.now() - newestLogTime < 15000;

    const currentData =
        newestDetectionIsFresh
            ? newestLog
            : latestData;

    let robotConnected = false;

    try {

        await esp32Service.ping();

        robotConnected = true;
        lastDataReceivedAt = Date.now();

    } catch (error) {

        robotConnected = isESP32Connected();
    }

    const currentSession =
        sessionService.getCurrentSession() || {};

    res.json({

        ...currentData,

        scansToday: sessionStats.scansToday,

        weedsDetected:
            currentSession.totalDetections || 0,

        // Removal is not independently verified.
        weedsRemoved: 0,
        removalCountVerified: false,

        battery: latestData.battery ?? null,

        esp32Connected: robotConnected

    });

});

// ============================================================
// GET RECENT SESSIONS
// ============================================================

app.get("/api/sessions", (req, res) => {

    const sessions =
        sessionService.getLatestSessions(5);

    res.json(sessions);

});

// ============================================================
// RESET ALL SESSIONS & LOGS (RESET TO 0)
// ============================================================

app.post("/api/sessions/reset", (req, res) => {
    try {
        // Start a fresh Session 1 and clear the persisted activity history.
        sessionService.resetAllSessions();
        sessionStats.scansToday = 0;
        sessionStats.scanDate = localDateKey();

        const logFile = path.join(__dirname, "data", "logs.json");
        fs.writeFileSync(logFile, "[]", "utf8");

        // Do not keep stale sensor/detection values visible after the reset.
        latestData = {
            status: "No weed detected",
            moisture: null,
            battery: null,
            time: null
        };
        lastDataReceivedAt = null;

        console.log("Sessions and logs successfully reset. New Session 1 is active.");
        return res.json({
            success: true,
            message: "Session history and logs cleared. Counters reset to 0; Session 1 started."
        });
    } catch (error) {
        console.error("Reset error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to reset sessions: " + error.message
        });
    }
});

// ============================================================
// RECORD DETECTION SCAN
// ============================================================

app.post("/api/detection/scan", (req, res) => {

    const today = localDateKey();

    if (sessionStats.scanDate !== today) {

        sessionStats.scansToday = 0;
        sessionStats.scanDate = today;

    }

    sessionStats.scansToday += 1;

    res.status(202).json({

        success: true,

        scansToday: sessionStats.scansToday

    });

});

// ============================================================
// RECEIVE DATA FROM ESP32
// ============================================================

app.post("/api/update", (req, res) => {

    const {
        weed,
        moisture,
        battery
    } = req.body;

    // Validate the weed detection value.
    if (typeof weed !== "boolean") {

        return res.status(400).json({

            success: false,

            error: "Invalid or missing weed value"

        });

    }

    // Update the last communication time.
    lastDataReceivedAt = Date.now();

    // Prepare current robot data.
    const data = {

        status: weed
            ? "Weed detected"
            : "No weed detected",

        moisture:
            typeof moisture === "number" &&
            Number.isFinite(moisture)
                ? moisture
                : null,

        battery:
            typeof battery === "number" &&
            Number.isFinite(battery) &&
            battery >= 0 &&
            battery <= 100
                ? battery
                : null,

        time: new Date().toISOString()

    };

    latestData = data;

    // Record detection in the current session.
    sessionService.recordDetection({

        weed: weed,

        moisture: moisture

    });

    // Save the ESP32 log.
    const logs = readLogs();

    logs.unshift(data);

    if (logs.length > 100) {
        logs.pop();
    }

    writeLogs(logs);

    console.log("📥 DATA RECEIVED:", data);

    res.json({

        success: true

    });

});

// ============================================================
// UPDATE DASHBOARD CONTROL STATE
// ============================================================

app.post("/api/control", (req, res) => {

    control = req.body;

    console.log(
        "⚙️ CONTROL UPDATED:",
        control
    );

    res.json({

        success: true,

        control

    });

});
// ============================================================
// STARTUP
// ============================================================

function onStartup() {

    console.log("======================================");
    console.log("       WEEDGUARD BACKEND");
    console.log("======================================");

    console.log("Camera host:", CAMERA_HOSTNAME + ".local (mDNS) or .env fallback");

    sessionService.onStartup();

    mdnsDiscovery.startDiscovery([
        "weedguard-robot",
        "weedguard-cam"
    ]);
}

// ============================================================
// SHUTDOWN
// ============================================================

function onShutdown(signal) {

    console.log(
        `\n${signal} received. Shutting down WeedGuard...`
    );

    try {
        sessionService.completeCurrentSession();
    } catch (error) {
        console.error(
            "Session shutdown error:",
            error.message
        );
    }

    process.exit(0);
}

// ============================================================
// PROCESS SIGNAL HANDLERS
// ============================================================

process.on("SIGINT", () => {
    onShutdown("SIGINT");
});

process.on("SIGTERM", () => {
    onShutdown("SIGTERM");
});

// ============================================================
// START EXPRESS SERVER
// ============================================================

onStartup();

const server = app.listen(PORT, "0.0.0.0", () => {

    console.log("--------------------------------------");

    console.log(
        `Backend running at http://localhost:${PORT}`
    );

    console.log(
        `Camera proxy: http://localhost:${PORT}/api/camera/stream`
    );

    console.log("--------------------------------------");

});

// ============================================================
// SERVER ERROR HANDLING
// ============================================================

server.on("error", (error) => {

    console.error(
        "Backend server error:",
        error.message
    );

    if (error.code === "EADDRINUSE") {

        console.error(
            `Port ${PORT} is already in use.`
        );

    }
});