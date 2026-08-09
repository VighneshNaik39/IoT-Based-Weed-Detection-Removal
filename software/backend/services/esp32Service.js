const axios = require("axios");
const esp32 = require("../config/esp32");

const api = axios.create({
    baseURL: esp32.baseURL,
    timeout: 10000,
    headers: {
        "Content-Type": "application/json",
        // Must match API_KEY in the drive ESP32's firmware (ESP32_WeedRobot_v6.ino).
        // Sent on every request; the ESP32 only actually checks it on the
        // command endpoints (/move, /stop, /speed, /relay, /mode) -- /status
        // and /ping stay open and ignore it.
        "X-API-Key": esp32.apiKey
    }
});

//--------------------------------------------------
// Check ESP32 Connection
//--------------------------------------------------
async function ping() {
    const response = await api.get("/ping");
    return response.data;
}

//--------------------------------------------------
// Robot Status
//--------------------------------------------------
async function status() {
    const response = await api.get("/status");
    return response.data;
}

//--------------------------------------------------
// Move Robot
//--------------------------------------------------
async function move(direction) {
    const response = await api.post(`/move?dir=${direction}`);
    return response.data;
}

//--------------------------------------------------
// Stop Robot
//--------------------------------------------------
async function stop() {
    const response = await api.post("/stop");
    return response.data;
}

//--------------------------------------------------
// Relay (Cutter)
// state = "on" or "off"
//--------------------------------------------------
async function relay(state) {
    const response = await api.post(`/relay?state=${state}`);
    return response.data;
}

//--------------------------------------------------
// Robot Mode
// mode = "auto" or "manual"
//--------------------------------------------------
async function mode(mode) {
    const response = await api.post(`/mode?mode=${mode}`);
    return response.data;
}

//--------------------------------------------------
// Set Robot Speed
// speed = 0-255 (PWM duty cycle)
//--------------------------------------------------
async function setSpeed(speed) {
    const value = Math.max(0, Math.min(255, Number(speed)));
    const response = await api.post(`/speed?value=${value}`);
    return response.data;
}

module.exports = {
    ping,
    status,
    move,
    stop,
    relay,
    mode,
    setSpeed
};