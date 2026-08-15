const loggerService = require("../services/loggerService");

// -------------------------
// GET /api/logs
// -------------------------
exports.getLogs = (req, res) => {
  try {
    res.json(loggerService.readLogs());
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to read logs"
    });
  }
};
