const esp32 = require("../services/esp32Service");

exports.setMode = async (req, res) => {
    try {
        const { mode } = req.body;

        if (!mode) {
            return res.status(400).json({
                success: false,
                message: "Mode is required"
            });
        }

        if (!["manual", "autonomous"].includes(mode)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mode"
            });
        }

        const response = await esp32.mode(mode);

        res.json({
            success: true,
            data: response.data
        });

    } catch (err) {
        res.status(503).json({
            success: false,
            message: err.message
        });
    }
};