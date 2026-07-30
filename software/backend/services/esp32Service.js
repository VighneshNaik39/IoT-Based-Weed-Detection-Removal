const axios = require("axios");
const esp32 = require("../config/esp32");

const api = axios.create({
    baseURL: esp32.baseURL,
    timeout: 5000,
    headers: {
        "Content-Type": "application/json"
    }
});

async function move(command) {
    return api.post("/move", {
        command
    });
}

async function stop() {
    return api.post("/stop");
}

async function mode(mode) {
    return api.post("/mode", {
        mode
    });
}

async function cutter(state) {
    return api.post("/cutter", {
        state
    });
}

async function status() {
    return api.get("/status");
}

module.exports = {
    move,
    stop,
    mode,
    cutter,
    status
};