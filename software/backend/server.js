const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🧠 TEMP DATA STORAGE (Phase 1)
let weedStatus = "No weed detected";

let logs = [
    { time: new Date().toLocaleString(), status: weedStatus }
];

let control = {
    autoMode: true,
    removal: false
};

// ✅ ROOT ROUTE
app.get("/", (req, res) => {
    res.send("🚀 IoT Weed Detection Backend Running");
});


// ✅ 1️⃣ GET STATUS (Dashboard)
app.get("/api/status", (req, res) => {
    res.json({
        status: weedStatus,
        time: new Date().toLocaleTimeString(),

        scansToday: 128,
        weedsDetected: logs.filter(l => l.status === "Weed detected").length,
        weedsRemoved: 3,
        battery: 78,

        sensors: {
            moisture: 62,
            temperature: 28,
            humidity: 71,
            light: 4320
        }
    });
});


// ✅ 2️⃣ UPDATE STATUS (Simulate IoT)
app.post("/api/update", (req, res) => {
    const { status } = req.body;

    weedStatus = status;

    logs.unshift({
        time: new Date().toLocaleString(),
        status: status
    });

    console.log("Updated Status:", status);

    res.json({
        success: true,
        current: weedStatus
    });
});


// ✅ 3️⃣ GET LOGS (Logs Page)
app.get("/api/logs", (req, res) => {
    res.json(logs);
});


// ✅ 4️⃣ CONTROL SYSTEM (Settings Page)
app.post("/api/control", (req, res) => {
    control = req.body;

    console.log("Control Updated:", control);

    res.json({
        success: true,
        control: control
    });
});


// 🚀 START SERVER
app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});