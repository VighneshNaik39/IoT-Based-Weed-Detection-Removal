const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Store latest data
let latestData = {
    status: "No weed detected",
    moisture: null,
    time: null
};

// Store logs
let logs = [];

// Control system (optional - for later phases)
let control = {
    autoMode: true,
    removal: false
};

// ROOT
app.get("/", (req, res) => {
    res.send("🚀 IoT Weed Detection Backend Running");
});

// ✅ GET STATUS (for frontend)
app.get("/api/status", (req, res) => {
    res.json({
        ...latestData,

        // extra UI fields (optional)
        scansToday: logs.length,
        weedsDetected: logs.filter(l => l.status === "Weed detected").length,
        weedsRemoved: 0,
        battery: 80
    });
});

// ✅ GET LOGS
app.get("/api/logs", (req, res) => {
    res.json(logs);
});

// 🔥 POST (ESP32 → Backend)
app.post("/api/update", (req, res) => {
    const { weed, moisture } = req.body;

    // Validation
    if (typeof weed !== "boolean") {
        return res.status(400).json({
            error: "Invalid or missing 'weed' value"
        });
    }

    const data = {
        status: weed ? "Weed detected" : "No weed",
        moisture: moisture ?? null,
        time: new Date()
    };

    // Update latest
    latestData = data;

    // Store logs (limit 100)
    logs.push(data);
    if (logs.length > 100) {
        logs.shift();
    }

    console.log("DATA RECEIVED:", data);

    res.json({
        success: true
    });
});

// ✅ CONTROL (optional - keep for future)
app.post("/api/control", (req, res) => {
    control = req.body;

    console.log("CONTROL UPDATED:", control);

    res.json({
        success: true,
        control
    });
});

// 🚀 START SERVER (IMPORTANT FOR ESP32)
app.listen(5000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:5000");
});