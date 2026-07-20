// ===========================================
// API CONFIGURATION
// ===========================================

// Change this to your backend server address
const BASE_URL = "http://localhost:3000";

// ===========================================
// COMMON API FUNCTION
// ===========================================

async function sendCommand(endpoint, method = "POST") {
    try {

        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: method,
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();

    } catch (error) {

        console.error("API Error:", error);

        return {
            success: false,
            message: error.message
        };
    }
}

// ===========================================
// MOVEMENT APIs
// ===========================================

async function moveForward() {
    return await sendCommand("/forward");
}

async function moveBackward() {
    return await sendCommand("/backward");
}

async function moveLeft() {
    return await sendCommand("/left");
}

async function moveRight() {
    return await sendCommand("/right");
}

async function stopRobot() {
    return await sendCommand("/stop");
}

// ===========================================
// CUTTER APIs
// ===========================================

async function cutterOn() {
    return await sendCommand("/cutter/on");
}

async function cutterOff() {
    return await sendCommand("/cutter/off");
}

// ===========================================
// STATUS API
// ===========================================

async function getRobotStatus() {

    try {

        const response = await fetch(`${BASE_URL}/status`);

        if (!response.ok) {
            throw new Error("Unable to fetch robot status");
        }

        return await response.json();

    } catch (error) {

        console.error(error);

        return {
            success: false,
            status: "OFFLINE",
            battery: "--",
            obstacle: "UNKNOWN"
        };
    }
}

// ===========================================
// LOGS API
// ===========================================

async function getLogs() {

    try {

        const response = await fetch(`${BASE_URL}/logs`);

        if (!response.ok) {
            throw new Error("Unable to fetch logs");
        }

        return await response.json();

    } catch (error) {

        console.error(error);

        return [];
    }
}

// ===========================================
// CLEAR LOGS
// ===========================================

async function clearLogs() {

    return await sendCommand("/logs/clear", "DELETE");

}

// ===========================================
// CONNECTION CHECK
// ===========================================

async function checkConnection() {

    try {

        const response = await fetch(`${BASE_URL}/status`);

        return response.ok;

    } catch {

        return false;

    }

}

// ===========================================
// EMERGENCY STOP
// ===========================================

async function emergencyStop() {

    return await stopRobot();

}

// ===========================================
// EXPORT (Optional)
// ===========================================

window.robotAPI = {

    moveForward,
    moveBackward,
    moveLeft,
    moveRight,
    stopRobot,

    cutterOn,
    cutterOff,

    getRobotStatus,
    getLogs,
    clearLogs,

    emergencyStop,
    checkConnection

};