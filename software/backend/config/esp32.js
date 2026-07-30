require("dotenv").config();

module.exports = {
    ip: process.env.ESP32_IP,
    baseURL: `http://${process.env.ESP32_IP}`
};