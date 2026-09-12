require("dotenv").config();
const { getIp } = require("../services/mdnsDiscovery");

// Fixed hostname the robot firmware advertises via mDNS
// (see HOSTNAME in the .ino) — never changes, regardless of
// which network the board is on.
const HOSTNAME = "weedguard-robot";

// ESP32_IP in .env is now only a fallback, used until mDNS
// resolves the hostname above (or if this network blocks
// multicast traffic). It no longer needs to be kept in sync
// by hand.
const FALLBACK_IP = process.env.ESP32_IP;

module.exports = {
    hostname: HOSTNAME,
    getBaseURL: () => `http://${getIp(HOSTNAME, FALLBACK_IP)}`,
    apiKey: process.env.ESP32_API_KEY || ""
};