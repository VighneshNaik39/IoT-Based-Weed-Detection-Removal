const settingsService = require("../services/settingsService");
const esp32Service = require("../services/esp32Service");

// GET /api/settings
exports.getSettings = (req, res) => {
  res.json({ success: true, data: settingsService.readSettings() });
};

// POST /api/settings
exports.updateSettings = async (req, res) => {
  try {
    const updated = settingsService.writeSettings(req.body || {});

    // Relay speed to the robot if it was part of this save.
    // Wrapped separately so a robot that's offline doesn't fail the settings save.
    if (updated.robotSpeed !== undefined) {
      try {
        await esp32Service.setSpeed(updated.robotSpeed);
      } catch (esp32Err) {
        console.error("Failed to push speed to ESP32:", esp32Err.message);
      }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to save settings" });
  }
};