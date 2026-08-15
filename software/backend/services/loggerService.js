const fs = require("fs");
const path = require("path");

const logFilePath = path.join(__dirname, "..", "data", "logs.json");

// Make sure the log file always exists
if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, "[]");

// -------------------------
// Read all logs (newest first)
// -------------------------
function readLogs() {
  try {
    return JSON.parse(fs.readFileSync(logFilePath, "utf8"));
  } catch (err) {
    console.error("❌ Error reading logs:", err.message);
    return [];
  }
}

// -------------------------
// Overwrite the full log file
// -------------------------
function writeLogs(logs) {
  try {
    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error("❌ Error writing logs:", err.message);
  }
}

// -------------------------
// Append a single entry to the front of the log,
// capped at `maxEntries` (default 100)
// -------------------------
function appendLog(entry, maxEntries = 100) {
  const logs = readLogs();
  logs.unshift(entry);
  if (logs.length > maxEntries) logs.length = maxEntries;
  writeLogs(logs);
  return logs;
}

module.exports = {
  readLogs,
  writeLogs,
  appendLog
};
