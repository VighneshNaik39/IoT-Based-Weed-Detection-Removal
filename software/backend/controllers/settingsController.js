const settingsService = require("../services/settingsService");

// GET /api/settings
exports.getSettings = (req, res) => {
  res.json({ success: true, data: settingsService.readSettings() });
};

// POST /api/settings
exports.updateSettings = (req, res) => {
  try {
    const updated = settingsService.writeSettings(req.body || {});
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to save settings" });
  }
};
