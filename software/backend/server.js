// ==========================================
// ROUTES
// ==========================================
const movementRoutes = require("./routes/movement");
const modeRoutes = require("./routes/mode");
const cutterRoutes = require("./routes/cutter");
const stopRoutes = require("./routes/stop");
const robotRoutes = require("./routes/robot");
const settingsRoutes = require("./routes/settings");
const logsRoutes = require("./routes/logs");
const apiContractRoutes = require("./routes/apiContract");
const detectionRoutes = require("./routes/detection");

// ==========================================
// SERVICES
// ==========================================
const loggerService = require("./services/loggerService");
const sessionService = require("./services/sessionService");

// ==========================================
// MODULES
// ==========================================
const express = require("express");
const cors = require("cors");

// ==========================================
// APP
// ==========================================
const app = express();

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// ROUTE MOUNTING
// ==========================================
app.use("/api/move", movementRoutes);
app.use("/api/stop", stopRoutes);
app.use("/api/mode", modeRoutes);
app.use("/api/cutter", cutterRoutes);
app.use("/api/detection", detectionRoutes);

// Robot status/mode live under /api/robot
app.use("/api/robot", robotRoutes);

app.use("/api/settings", settingsRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api", apiContractRoutes);

// ==========================================
// FRONTEND
// ==========================================
app.use(express.static(__dirname + "/../frontend"));

// ==========================================
// LOGGER SERVICE
// ==========================================
const { readLogs, writeLogs } = loggerService;

// ==========================================
// LIVE STATE
// ==========================================
let latestData = {
    status: "No weed detected",
    moisture: null,
    time: null
};

let lastDataReceivedAt = null;

const ESP32_TIMEOUT_MS = 15000;

// ==========================================
// CHECK ESP32 CONNECTION
// ==========================================
function isESP32Connected() {

    if (!lastDataReceivedAt) {
        return false;
    }

    return (
        Date.now() - lastDataReceivedAt <
        ESP32_TIMEOUT_MS
    );
}

// ==========================================
// DASHBOARD SESSION STATS
// ==========================================
let sessionStats = {
    scansToday: 0,
    weedsDetected: 0,
    weedsRemoved: 0
};

let control = {
    autoMode: true,
    removal: false
};

// ==========================================
// 🚀 ON STARTUP
// ==========================================
function onStartup() {

    sessionService.onStartup();

}

// ==========================================
// 🛑 ON SHUTDOWN
// ==========================================
function onShutdown(signal) {

    console.log(
        `\n🛑 ${signal} received — completing session before exit...`
    );

    sessionService.completeCurrentSession();

    process.exit(0);
}

// ==========================================
// PROCESS SHUTDOWN HANDLERS
// ==========================================
process.on(
    "SIGINT",
    () => onShutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () => onShutdown("SIGTERM")
);

// ==========================================
// 🏠 HOME
// ==========================================
app.get("/", (req, res) => {

    res.sendFile(
        __dirname + "/../frontend/index.html"
    );

});

// ==========================================
// API DATA
// ==========================================
app.get("/api/data", (req, res) => {

    res.json({
        message: "Hello ESP32 👋",
        status: "Server running"
    });

});

// ==========================================
// 📊 STATUS
// ==========================================
app.get("/api/status", (req, res) => {

    const logs = readLogs();

    const currentData =
        logs.length > 0
            ? logs[0]
            : latestData;

    res.json({

        ...currentData,

        scansToday:
            sessionStats.scansToday,

        weedsDetected:
            sessionStats.weedsDetected,

        weedsRemoved:
            sessionStats.weedsRemoved,

        battery: 80,

        esp32Connected:
            isESP32Connected()

    });

});

// ==========================================
// 📋 GET SESSIONS
// ==========================================
app.get("/api/sessions", (req, res) => {

    const sessions =
        sessionService.getLatestSessions(5);

    res.json(sessions);

});

// ==========================================
// 🔥 UPDATE FROM ESP32
// ==========================================
app.post("/api/update", (req, res) => {

    const {
        weed,
        moisture
    } = req.body;

    // ------------------------------------------
    // Validate weed value
    // ------------------------------------------
    if (typeof weed !== "boolean") {

        return res.status(400).json({
            error: "Invalid or missing 'weed' value"
        });

    }

    // ------------------------------------------
    // ESP32 is connected
    // ------------------------------------------
    lastDataReceivedAt = Date.now();

    // ------------------------------------------
    // Create latest data
    // ------------------------------------------
    const data = {

        status:
            weed
                ? "Weed detected"
                : "No weed detected",

        moisture:
            moisture ?? null,

        time:
            new Date().toISOString()

    };

    latestData = data;

    // ------------------------------------------
    // Dashboard statistics
    // ------------------------------------------
    sessionStats.scansToday++;

    if (weed) {

        sessionStats.weedsDetected++;

        sessionStats.weedsRemoved =
            Math.floor(
                sessionStats.weedsDetected * 0.7
            );

    }

    // ------------------------------------------
    // UPDATE SHARED SESSION
    // ------------------------------------------
    sessionService.recordDetection({

        weed: weed,

        moisture: moisture

    });

    // ------------------------------------------
    // Save ESP32 log
    // ------------------------------------------
    const logs = readLogs();

    logs.unshift(data);

    if (logs.length > 100) {
        logs.pop();
    }

    writeLogs(logs);

    // ------------------------------------------
    // Console
    // ------------------------------------------
    console.log(
        "📥 DATA RECEIVED:",
        data
    );

    return res.json({
        success: true
    });

});

// ==========================================
// ⚙️ CONTROL
// ==========================================
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

// ==========================================
// 🚀 START SERVER
// ==========================================
onStartup();

app.listen(
    5000,
    "0.0.0.0",
    () => {

        console.log(
            "🚀 Server running on http://localhost:5000"
        );

    }
);