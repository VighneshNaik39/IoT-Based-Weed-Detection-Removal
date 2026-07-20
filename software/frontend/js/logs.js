// ==========================================
// logs.js
// Robot Activity Logs
// ==========================================

// DOM Elements
const logsBody = document.getElementById("logsBody");
const searchInput = document.getElementById("searchInput");

const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");

const totalLogs = document.getElementById("totalLogs");
const todayLogs = document.getElementById("todayLogs");
const lastCommand = document.getElementById("lastCommand");

let robotLogs = [];

// ==========================================
// Page Load
// ==========================================

window.onload = () => {

    loadLogs();

};

// ==========================================
// Load Logs
// ==========================================

async function loadLogs() {

    try {

        robotLogs = await robotAPI.getLogs();

        if (!Array.isArray(robotLogs)) {

            robotLogs = [];

        }

        displayLogs(robotLogs);

        updateStatistics();

    }

    catch (error) {

        console.error(error);

    }

}

// ==========================================
// Display Logs
// ==========================================

function displayLogs(logs) {

    logsBody.innerHTML = "";

    if (logs.length === 0) {

        logsBody.innerHTML = `

        <tr>

            <td colspan="4">

                No Logs Found

            </td>

        </tr>

        `;

        return;

    }

    logs.forEach((log, index) => {

        const row = document.createElement("tr");

        row.innerHTML = `

            <td>${index + 1}</td>

            <td>${log.time || "--"}</td>

            <td>${log.command || "--"}</td>

            <td class="${getStatusClass(log.status)}">

                ${log.status || "Success"}

            </td>

        `;

        logsBody.appendChild(row);

    });

}

// ==========================================
// Status Color
// ==========================================

function getStatusClass(status) {

    if (!status) return "success";

    status = status.toLowerCase();

    if (status.includes("error")) return "error";

    if (status.includes("warning")) return "warning";

    return "success";

}

// ==========================================
// Statistics
// ==========================================

function updateStatistics() {

    totalLogs.innerHTML = robotLogs.length;

    todayLogs.innerHTML = robotLogs.length;

    if (robotLogs.length > 0) {

        lastCommand.innerHTML = robotLogs[robotLogs.length - 1].command;

    } else {

        lastCommand.innerHTML = "None";

    }

}

// ==========================================
// Search Logs
// ==========================================

searchInput.addEventListener("keyup", function () {

    const keyword = this.value.toLowerCase();

    const filtered = robotLogs.filter(log =>

        (log.command || "")
            .toLowerCase()
            .includes(keyword)

    );

    displayLogs(filtered);

});

// ==========================================
// Refresh
// ==========================================

refreshBtn.addEventListener("click", () => {

    loadLogs();

});

// ==========================================
// Clear Logs
// ==========================================

clearBtn.addEventListener("click", async () => {

    const confirmDelete = confirm("Clear all logs?");

    if (!confirmDelete) return;

    await robotAPI.clearLogs();

    robotLogs = [];

    displayLogs(robotLogs);

    updateStatistics();

    alert("Logs Cleared");

});

// ==========================================
// Export CSV
// ==========================================

exportBtn.addEventListener("click", exportCSV);

function exportCSV() {

    if (robotLogs.length === 0) {

        alert("No logs to export.");

        return;

    }

    let csv = "Time,Command,Status\n";

    robotLogs.forEach(log => {

        csv += `${log.time},${log.command},${log.status}\n`;

    });

    const blob = new Blob([csv], {

        type: "text/csv"

    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = "robot_logs.csv";

    a.click();

    URL.revokeObjectURL(url);

}

// ==========================================
// Auto Refresh
// ==========================================

setInterval(loadLogs, 5000);

// ==========================================
// Console
// ==========================================

console.log("Logs Page Loaded");