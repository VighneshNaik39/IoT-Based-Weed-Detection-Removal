const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + "/../frontend"));

// =============================
// 📁 FILE PATHS
// =============================
const logFilePath     = path.join(__dirname, "data", "logs.json");
const sessionFilePath = path.join(__dirname, "data", "sessions.json");

// =============================
// 📁 FILE INIT
// =============================
if (!fs.existsSync(logFilePath))     fs.writeFileSync(logFilePath,     "[]");
if (!fs.existsSync(sessionFilePath)) fs.writeFileSync(sessionFilePath, "[]");

// =============================
// 📁 READ / WRITE HELPERS
// =============================
function readLogs() {
  try { return JSON.parse(fs.readFileSync(logFilePath, "utf8")); }
  catch { return []; }
}

function writeLogs(logs) {
  try { fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2)); }
  catch (err) { console.error("❌ Error writing logs:", err); }
}

function readSessions() {
  try { return JSON.parse(fs.readFileSync(sessionFilePath, "utf8")); }
  catch { return []; }
}

function writeSessions(sessions) {
  try { fs.writeFileSync(sessionFilePath, JSON.stringify(sessions, null, 2)); }
  catch (err) { console.error("❌ Error writing sessions:", err); }
}

// =============================
// 📊 LIVE STATE
// =============================
let latestData         = { status: "No weed detected", moisture: null, time: null };
let lastDataReceivedAt = null;
const ESP32_TIMEOUT_MS = 15000;

function isESP32Connected() {
  if (!lastDataReceivedAt) return false;
  return (Date.now() - lastDataReceivedAt) < ESP32_TIMEOUT_MS;
}

let sessionStats = { scansToday: 0, weedsDetected: 0, weedsRemoved: 0 };
let control      = { autoMode: true, removal: false };

// =============================
// 🌿 CURRENT SESSION (in-memory)
// =============================
let currentSession = null;

function startNewSession() {
  const sessions      = readSessions();
  const sessionNumber = sessions.length + 1;

  currentSession = {
    sessionNumber,
    startTime:       new Date().toISOString(),
    endTime:         null,
    durationMs:      0,
    totalDetections: 0,
    executions:      0,
    avgMoisture:     null,
    completed:       false,
    _moistureSum:    0,
    _moistureCount:  0
  };

  // Immediately persist so startup can always find it
  saveCurrentSessionToDisk();
  console.log(`🌿 Session ${sessionNumber} started.`);
}

// =============================
// 💾 SAVE CURRENT SESSION TO DISK (as incomplete)
// Called on every ESP32 update AND on session start
// so disk always reflects the latest state even after force-kill
// =============================
function saveCurrentSessionToDisk() {
  if (!currentSession) return;

  const sessions = readSessions();

  const liveAvg = currentSession._moistureCount > 0
    ? Math.round(currentSession._moistureSum / currentSession._moistureCount)
    : null;

  const snapshot = {
    sessionNumber:   currentSession.sessionNumber,
    startTime:       currentSession.startTime,
    endTime:         new Date().toISOString(),
    durationMs:      Date.now() - new Date(currentSession.startTime).getTime(),
    totalDetections: currentSession.totalDetections,
    executions:      currentSession.executions,
    avgMoisture:     liveAvg,
    completed:       false  // onStartup() flips this to true on next restart
  };

  const existingIdx = sessions.findIndex(
    s => s.sessionNumber === currentSession.sessionNumber
  );

  if (existingIdx >= 0) {
    sessions[existingIdx] = snapshot;
  } else {
    sessions.push(snapshot);
  }

  writeSessions(sessions);
}

function completeCurrentSession() {
  if (!currentSession) return;

  const endTime   = new Date().toISOString();
  const durationMs = Date.now() - new Date(currentSession.startTime).getTime();

  const liveAvg = currentSession._moistureCount > 0
    ? Math.round(currentSession._moistureSum / currentSession._moistureCount)
    : null;

  const toSave = {
    sessionNumber:   currentSession.sessionNumber,
    startTime:       currentSession.startTime,
    endTime,
    durationMs,
    totalDetections: currentSession.totalDetections,
    executions:      currentSession.executions,
    avgMoisture:     liveAvg,
    completed:       true
  };

  const sessions   = readSessions();
  const existingIdx = sessions.findIndex(
    s => s.sessionNumber === currentSession.sessionNumber
  );

  if (existingIdx >= 0) {
    sessions[existingIdx] = toSave;
  } else {
    sessions.push(toSave);
  }

  writeSessions(sessions);
  console.log(`✅ Session ${currentSession.sessionNumber} completed.`);
  currentSession = null;
}

// =============================
// 🚀 ON STARTUP
// Always mark the last incomplete session as completed,
// then start a brand new session
// =============================
function onStartup() {
  const sessions = readSessions();

  if (sessions.length > 0) {
    const last = sessions[sessions.length - 1];
    if (!last.completed) {
      last.completed  = true;
      last.endTime    = last.endTime || new Date().toISOString();
      last.durationMs = new Date(last.endTime).getTime()
                      - new Date(last.startTime).getTime();
      writeSessions(sessions);
      console.log(`✅ Previous session ${last.sessionNumber} marked complete on startup.`);
    }
  }

  startNewSession();
}

// =============================
// 🛑 ON SHUTDOWN — graceful complete
// =============================
function onShutdown(signal) {
  console.log(`\n🛑 ${signal} received — completing session before exit...`);
  completeCurrentSession();
  process.exit(0);
}

process.on("SIGINT",  () => onShutdown("SIGINT"));
process.on("SIGTERM", () => onShutdown("SIGTERM"));

// =============================
// 🏠 ROUTES
// =============================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/../frontend/index.html");
});

app.get("/api/data", (req, res) => {
  res.json({ message: "Hello ESP32 👋", status: "Server running" });
});

app.get("/api/status", (req, res) => {
  const logs        = readLogs();
  const currentData = logs.length > 0 ? logs[0] : latestData;

  res.json({
    ...currentData,
    scansToday:     sessionStats.scansToday,
    weedsDetected:  sessionStats.weedsDetected,
    weedsRemoved:   sessionStats.weedsRemoved,
    battery:        80,
    esp32Connected: isESP32Connected()
  });
});

app.get("/api/logs", (req, res) => {
  res.json(readLogs());
});

// =============================
// ✅ GET SESSIONS
// Returns saved sessions + live in-progress session, newest 5 first
// =============================
app.get("/api/sessions", (req, res) => {
  const saved = readSessions();

  // Replace the saved snapshot of currentSession with a live version
  const all = saved.filter(
    s => !currentSession || s.sessionNumber !== currentSession.sessionNumber
  );

  if (currentSession) {
    const liveDuration = Date.now() - new Date(currentSession.startTime).getTime();
    const liveAvg = currentSession._moistureCount > 0
      ? Math.round(currentSession._moistureSum / currentSession._moistureCount)
      : null;

    all.push({
      sessionNumber:   currentSession.sessionNumber,
      startTime:       currentSession.startTime,
      endTime:         null,
      durationMs:      liveDuration,
      totalDetections: currentSession.totalDetections,
      executions:      currentSession.executions,
      avgMoisture:     liveAvg,
      completed:       false
    });
  }

  const newest5 = all.slice(-5).reverse();
  res.json(newest5);
});

// =============================
// 🔥 UPDATE FROM ESP32
// =============================
app.post("/api/update", (req, res) => {
  const { weed, moisture } = req.body;

  if (typeof weed !== "boolean") {
    return res.status(400).json({ error: "Invalid or missing 'weed' value" });
  }

  lastDataReceivedAt = Date.now();

  const data = {
    status:   weed ? "Weed detected" : "No weed detected",
    moisture: moisture ?? null,
    time:     new Date().toISOString()
  };

  latestData = data;

  sessionStats.scansToday++;
  if (weed) {
    sessionStats.weedsDetected++;
    sessionStats.weedsRemoved = Math.floor(sessionStats.weedsDetected * 0.7);
  }

  if (currentSession) {
    currentSession.executions++;
    if (weed) currentSession.totalDetections++;
    if (moisture != null) {
      currentSession._moistureSum   += moisture;
      currentSession._moistureCount += 1;
    }

    // Persist latest session state to disk on every update
    saveCurrentSessionToDisk();
  }

  const logs = readLogs();
  logs.unshift(data);
  if (logs.length > 100) logs.pop();
  writeLogs(logs);

  console.log("📥 DATA RECEIVED:", data);
  res.json({ success: true });
});

app.post("/api/control", (req, res) => {
  control = req.body;
  console.log("⚙️ CONTROL UPDATED:", control);
  res.json({ success: true, control });
});

// =============================
// 🚀 START
// =============================
onStartup();

app.listen(5000, "0.0.0.0", () => {
  console.log("🚀 Server running on http://localhost:5000");
});