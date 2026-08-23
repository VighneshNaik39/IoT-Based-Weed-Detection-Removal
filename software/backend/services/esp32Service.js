const axios = require("axios");
const esp32 = require("../config/esp32");

// ==========================================
// ESP32 API CLIENT
// ==========================================
const api = axios.create({
    baseURL: esp32.baseURL,
    timeout: 10000,
    headers: {
        "Content-Type": "application/json",
        "X-API-Key": esp32.apiKey
    }
});

// ==========================================
// Check ESP32 connection
// ESP32: GET /ping
// ==========================================
async function ping() {
    const response = await api.get("/ping");
    return response.data;
}

// ==========================================
// Robot status
// ESP32: GET /status
// ==========================================
async function status() {
    const response = await api.get("/status");
    return response.data;
}

// ==========================================
// Move robot
// ESP32 v7: POST /move?dir=forward
// ==========================================
async function move(direction) {
    const response = await api.post(
        `/move?dir=${encodeURIComponent(direction)}`
    );

    return response.data;
}

// ==========================================
// Stop robot
// ESP32 v7: POST /stop
// ==========================================
async function stop() {
    const response = await api.post("/stop");
    return response.data;
}

// ==========================================
// Cutter / Relay
// ESP32 v7: POST /relay?state=on|off
// (older firmware used GET /cutter — v7 renamed the path)
// ==========================================
async function relay(state) {
    const response = await api.post(
        `/relay?state=${encodeURIComponent(state)}`
    );

    return response.data;
}

// ==========================================
// Robot mode
// ESP32 v8: POST /mode?mode=manual|autonomous
// (older firmware used the 'state' param name — v7 renamed it to 'mode')
// ==========================================
async function mode(newMode) {
    const response = await api.post(
        `/mode?mode=${encodeURIComponent(newMode)}`
    );

    return response.data;
}

// ==========================================
// Set robot speed
// ESP32 v7: POST /speed?value=0-255
// ==========================================
async function setSpeed(speed) {

    const value = Math.max(
        0,
        Math.min(255, Number(speed))
    );

    const response = await api.post(
        `/speed?value=${value}`
    );

    return response.data;
}

// ==========================================
// NEO-6M GPS
// ESP32: GET /gps
// ==========================================
async function getGPS() {

    const response = await api.get("/gps");

    return response.data;
}

// ==========================================
// Autonomous waypoint plan
// ESP32 v8: POST /autonomous/plan
// ==========================================
async function setAutonomousPlan(waypoints) {
    const response = await api.post(
        "/autonomous/plan",
        { waypoints }
    );

    return response.data;
}

// ==========================================
// Start autonomous navigation
// ESP32 v8: POST /autonomous/start
// ==========================================
async function startAutonomous() {
    const response = await api.post("/autonomous/start");
    return response.data;
}

// ==========================================
// Stop autonomous navigation
// ESP32 v8: POST /autonomous/stop
// ==========================================
async function stopAutonomous() {
    const response = await api.post("/autonomous/stop");
    return response.data;
}

// ==========================================
// Autonomous status
// ESP32 v8: GET /autonomous/status
// ==========================================
async function autonomousStatus() {
    const response = await api.get("/autonomous/status");
    return response.data;
}

// ==========================================
// Weed detected (laptop YOLO -> ESP32)
// ESP32 v8: POST /weed-detected?duration=<ms>
// Stops the robot, cuts for `duration` ms, then auto-resumes
// autonomous navigation if that's what was interrupted.
// ==========================================
async function weedDetected(durationMs) {
    const query = durationMs
        ? `?duration=${encodeURIComponent(durationMs)}`
        : "";

    const response = await api.post(`/weed-detected${query}`);
    return response.data;
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
    ping,
    status,
    move,
    stop,
    relay,
    mode,
    setSpeed,
    getGPS,
    setAutonomousPlan,
    startAutonomous,
    stopAutonomous,
    autonomousStatus,
    weedDetected
};