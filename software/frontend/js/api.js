// ===========================================
// API CONFIGURATION
// ===========================================

const BASE_URL = "http://localhost:5000/api";

// ===========================================
// COMMON REQUEST
// ===========================================

async function apiRequest(endpoint, method = "GET", body = null) {

    try {

        const options = {
            method,
            headers: {
                "Content-Type": "application/json"
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(BASE_URL + endpoint, options);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();

    } catch (err) {

        console.error(err);

        return null;

    }

}

// ===========================================
// ROBOT MOVEMENT
// ===========================================

const robotAPI = {

    moveForward() {
        return apiRequest("/movement/forward", "POST");
    },

    moveBackward() {
        return apiRequest("/movement/backward", "POST");
    },

    moveLeft() {
        return apiRequest("/movement/left", "POST");
    },

    moveRight() {
        return apiRequest("/movement/right", "POST");
    },

    stopRobot() {
        return apiRequest("/movement/stop", "POST");
    },

// ===========================================
// CUTTER
// ===========================================

    cutterOn() {
        return apiRequest("/cutter/start", "POST");
    },

    cutterOff() {
        return apiRequest("/cutter/stop", "POST");
    },

// ===========================================
// MODE
// ===========================================

    setMode(mode) {
        return apiRequest("/robot/mode", "POST", {
            mode
        });
    },

// ===========================================
// STATUS
// ===========================================

    getStatus() {
        return apiRequest("/status");
    },

    getRobotStatus() {
        return apiRequest("/robot/status");
    },

// ===========================================
// LOGS
// ===========================================

    getLogs() {
        return apiRequest("/logs");
    },

// ===========================================
// SESSIONS
// ===========================================

    getSessions() {
        return apiRequest("/sessions");
    },

// ===========================================
// ANALYTICS
// ===========================================

    getAnalytics() {
        return apiRequest("/analytics");
    },

// ===========================================
// ALERTS
// ===========================================

    getAlerts() {
        return apiRequest("/alerts");
    },

    clearAlerts() {
        return apiRequest("/alerts/clear", "DELETE");
    },

// ===========================================
// FIELD MAP
// ===========================================

    getFieldMap() {
        return apiRequest("/field-map");
    }

};

window.robotAPI = robotAPI;