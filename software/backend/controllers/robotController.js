const esp32 = require("../services/esp32Service");

// ========================================
// Move Robot
// ========================================
exports.move = async (req, res) => {
    try {

        const { command } = req.body;

        if (!command) {
            return res.status(400).json({
                success: false,
                message: "Command is required"
            });
        }

        const data = await esp32.move(command);

        res.json({
            success: true,
            message: "Robot command sent",
            data
        });

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

// ========================================
// Stop Robot
// ========================================
exports.stop = async (req, res) => {
    try {

        const data = await esp32.stop();

        res.json({
            success: true,
            message: "Robot stopped",
            data
        });

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

// ========================================
// Change Mode
// ========================================
exports.mode = async (req, res) => {
    try {

        const { mode } = req.body;

        if (!mode) {
            return res.status(400).json({
                success: false,
                message: "Mode is required"
            });
        }

        const data = await esp32.mode(mode);

        res.json({
            success: true,
            message: "Mode changed",
            data
        });

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

// ========================================
// Relay (Cutter)
// ========================================
exports.relay = async (req, res) => {
    try {

        const { state } = req.body;

        if (!state) {
            return res.status(400).json({
                success: false,
                message: "State is required"
            });
        }

        const data = await esp32.relay(state);

        res.json({
            success: true,
            message: "Relay updated",
            data
        });

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

// ========================================
// Robot Status
// ========================================
exports.status = async (req, res) => {
    try {

        const data = await esp32.status();

        res.json({
            success: true,
            data
        });

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

// ========================================
// Ping ESP32
// ========================================
exports.ping = async (req, res) => {
    try {

        const data = await esp32.ping();

        res.json({
            success: true,
            connected: true,
            data
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            connected: false,
            message: err.message
        });

    }
};