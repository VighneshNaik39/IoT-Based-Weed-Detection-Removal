const BASE_URL = "http://192.168.99.135:5000";

function saveSettings() {
    const settings = {
        autoDetect: document.getElementById("autoDetect").checked,
        alerts: document.getElementById("alerts").checked,
        autoRemove: document.getElementById("autoRemove").checked
    };

    localStorage.setItem("weedSettings", JSON.stringify(settings));
    alert("✅ Settings saved successfully!");
}

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
        deviceInfo.textContent = isConnected ? 'ESP32-WROOM-32 @ 192.168.99.135' : 'No device connected';
    }
}

async function checkConnectionStatus() {
    try {
        const res = await fetch(`${BASE_URL}/api/status`);
        if (res.ok) {
            updateConnectionStatus(true);
        } else {
            updateConnectionStatus(false);
        }
    } catch (err) {
        updateConnectionStatus(false);
    }
}

window.onload = function () {
    const saved = JSON.parse(localStorage.getItem("weedSettings"));
    if (saved) {
        document.getElementById("autoDetect").checked = saved.autoDetect;
        document.getElementById("alerts").checked = saved.alerts;
        document.getElementById("autoRemove").checked = saved.autoRemove;
    }

    checkConnectionStatus();
    // Re-check every 5 seconds
    setInterval(checkConnectionStatus, 5000);
};