function saveSettings() {
    const settings = {
        autoDetect: document.getElementById("autoDetect").checked,
        alerts: document.getElementById("alerts").checked,
        autoRemove: document.getElementById("autoRemove").checked
    };

    // Save locally (for demo)
    localStorage.setItem("weedSettings", JSON.stringify(settings));

    alert("Settings saved successfully!");
}

// Function to update connection status
function updateConnectionStatus(isConnected, deviceName = null) {
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
    
    // Update device name
    if (deviceInfo) {
        if (deviceName) {
            deviceInfo.textContent = deviceName;
        } else {
            deviceInfo.textContent = 'No device connected';
        }
    }
}

// Simulate connection status check (in real app, this would check actual device connection)
function checkConnectionStatus() {
    // For demo purposes, we'll keep it disconnected until you manually connect
    // In real implementation, this would check actual device status via API/WebSocket
    updateConnectionStatus(false, null);
}

// Load settings on page load
window.onload = function () {
    const saved = JSON.parse(localStorage.getItem("weedSettings"));

    if (saved) {
        document.getElementById("autoDetect").checked = saved.autoDetect;
        document.getElementById("alerts").checked = saved.alerts;
        document.getElementById("autoRemove").checked = saved.autoRemove;
    }

    // Start with disconnected state (no device) and keep it that way
    updateConnectionStatus(false, null);
    
    // Remove automatic checking to prevent fluctuation
    // You can manually call updateConnectionStatus() when device actually connects
};