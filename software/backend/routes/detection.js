const express = require("express");

const router = express.Router();

const detectionController = require("../controllers/detectionController");

// ==========================================
// POST /api/detection/weed
// ==========================================
router.post(
    "/weed",
    detectionController.handleWeedDetection
);

// ==========================================
// GET /api/detection/status
// ==========================================
router.get(
    "/status",
    detectionController.getDetectionStatus
);

// ==========================================
// GET /api/detection/stream
// ==========================================
router.get(
    "/stream",
    detectionController.getDetectionStream
);

module.exports = router;