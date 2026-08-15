const BASE_URL = "";

// -------------------------
// Save settings to backend
// -------------------------
async function saveSettings() {
    const settings = {
        autoDetect: document.getElementById("autoDetect").checked,
        alerts: document.getElementById("alerts").checked,
        autoRemove: document.getElementById("autoRemove").checked,
        robotSpeed: Number(document.getElementById("robotSpeed").value),
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

        if (settings.robotSpeed !== undefined) {
            document.getElementById("robotSpeed").value = settings.robotSpeed;
            document.getElementById("robotSpeedValue").textContent = settings.robotSpeed;
        }
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
// Connection status (System Information card)
// -------------------------
function updateConnectionStatus(isConnected) {
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
}

async function checkConnectionStatus() {
    try {
        const res = await fetch(`${BASE_URL}/api/status`);

        if (!res.ok) throw new Error();

        const data = await res.json();

        console.log("Backend Status:", data);

        updateConnectionStatus(true);

    } catch (err) {
        console.error(err);
        updateConnectionStatus(false);
    }
}

window.onload = function () {
    loadSettings();

    // Live-update the speed slider's numeric readout as it's dragged
    const speedSlider = document.getElementById("robotSpeed");
    const speedValue = document.getElementById("robotSpeedValue");
    speedSlider.addEventListener("input", () => {
        speedValue.textContent = speedSlider.value;
    });

    checkConnectionStatus();
    // Re-check every 5 seconds
    setInterval(checkConnectionStatus, 5000);
};
