// Load logs from backend API
async function loadLogs() {
    try {
        const response = await fetch("http://localhost:5000/api/logs");
        const data = await response.json();

        const table = document.getElementById("logTable");
        table.innerHTML = "";

        let filterActive = document.getElementById("weedFilter").checked;

        data.forEach(log => {
            if (filterActive && log.status !== "Weed detected") return;

            let row = `
                <tr>
                    <td>${log.time}</td>
                    <td>
                        <span class="status ${log.status === "Weed detected" ? "danger" : "success"}">
                            ${log.status === "Weed detected" ? "✖" : "✔"} ${log.status}
                        </span>
                    </td>
                    <td>ESP32 Sensor</td>
                </tr>
            `;
            table.innerHTML += row;
        });

    } catch (error) {
        console.error("Error loading logs:", error);
    }
}

// Filter function
function applyFilter() {
    loadLogs();
}

// 🔄 Auto refresh every 5 sec
setInterval(() => {
    loadLogs();
}, 5000);

// Initial load
loadLogs();