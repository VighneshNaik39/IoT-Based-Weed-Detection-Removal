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
// ESP32 v7: POST /mode?mode=manual|auto
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