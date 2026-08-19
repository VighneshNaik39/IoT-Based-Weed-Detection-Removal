const BASE_URL = "";

// -------------------------
// Save settings to backend
// -------------------------
async function saveSettings() {
    const settings = {
        autoDetect: document.getElementById("autoDetect").checked,
        alerts: document.getElementById("alerts").checked,
        autoRemove: document.getElementById("autoRemove").checked,
        obstacleThresholdCm: Number(document.getElementById("obstacleThresholdCm").value),
        wifiSSID: document.getElementById("wifiSSID").value.trim()
    };

    try {
        const res = await fetch(`${BASE_URL}/api/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });

        if (!res.ok) throw new Error(`Save failed (${res.status})`);

        const body = await res.json();
        if (!body.success) throw new Error(body.message || "Save failed");

        alert("✅ Settings saved successfully!");
    } catch (err) {
        console.error("Failed to save settings:", err);
        alert("❌ Could not save settings — is the backend running?");
    }
}

// -------------------------
// Load settings from backend
// -------------------------
async function loadSettings() {
    try {
        const res = await fetch(`${BASE_URL}/api/settings`);
        if (!res.ok) throw new Error(`Load failed (${res.status})`);

        const body = await res.json();
        const settings = body.data || {};

        if (settings.autoDetect !== undefined) document.getElementById("autoDetect").checked = settings.autoDetect;
        if (settings.alerts !== undefined) document.getElementById("alerts").checked = settings.alerts;
        if (settings.autoRemove !== undefined) document.getElementById("autoRemove").checked = settings.autoRemove;

        if (settings.obstacleThresholdCm !== undefined) {
            document.getElementById("obstacleThresholdCm").value = settings.obstacleThresholdCm;
        }
        if (settings.wifiSSID !== undefined) {
            document.getElementById("wifiSSID").value = settings.wifiSSID;
        }
    } catch (err) {
        console.error("Failed to load settings:", err);
        // Leave the HTML defaults in place if the backend can't be reached
    }
}

// -------------------------
// Connection status (System Information card + sidebar device indicator)
// -------------------------
function updateConnectionStatus(isConnected, esp32Connected) {
    const statusBadge = document.getElementById('connectionStatus');
    const deviceInfo = document.getElementById('deviceName');

    if (statusBadge) {
        if (isConnected) {
            statusBadge.textContent = 'Connected';
            statusBadge.classList.remove('disconnected');
        } else {
            statusBadge.textContent = 'Disconnected';
            statusBadge.classList.add('disconnected');
        }
    }

    if (deviceInfo) {
        deviceInfo.textContent = isConnected ? 'ESP32-WROOM-32 Connected' : 'No device connected';
    }

    // Keep the sidebar's device indicator in sync — it defaults to
    // "Connecting..." and otherwise never updates on this page.
    const sidebarDot = document.getElementById('device-dot');
    const sidebarText = document.getElementById('device-status-text');
    const online = isConnected && esp32Connected !== false;

    if (sidebarDot) sidebarDot.style.background = online ? 'var(--green-400)' : 'var(--red-600)';
    if (sidebarText) sidebarText.textContent = online ? 'Connected' : (isConnected ? 'ESP32 Idle' : 'Disconnected');
}

async function checkConnectionStatus() {
    try {
        const res = await fetch(`${BASE_URL}/api/status`);

        if (!res.ok) throw new Error();

        const data = await res.json();

        console.log("Backend Status:", data);

        updateConnectionStatus(true, data.esp32Connected);

    } catch (err) {
        console.error(err);
        updateConnectionStatus(false, false);
    }
}

window.onload = function () {
    loadSettings();
    checkConnectionStatus();
    // Re-check every 5 seconds
    setInterval(checkConnectionStatus, 5000);
};