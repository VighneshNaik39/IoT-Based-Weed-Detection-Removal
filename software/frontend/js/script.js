// ==============================
// 🔥 FAKE REMOVAL STATE
// ==============================
let fakeRemoved = 0;
let lastScan = null;

// ==============================
// LOAD STATUS FUNCTION
// ==============================
async function loadStatus() {
    try {

        // ==============================
        // 🔥 FETCH STATUS
        // ==============================
        const res = await fetch("/api/status");

        if (!res.ok) {
            throw new Error("Backend not reachable");
        }

        const data = await res.json();

        console.log("STATUS DATA:", data);

        const isWeed = data.status === "Weed detected";

        // ==============================
        // 🔥 STATUS UI
        // ==============================
        if (isWeed) {
            showWeedUI();
        } else {
            showClearUI();
        }

        // ==============================
        // 🔥 KPI CARDS
        // ==============================
        const kpiCards = document.querySelectorAll(".kpi-card .kpi-value");

        // Scans Today
        if (kpiCards[0]) {
            kpiCards[0].innerText = data.scansToday ?? "--";
        }

        // Weeds Detected
        if (kpiCards[1]) {
            kpiCards[1].innerText = data.weedsDetected ?? "--";
        }

        // ==============================
        // 🔥 AUTO REMOVAL COUNTER
        // ==============================
        if (isWeed && data.scansToday !== lastScan) {

            setTimeout(() => {

                fakeRemoved++;

                if (kpiCards[2]) {
                    kpiCards[2].innerText = fakeRemoved;
                }

            }, 2000);

            lastScan = data.scansToday;
        }

        // Default removed count
        if (kpiCards[2] && fakeRemoved === 0) {
            kpiCards[2].innerText = data.weedsRemoved ?? 0;
        }

        // ==============================
        // 🔥 MOISTURE
        // ==============================
        const moistureEl = document.querySelector(".sensor-value");

        if (moistureEl) {
            moistureEl.innerText =
                data.moisture != null
                    ? data.moisture + "%"
                    : "--%";
        }

        // ==============================
        // 🔥 BATTERY
        // ==============================
        const batteryEl = document.querySelector(".battery-value");

        if (batteryEl) {
            batteryEl.innerText = (data.battery ?? 80) + "%";
        }

        // ==============================
        // 🔥 BACKEND STATUS
        // ==============================
        const backendStatus = document.getElementById("backendStatus");

        if (backendStatus) {
            backendStatus.textContent = "Reachable ✅";
            backendStatus.style.color = "green";
        }

        // ==============================
        // 🔥 BACKEND IP
        // ==============================
        const backendIp = document.getElementById("backendIp");

        if (backendIp) {
            backendIp.textContent = window.location.host;
        }

        // ==============================
        // 🔥 LAST DATA
        // ==============================
        const lastData = document.getElementById("lastData");

        if (lastData) {
            lastData.textContent = data.time
                ? new Date(data.time).toLocaleTimeString()
                : "Waiting...";
        }

        // ==============================
        // 🔥 SYSTEM STATUS BADGE
        // ==============================
        const badge = document.getElementById("sys-badge");

        if (badge) {
            badge.textContent = "● System Online";
            badge.className = "sys-badge online";
        }

    } catch (error) {

        console.error("STATUS ERROR:", error);

        // ==============================
        // 🔥 OFFLINE BADGE
        // ==============================
        const badge = document.getElementById("sys-badge");

        if (badge) {
            badge.textContent = "● Offline";
            badge.className = "sys-badge refreshing";
        }

        // ==============================
        // 🔥 BACKEND STATUS
        // ==============================
        const backendStatus = document.getElementById("backendStatus");

        if (backendStatus) {
            backendStatus.textContent = "Unreachable ❌";
            backendStatus.style.color = "red";
        }
    }
}

// ==============================
// 🔁 AUTO REFRESH
// ==============================
loadStatus();
setInterval(loadStatus, 3000);