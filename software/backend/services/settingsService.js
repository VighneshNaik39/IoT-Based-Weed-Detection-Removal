const fs = require("fs");
const path = require("path");

const settingsFilePath = path.join(__dirname, "..", "data", "settings.json");

// Defaults mirror the ESP32 firmware constants (MOTOR_SPEED, OBSTACLE_CM, ssid)
// so the dashboard starts in sync with what's actually flashed to the robot.
const DEFAULT_SETTINGS = {
  autoDetect: true,
  alerts: true,
  autoRemove: false,
  robotSpeed: 200,          // PWM 0-255
  obstacleThresholdCm: 25,  // cm
  wifiSSID: "meowww"
};

if (!fs.existsSync(settingsFilePath)) {
  fs.writeFileSync(settingsFilePath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
}

function readSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFilePath, "utf8"));
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch (err) {
    console.error("❌ Error reading settings:", err.message);
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(partial) {
  const merged = { ...readSettings(), ...partial };
  fs.writeFileSync(settingsFilePath, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { readSettings, writeSettings, DEFAULT_SETTINGS };
