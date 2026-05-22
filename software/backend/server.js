const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// =============================
// 🔧 MIDDLEWARE
// =============================
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(__dirname + "/../frontend"));

// =============================
// 📁 LOG FILE SETUP
// =============================
const logFilePath = path.join(__dirname, "data", "logs.json");

// Create logs.json if missing
if (!fs.existsSync(logFilePath)) {
  fs.writeFileSync(logFilePath, "[]");
}

// Read logs
function readLogs() {
  try {
    const data = fs.readFileSync(logFilePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Error reading logs:", err);
    return [];
  }
}

// Write logs
function writeLogs(logs) {
  try {
    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error("❌ Error writing logs:", err);
  }
}

// =============================
// 📊 LIVE DATA
// =============================
let latestData = {
  status: "No weed detected",
  moisture: null,
  time: null
};

// =============================
// 📊 SESSION STATS
// Resets when server restarts
// =============================
let sessionStats = {
  scansToday: 0,
  weedsDetected: 0,
  weedsRemoved: 0
};

// =============================
// ⚙️ CONTROL DATA
// =============================
let control = {
  autoMode: true,
  removal: false
};

// =============================
// 🏠 ROOT
// =============================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/../frontend/index.html");
});

// =============================
// ✅ TEST ENDPOINT
// =============================
app.get("/api/data", (req, res) => {
  res.json({
    message: "Hello ESP32 👋",
    status: "Server running"
  });
});

// =============================
// ✅ GET STATUS
// =============================
app.get("/api/status", (req, res) => {

  const logs = readLogs();

  const currentData =
    logs.length > 0
      ? logs[0]
      : latestData;

  res.json({
    ...currentData,

    scansToday: sessionStats.scansToday,

    weedsDetected: sessionStats.weedsDetected,

    weedsRemoved: sessionStats.weedsRemoved,

    battery: 80
  });
});

// =============================
// ✅ GET LOGS
// =============================
app.get("/api/logs", (req, res) => {
  const logs = readLogs();
  res.json(logs);
});

// =============================
// 🔥 UPDATE FROM ESP32
// =============================
app.post("/api/update", (req, res) => {

  const { weed, moisture } = req.body;

  // Validate
  if (typeof weed !== "boolean") {
    return res.status(400).json({
      error: "Invalid or missing 'weed' value"
    });
  }

  // Create new log
  const data = {
    status: weed
      ? "Weed detected"
      : "No weed detected",

    moisture: moisture ?? null,

    time: new Date().toISOString()
  };

  // Update live data
  latestData = data;
  // Update current session stats
sessionStats.scansToday++;

if (weed) {
  sessionStats.weedsDetected++;

  // Simulated removal
  sessionStats.weedsRemoved = Math.floor(
    sessionStats.weedsDetected * 0.7
  );
}

  // Read existing logs
  const logs = readLogs();

  // Add newest log at top
  logs.unshift(data);

  // Keep latest 100 logs only
  if (logs.length > 100) {
    logs.pop();
  }

  // Save logs
  writeLogs(logs);

  console.log("📥 DATA RECEIVED:", data);

  res.json({
    success: true
  });
});

// =============================
// ⚙️ CONTROL API
// =============================
app.post("/api/control", (req, res) => {

  control = req.body;

  console.log("⚙️ CONTROL UPDATED:", control);

  res.json({
    success: true,
    control
  });
});

// =============================
// 🚀 START SERVER
// =============================
app.listen(5000, "0.0.0.0", () => {
  console.log("🚀 Server running on http://localhost:5000");
});