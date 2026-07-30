const express = require("express");
const router = express.Router();

const statusController = require("../controllers/statusController");
const modeController   = require("../controllers/modeController");

// GET /api/robot/status  -> live ESP32 state (mode, command, distanceCm, obstacle, cutter, connected)
router.get("/status", statusController.getStatus);

// POST /api/robot/mode   -> body: { "mode": "manual" | "autonomous" }
router.post("/mode", modeController.setMode);

module.exports = router;
