const express = require("express");
const router = express.Router();

const robotController = require("../controllers/robotController");
const statusController = require("../controllers/statusController");

// Robot Status
router.get("/status", statusController.getStatus);

// Move Robot
router.post("/move", robotController.move);

// Stop Robot
router.post("/stop", robotController.stop);

// Change Mode
router.post("/mode", robotController.mode);

// Relay (Cutter)
router.post("/relay", robotController.relay);

// Ping ESP32
router.get("/ping", robotController.ping);

module.exports = router;