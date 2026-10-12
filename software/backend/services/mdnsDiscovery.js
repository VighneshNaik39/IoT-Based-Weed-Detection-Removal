// ==========================================
// mDNS DISCOVERY
//
// Resolves ESP32 hostnames (weedguard-robot.local,
// weedguard-cam.local) to their current IP on the LAN, so
// nothing in this app has to hardcode an IP. Re-queries on an
// interval, so it keeps working across ESP32 reboots, WiFi
// drops, and switching to a different router/hotspot entirely
// — no .env edits, no restarts.
//
// Uses the `multicast-dns` package directly instead of relying
// on the OS's own DNS resolver, because Windows machines
// without Bonjour/iTunes installed often can't resolve ".local"
// names through the normal getaddrinfo() path.
// ==========================================

const mdns = require("multicast-dns")();

const cache = {}; // hostname -> { ip, lastSeenMs }

const STALE_AFTER_MS = 45000; // treat a name as "gone" if unseen this long

function query(hostname) {
    mdns.query({
        questions: [{ name: `${hostname}.local`, type: "A" }]
    });
}

mdns.on("response", (response) => {
    for (const answer of response.answers) {
        if (answer.type === "A" && answer.name.endsWith(".local")) {
            const hostname = answer.name.replace(/\.local$/, "");
            cache[hostname] = {
                ip: answer.data,
                lastSeenMs: Date.now()
            };
        }
    }
});

mdns.on("error", (err) => {
    console.error("⚠️  mDNS error:", err.message);
});

// ==========================================
// Start discovery for a list of hostnames (no ".local" suffix).
// Queries immediately, then on a fixed interval.
// ==========================================
function startDiscovery(hostnames, intervalMs = 15000) {
    const doQuery = () => hostnames.forEach(query);
    doQuery();
    setInterval(doQuery, intervalMs);
    console.log(
        `🔎 mDNS discovery started for: ${hostnames.map(h => h + ".local").join(", ")}`
    );
}

// ==========================================
// Get the last-known IP for a hostname.
// Falls back to `fallbackIp` (e.g. the .env value) if mDNS
// hasn't resolved it yet, or hasn't been heard from recently
// (e.g. this network blocks multicast) — so things keep working
// with a manually-set IP until/unless mDNS takes over.
// ==========================================
function getIp(hostname, fallbackIp) {
    const entry = cache[hostname];

    if (entry && Date.now() - entry.lastSeenMs < STALE_AFTER_MS) {
        return entry.ip;
    }

    return fallbackIp;
}

// ==========================================
// True once mDNS has actually resolved this hostname (as
// opposed to running on the .env fallback) — useful for a
// diagnostics/status endpoint.
// ==========================================
function isResolvedViaMdns(hostname) {
    const entry = cache[hostname];
    return !!entry && Date.now() - entry.lastSeenMs < STALE_AFTER_MS;
}

module.exports = { startDiscovery, getIp, isResolvedViaMdns };