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
// ESP32: GET /move?dir=forward
// ==========================================
async function move(direction) {
    const response = await api.get(
        `/move?dir=${encodeURIComponent(direction)}`
    );

    return response.data;
}

// ==========================================
// Stop robot
// ESP32: GET /stop
// ==========================================
async function stop() {
    const response = await api.get("/stop");
    return response.data;
}

// ==========================================
// Cutter / Relay
// ESP32: GET /cutter?state=on|off
// ==========================================
async function relay(state) {
    const response = await api.get(
        `/cutter?state=${encodeURIComponent(state)}`
    );

    return response.data;
}

// ==========================================
// Robot mode
// ESP32: GET /mode?state=manual|auto
// ==========================================
async function mode(mode) {
    const response = await api.get(
        `/mode?state=${encodeURIComponent(mode)}`
    );

    return response.data;
}

// ==========================================
// Set robot speed
// ESP32: GET /speed?value=0-255
// ==========================================
async function setSpeed(speed) {

    const value = Math.max(
        0,
        Math.min(255, Number(speed))
    );

    const response = await api.get(
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
    getGPS
};