const esp32 = require("../services/esp32Service");

exports.setCutter = async (req, res) => {
    try {
        const { state } = req.body;

        if (typeof state !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "State must be true or false"
            });
        }

        const response = await esp32.cutter(state);

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