require("dotenv").config();
const { getIp } = require("../services/mdnsDiscovery");

const HOSTNAME = process.env.ESP32_HOSTNAME || "weedguard-robot";
const FALLBACK_IP = (process.env.ESP32_IP || "").trim() || undefined;

module.exports = {
    hostname: HOSTNAME,
    getBaseURL: () => {
        const ip = getIp(HOSTNAME, FALLBACK_IP);
        if (!ip) {
            throw new Error("Robot IP is not known yet. Wait for mDNS discovery or set ESP32_IP in software/backend/.env.");
        }
        return `http://${ip}`;
    },
    apiKey: process.env.ESP32_API_KEY || ""
};
