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
        const res = await fetch("http://192.168.12.135:5000/api/status");
        const data = await res.json();

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
        // 🔥 WEEDS REMOVED LOGIC (FINAL FIX)
        // ==============================
        if (isWeed && data.scansToday !== lastScan) {
            setTimeout(() => {
                fakeRemoved++;

                const kpiCards = document.querySelectorAll(".kpi-card .kpi-value");

                // Scans Today
                if (kpiCards[0]) kpiCards[0].innerText = data.scansToday ?? "--";

                // Weeds Detected
                if (kpiCards[1]) kpiCards[1].innerText = data.weedsDetected ?? "--";

                // 🔥 Weeds Removed (THIS WAS THE PROBLEM)
                if (kpiCards[2]) kpiCards[2].innerText = fakeRemoved;

            }, 2000);

            lastScan = data.scansToday;
        }

        // ==============================
        // 🔥 MOISTURE
        // ==============================
        const moistureEl = document.querySelector(".sensor-value");
        if (moistureEl && data.moisture != null) {
            moistureEl.innerText = data.moisture + "%";
        }

        // ==============================
        // 🔥 SYSTEM STATUS
        // ==============================
        const badge = document.getElementById("sys-badge");
        if (badge) {
            badge.textContent = "● System Online";
            badge.className = "sys-badge online";
        }

    } catch (error) {
        console.error("Error:", error);

        const badge = document.getElementById("sys-badge");
        if (badge) {
            badge.textContent = "● Offline";
            badge.className = "sys-badge refreshing";
        }
    }
}

// ==============================
// 🔁 AUTO REFRESH
// ==============================
loadStatus();
setInterval(loadStatus, 3000);