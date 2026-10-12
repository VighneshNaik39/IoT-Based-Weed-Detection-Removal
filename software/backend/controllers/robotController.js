const esp32 = require("../services/esp32Service");
const fieldService = require("../services/fieldService");

// ========================================
// Common error handler
// ========================================
function handleError(res, operation, err) {
    console.error(`${operation} ERROR:`, {
        message: err.message,
        status: err.response?.status,
        response: err.response?.data,
        url: err.config?.url,
        method: err.config?.method
    });

    return res.status(err.response?.status || 500).json({
        success: false,
        message: err.response?.data?.error || err.message
    });
}

// ========================================
// Move Robot
// POST /api/robot/move
// Body: { "command": "forward" }
// ========================================
exports.move = async (req, res) => {
    try {
        const command = req.body?.command || req.body?.dir;

        const validCommands = [
            "forward",
            "backward",
            "left",
            "right",
            "stop"
        ];

        if (!command) {
            return res.status(400).json({
                success: false,
                message: "Command is required"
            });
        }

        if (!validCommands.includes(command)) {
            return res.status(400).json({
                success: false,
                message: "Invalid command",
                allowedCommands: validCommands
            });
        }

        // Forward the command to the motor ESP32.
        const data = await esp32.move(command);

        return res.json({
            success: true,
            message: "Robot command sent",
            data
        });

    } catch (err) {
        return handleError(res, "MOVE", err);
    }
};

// ========================================
// Stop Robot
// POST /api/robot/stop
// ========================================
exports.stop = async (req, res) => {
    try {
        const data = await esp32.stop();

        return res.json({
            success: true,
            message: "Robot stopped",
            data
        });

    } catch (err) {
        return handleError(res, "STOP", err);
    }
};

// ========================================
// Change Robot Mode
// POST /api/robot/mode
// Body: { "mode": "manual" }
// ========================================
exports.mode = async (req, res) => {
    try {
        const { mode } = req.body || {};

        if (!mode) {
            return res.status(400).json({
                success: false,
                message: "Mode is required"
            });
        }

        if (!["manual", "autonomous"].includes(mode)) {
            return res.status(400).json({
                success: false,
                message: "Mode must be manual or autonomous"
            });
        }

        // Autonomous navigation requires a configured field.
        if (mode === "autonomous") {
            const field = fieldService.readField();

            if (!field.configured) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Configure the field origin, edge, width and length before starting autonomous mode"
                });
            }

            let waypoints;
            try {
                waypoints = fieldService.generateAutonomousWaypoints(field);
            } catch (fieldErr) {
                return res.status(409).json({
                    success: false,
                    message: `Field boundary error: ${fieldErr.message}. Please configure the field boundaries on the Field Map page first.`
                });
            }

            if (!Array.isArray(waypoints) || waypoints.length === 0) {
                return res.status(409).json({
                    success: false,
                    message: "No valid autonomous waypoints were generated"
                });
            }

            // Send the waypoint plan to the ESP32.
            await esp32.setAutonomousPlan(waypoints);

            const data = await esp32.mode("autonomous");

            return res.json({
                success: true,
                message: "Autonomous mode requested",
                data,
                waypointCount: waypoints.length
            });
        }

        // Manual mode.
        const data = await esp32.mode("manual");

        return res.json({
            success: true,
            message: "Manual mode selected",
            data
        });

    } catch (err) {
        return handleError(res, "MODE", err);
    }
};

// ========================================
// Cutter Relay
// POST /api/robot/relay
// Body: { "state": "on" } or { "state": "off" }
// ========================================
exports.relay = async (req, res) => {
    try {
        const { state } = req.body || {};

        if (typeof state !== "string" ||
            !["on", "off"].includes(state.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'State must be "on" or "off"'
            });
        }

        const normalizedState = state.toLowerCase();

        // Do not activate the cutter during robot movement tests.
        if (normalizedState === "on") {
            return res.status(403).json({
                success: false,
                message:
                    "Cutter activation is disabled in this controller for safety"
            });
        }

        const data = await esp32.relay("off");

        return res.json({
            success: true,
            message: "Cutter relay switched off",
            data
        });

    } catch (err) {
        return handleError(res, "RELAY", err);
    }
};

// ========================================
// Set Robot Speed
// Frontend: 0-100 percent
// ESP32: 0-255 PWM
// POST /api/robot/speed
// Body: { "speed": 50 }
// ========================================
exports.speed = async (req, res) => {
    try {
        const { speed } = req.body || {};

        if (
            speed === undefined ||
            speed === null ||
            speed === "" ||
            !Number.isFinite(Number(speed))
        ) {
            return res.status(400).json({
                success: false,
                message: "Speed between 0 and 100 is required"
            });
        }

        const percentage = Number(speed);

        if (percentage < 0 || percentage > 100) {
            return res.status(400).json({
                success: false,
                message: "Speed must be between 0 and 100"
            });
        }

        const pwm = Math.round((percentage / 100) * 255);

        const data = await esp32.setSpeed(pwm);

        return res.json({
            success: true,
            message: "Speed updated",
            data: {
                ...data,
                speedPct: percentage,
                speedPwm: pwm
            }
        });

    } catch (err) {
        return handleError(res, "SPEED", err);
    }
};

// ========================================
// Robot Status
// GET /api/robot/status
// ========================================
exports.status = async (req, res) => {
    try {
        const data = await esp32.status();

        return res.json({
            success: true,
            data
        });

    } catch (err) {
        return handleError(res, "STATUS", err);
    }
};

// ========================================
// Ping Motor ESP32
// GET /api/robot/ping
// ========================================
exports.ping = async (req, res) => {
    try {
        const data = await esp32.ping();

        return res.json({
            success: true,
            connected: true,
            data
        });

    } catch (err) {
        return handleError(res, "PING", err);
    }
};