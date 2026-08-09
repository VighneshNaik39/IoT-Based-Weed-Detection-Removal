const esp32 = require("../services/esp32Service");

exports.getStatus = async (req, res) => {

    try {

        const data = await esp32.status();

        res.json({
            success: true,
            data
        });

    } catch (err) {

        console.error("ESP32 Status Error:", err.message);

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};