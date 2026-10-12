const BASE_URL = "";

async function loadLogs() {
    try {
        const response = await fetch(`${BASE_URL}/api/logs`);
        const data = await response.json();

        const table = document.getElementById("logTable");
        const filterActive = document.getElementById("weedFilter").checked;

        const filtered = filterActive
            ? data.filter(log => log.status === "Weed detected")
            : data;

        const countEl = document.getElementById("log-count");
        if (countEl) countEl.innerText = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

        if (filtered.length === 0) {
            table.innerHTML = `<tr><td colspan="5" class="logs-table-empty">No logs yet. Waiting for ESP32 data...</td></tr>`;
            return;
        }

        table.innerHTML = "";

        filtered.forEach((log, i) => {
            const timeStr = log.time
                ? new Date(log.time).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                  })
                : "--";

            const isWeed = log.status === "Weed detected";
            const isAi = log.source === "ai-vision";
            const sourceText = isAi ? (log.modelVersion ? `${log.modelVersion} AI` : "YOLOv8 AI") : "ESP32 Sensor";
            const metricText = isAi && log.confidence != null
                ? `Conf: ${(log.confidence * 100).toFixed(0)}%`
                : (log.moisture != null ? log.moisture + "%" : "--");
            const rowNumber = filtered.length - i;

            let row = `
                <tr>
                    <td class="logs-row-number">${rowNumber}</td>
                    <td>${timeStr}</td>
                    <td>
                        <span class="status ${isWeed ? 'danger' : 'success'}">
                            ${isWeed ? '⚠ Weed Detected' : '✔ Clear'}
                        </span>
                    </td>
                    <td class="logs-moisture">${metricText}</td>
                    <td>${sourceText}</td>
                </tr>`;
            table.innerHTML += row;
        });

    } catch (error) {
        const table = document.getElementById("logTable");
        table.innerHTML = `<tr><td colspan="5" class="logs-table-error">
            ⚠ Cannot reach backend<br>
            <small>Make sure server is running on the same network</small>
        </td></tr>`;
    }
}

async function updateDeviceStatus() {
    try {
        const response = await fetch(`${BASE_URL}/api/status`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        const dot = document.getElementById("device-dot");
        const text = document.getElementById("device-status-text");
        const isConnected = data.esp32Connected === true;
        if (dot) dot.style.background = isConnected ? "var(--green-400)" : "var(--red-500)";
        if (text) text.textContent = isConnected ? "Connected" : "Disconnected";
    } catch {
        const dot = document.getElementById("device-dot");
        const text = document.getElementById("device-status-text");
        if (dot) dot.style.background = "var(--red-500)";
        if (text) text.textContent = "Disconnected";
    }
}

function applyFilter() {
    loadLogs();
}

loadLogs();
updateDeviceStatus();
setInterval(() => {
    loadLogs();
    updateDeviceStatus();
}, 5000);