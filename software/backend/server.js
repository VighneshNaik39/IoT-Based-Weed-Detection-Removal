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
// 📊 SESSION GROUPING
// Sessions are derived on the fly from logs.json.
// A new session starts whenever the gap between two
// consecutive log entries exceeds SESSION_GAP_MINUTES.
// No extra state is persisted — this just reorganizes
// the existing flat log into runs.
// =============================
const SESSION_GAP_MINUTES = 5;

function groupIntoSessions(logs, gapMinutes = SESSION_GAP_MINUTES) {
  if (!logs || logs.length === 0) return [];

  // logs.json is stored newest-first; work oldest-first to build sessions in order
  const chronological = [...logs].reverse();

  const gapMs = gapMinutes * 60 * 1000;
  const sessions = [];
  let current = [];

  for (let i = 0; i < chronological.length; i++) {
    const entry = chronological[i];
    if (current.length === 0) {
      current.push(entry);
      continue;
    }

    const prevTime = new Date(current[current.length - 1].time).getTime();
    const thisTime = new Date(entry.time).getTime();

    if (thisTime - prevTime > gapMs) {
      sessions.push(current);
      current = [entry];
    } else {
      current.push(entry);
    }
  }
  if (current.length > 0) sessions.push(current);

  // Build summary objects, newest session first
  const summaries = sessions.map((entries, idx) => {
    const start = new Date(entries[0].time);
    const end = new Date(entries[entries.length - 1].time);
    const durationMs = end.getTime() - start.getTime();

    const weedEntries = entries.filter(e => e.status === "Weed detected");

    const moistureValues = entries
      .map(e => e.moisture)
      .filter(m => m != null);

    const avgMoisture =
      moistureValues.length > 0
        ? Math.round(
            moistureValues.reduce((sum, m) => sum + m, 0) / moistureValues.length
          )
        : null;

    return {
      // Will be re-numbered after reversing to newest-first
      startTime: entries[0].time,
      endTime: entries[entries.length - 1].time,
      durationMs,
      totalDetections: weedEntries.length,
      executions: entries.length,
      avgMoisture,
      isLatest: false // set below
    };
  });

  // Newest session first, mark the most recent one as still in-progress
  summaries.reverse();
  if (summaries.length > 0) summaries[0].isLatest = true;

  return summaries.map((s, idx) => ({
    sessionNumber: summaries.length - idx,
    startTime: s.startTime,
    endTime: s.endTime,
    durationMs: s.durationMs,
    totalDetections: s.totalDetections,
    executions: s.executions,
    avgMoisture: s.avgMoisture,
    // The most recent session is only "completed" once a newer one has
    // started (i.e. there's been a gap since it last reported in).
    completed: !s.isLatest
  }));
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
// ✅ GET SESSIONS (last 5, newest first)
// Derived from logs.json — see groupIntoSessions()
// =============================
app.get("/api/sessions", (req, res) => {
  const logs = readLogs();
  const sessions = groupIntoSessions(logs);
  res.json(sessions.slice(0, 5));
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