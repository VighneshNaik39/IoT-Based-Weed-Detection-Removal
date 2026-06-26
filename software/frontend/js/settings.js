const BASE_URL = "";
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
deviceInfo.textContent = isConnected ? 'ESP32-WROOM-32 Connected' : 'No device connected';    }
}

async function checkConnectionStatus() {
    try {
        const res = await fetch("/api/status");

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