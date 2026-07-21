// ==========================================
// Alerts Dashboard
// ==========================================

// DOM Elements
const alertTable = document.getElementById("alertTable");
const criticalCount = document.getElementById("criticalCount");
const warningCount = document.getElementById("warningCount");
const systemStatus = document.getElementById("systemStatus");

const clearBtn = document.getElementById("clearAlerts");
const refreshBtn = document.getElementById("refreshAlerts");

// ==========================================
// Alert Storage
// ==========================================

let alerts = [];

// ==========================================
// Load Alerts
// ==========================================

async function loadAlerts() {

    try {

        const response = await fetch("http://localhost:3000/alerts");

        if (!response.ok) {

            throw new Error("Backend not available");

        }

        alerts = await response.json();

    }

    catch (error) {

        // Demo Data
        alerts = [

            {
                time: "10:15 AM",
                type: "Battery",
                message: "Battery below 20%",
                status: "Critical"
            },

            {
                time: "10:18 AM",
                type: "Obstacle",
                message: "Obstacle detected",
                status: "Warning"
            },

            {
                time: "10:22 AM",
                type: "ESP32",
                message: "ESP32 Connected",
                status: "OK"
            }

        ];

    }

    updateTable();

}

// ==========================================
// Update Table
// ==========================================

function updateTable() {

    alertTable.innerHTML = "";

    let critical = 0;
    let warning = 0;

    alerts.forEach(alert => {

        if (alert.status === "Critical") critical++;

        if (alert.status === "Warning") warning++;

        const row = document.createElement("tr");

        row.innerHTML = `

            <td>${alert.time}</td>

            <td>${alert.type}</td>

            <td>${alert.message}</td>

            <td class="${statusClass(alert.status)}">

                ${alert.status}

            </td>

        `;

        alertTable.appendChild(row);

    });

    if (alerts.length === 0) {

        alertTable.innerHTML = `

        <tr>

            <td colspan="4">

                No Alerts Available

            </td>

        </tr>

        `;

    }

    criticalCount.innerHTML = critical;

    warningCount.innerHTML = warning;

    if (critical > 0) {

        systemStatus.innerHTML = "Critical";

        systemStatus.style.color = "#FF5252";

    }

    else if (warning > 0) {

        systemStatus.innerHTML = "Warning";

        systemStatus.style.color = "#FFC107";

    }

    else {

        systemStatus.innerHTML = "Healthy";

        systemStatus.style.color = "#00E676";

    }

}

// ==========================================
// Status Color
// ==========================================

function statusClass(status) {

    switch (status) {

        case "Critical":

            return "status-critical";

        case "Warning":

            return "status-warning";

        default:

            return "status-ok";

    }

}

// ==========================================
// Clear Alerts
// ==========================================

clearBtn.addEventListener("click", async () => {

    const ok = confirm("Clear all alerts?");

    if (!ok) return;

    alerts = [];

    updateTable();

    try {

        await fetch("http://localhost:3000/alerts/clear", {

            method: "DELETE"

        });

    }

    catch (e) {

        console.log("Backend unavailable");

    }

});

// ==========================================
// Refresh
// ==========================================

refreshBtn.addEventListener("click", () => {

    loadAlerts();

});

// ==========================================
// Notification
// ==========================================

function notify(message) {

    const toast = document.createElement("div");

    toast.innerHTML = message;

    toast.style.position = "fixed";
    toast.style.top = "20px";
    toast.style.right = "20px";
    toast.style.background = "#FF5252";
    toast.style.color = "#fff";
    toast.style.padding = "15px 20px";
    toast.style.borderRadius = "8px";
    toast.style.fontWeight = "bold";
    toast.style.zIndex = "9999";

    document.body.appendChild(toast);

    setTimeout(() => {

        toast.remove();

    }, 3000);

}

// ==========================================
// Check for New Critical Alerts
// ==========================================

let previousCritical = 0;

function monitorCriticalAlerts() {

    const currentCritical = alerts.filter(
        a => a.status === "Critical"
    ).length;

    if (currentCritical > previousCritical) {

        notify("🚨 New Critical Alert!");

    }

    previousCritical = currentCritical;

}

// ==========================================
// Auto Refresh
// ==========================================

setInterval(async () => {

    await loadAlerts();

    monitorCriticalAlerts();

}, 5000);

// ==========================================
// Initial Load
// ==========================================

loadAlerts();

console.log("Alerts Dashboard Loaded");