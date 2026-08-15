const express = require("express");

const router = express.Router();

const esp32Service = require("../services/esp32Service");

// ==========================================
// TEST
// ==========================================
router.get("/test", (req, res) => {

    res.json({
        success: true,
        message: "GPS route is working"
    });

});

// ==========================================
// REAL GPS
// ==========================================
router.get("/location", async (req, res) => {

    try {

        const gps =
            await esp32Service.getGPS();

        res.json({
            success: true,
            gps
        });

    } catch (error) {

        console.error(
            "GPS ERROR:",
            error.message
        );

        res.status(503).json({
            success: false,
            message: "GPS unavailable",
            error: error.message
        });
    }
});

module.exports = router;