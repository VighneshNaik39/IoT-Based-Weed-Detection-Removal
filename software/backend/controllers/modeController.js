const esp32 = require("../services/esp32Service");
const fieldService = require("../services/fieldService");

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

        if (mode === "autonomous") {
            const field = fieldService.readField();

            if (!field.configured) {
                return res.status(409).json({
                    success: false,
                    message: "Configure the field before starting autonomous mode"
                });
            }

            const waypoints =
                fieldService.generateAutonomousWaypoints(field);

            await esp32.setAutonomousPlan(waypoints);
        }

        const response = await esp32.mode(mode);

        res.json({
            success: true,
            data: response
        });

    } catch (err) {
        res.status(503).json({
            success: false,
            message: err.message
        });
    }
};