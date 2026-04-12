const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// =============================
// 📊 DATA STORAGE
// =============================
let latestData = {
  status: "No weed detected",
  moisture: null,
  time: null
};

let logs = [];

let control = {
  autoMode: true,
  removal: false
};

// =============================
// 🏠 ROOT
// =============================
app.get("/", (req, res) => {
  res.send("🚀 IoT Weed Detection Backend Running");
});

// =============================
// ✅ ESP32 TEST ENDPOINT (IMPORTANT)
// =============================
app.get("/api/data", (req, res) => {
  console.log("ESP32 requested data");

  res.json({
    message: "Hello ESP32 👋",
    status: "Server running"
  });
});

// =============================
// ✅ GET STATUS (Frontend)
// =============================
app.get("/api/status", (req, res) => {
  res.json({
    ...latestData,
    scansToday: logs.length,
    weedsDetected: logs.filter(l => l.status === "Weed detected").length,
    weedsRemoved: 0,
    battery: 80
  });
});

// =============================
// ✅ GET LOGS
// =============================
app.get("/api/logs", (req, res) => {
  res.json(logs);
});

// =============================
// 🔥 ESP32 SEND DATA (POST)
// =============================
app.post("/api/update", (req, res) => {
  const { weed, moisture } = req.body;

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

  latestData = data;

  logs.push(data);
  if (logs.length > 100) logs.shift();

  console.log("📥 DATA RECEIVED FROM ESP32:", data);

  res.json({
    success: true
  });
});

// =============================
// ⚙️ CONTROL (FUTURE)
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