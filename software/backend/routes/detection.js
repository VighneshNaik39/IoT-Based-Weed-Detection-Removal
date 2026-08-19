const express = require("express");

const router = express.Router();

const detectionController = require("../controllers/detectionController");

// ==========================================
// POST /api/detection/weed
// Receives weed detection from AI/ESP32
// ==========================================
router.post(
    "/weed",
    detectionController.handleWeedDetection
);

// ==========================================
// GET /api/detection/status
// Returns latest YOLO detection
// ==========================================
router.get(
    "/status",
    detectionController.getDetectionStatus
);

// ==========================================
// GET /api/detection/stream
// Returns live camera stream
// ==========================================
router.get(
    "/stream",
    detectionController.getDetectionStream
);

module.exports = router;