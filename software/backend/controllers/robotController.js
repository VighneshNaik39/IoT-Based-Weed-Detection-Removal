const esp32 = require("../services/esp32Service");

// -------------------------
// Move Robot
// -------------------------
exports.move = async (req, res) => {

    try {

        const { command } = req.body;

        if (!command) {
            return res.status(400).json({
                success: false,
                message: "Command is required"
            });
        }

        const response = await esp32.move(command);

        res.json({
            success: true,
            data: response.data
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

// -------------------------
// Stop Robot
// -------------------------
exports.stop = async (req, res) => {

    try {

        const response = await esp32.stop();

        res.json({
            success: true,
            data: response.data
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};