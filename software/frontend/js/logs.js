const BASE_URL = "http://192.168.99.135:5000";

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
            table.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#888;padding:30px">No logs yet. Waiting for ESP32 data...</td></tr>`;
            return;
        }

        const reversed = [...filtered].reverse();
        table.innerHTML = "";

        reversed.forEach((log, i) => {
            const timeStr = log.time
                ? new Date(log.time).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                  })
                : "--";

            const isWeed = log.status === "Weed detected";
            const moisture = log.moisture != null ? log.moisture + "%" : "--";

            let row = `
                <tr>
                    <td style="color:#aaa;font-size:12px">${reversed.length - i}</td>
                    <td>${timeStr}</td>
                    <td>
                        <span class="status ${isWeed ? 'danger' : 'success'}">
                            ${isWeed ? '⚠ Weed Detected' : '✔ Clear'}
                        </span>
                    </td>
                    <td style="font-weight:600">${moisture}</td>
                    <td>ESP32 Sensor</td>
                </tr>`;
            table.innerHTML += row;
        });

    } catch (error) {
        const table = document.getElementById("logTable");
        table.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#c0392b;padding:30px">
            ⚠ Cannot reach backend at 192.168.99.135:5000<br>
            <small style="color:#aaa">Make sure server is running on the same network</small>
        </td></tr>`;
    }
}

function applyFilter() {
    loadLogs();
}

// Auto refresh every 5 seconds
loadLogs();
setInterval(loadLogs, 5000);