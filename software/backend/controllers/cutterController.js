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

        const data = await esp32.relay(state ? "on" : "off");

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