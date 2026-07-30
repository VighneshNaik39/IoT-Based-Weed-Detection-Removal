const esp32 = require("../services/esp32Service");

exports.getStatus = async (req, res) => {

    try {

        const response = await esp32.status();

        res.json({
            success: true,
            data: response.data
        });

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            success: false,
            message: "Failed to get robot status"
        });

    }

};