// ==============================
// LOAD STATUS FUNCTION
// ==============================

async function loadStatus() {
    try {

        // ==============================
        // FETCH STATUS
        // ==============================

        const res = await fetch("/api/status", {
            cache: "no-store"
        });

        if (!res.ok) {
            throw new Error("Backend not reachable");
        }

        const data = await res.json();

        console.log("STATUS DATA:", data);

        // ==============================
        // FIELD STATUS
        // ==============================

        const isWeed =
            data.status === "Weed detected";

        if (isWeed) {
            showWeedUI();
        } else {
            showClearUI();
        }

        // ==============================
        // KPI - SCANS
        // ==============================

        const scansEl =
            document.getElementById("kpi-scans");

        if (scansEl) {
            scansEl.innerText =
                data.scansToday ?? 0;
        }

        // ==============================
        // KPI - WEEDS
        // ==============================

        const weedsEl =
            document.getElementById("kpi-weeds");

        if (weedsEl) {
            weedsEl.innerText =
                data.weedsDetected ?? 0;
        }

        // ==============================
        // KPI - REMOVED
        // ==============================

        const removedEl =
            document.getElementById("kpi-removed");

        if (removedEl) {
            removedEl.innerText =
                data.weedsRemoved ?? 0;
        }

        // ==============================
        // ALERT BADGE
        // ==============================

        const alertBadge =
            document.getElementById("alert-badge");

        if (alertBadge) {
            alertBadge.innerText =
                data.weedsDetected ?? 0;
        }

        // ==============================
        // SOIL MOISTURE
        // ==============================

        if (data.moisture != null) {

            const kpiMoisture =
                document.getElementById("kpi-moisture");

            const kpiBar =
                document.getElementById("kpi-moisture-bar");

            if (kpiMoisture) {
                kpiMoisture.innerText =
                    data.moisture + "%";
            }

            if (kpiBar) {
                kpiBar.style.width =
                    data.moisture + "%";
            }
        }

        // ==============================
        // BATTERY
        // ==============================

        const batteryEl =
            document.getElementById("kpi-battery");

        const batteryBar =
            document.getElementById("kpi-battery-bar");

        if (batteryEl) {
            batteryEl.innerText =
                (data.battery ?? 80) + "%";
        }

        if (batteryBar) {
            batteryBar.style.width =
                (data.battery ?? 80) + "%";
        }

        // ==============================
        // BACKEND STATUS
        // ==============================

        const backendStatus =
            document.getElementById(
                "device-backend-status"
            );

        if (backendStatus) {
            backendStatus.innerText =
                "Connected ✔";

            backendStatus.style.color =
                "var(--green-500)";
        }

        // ==============================
        // BACKEND IP
        // ==============================

        const backendIp =
            document.getElementById(
                "device-backend-ip"
            );

        if (backendIp) {
            backendIp.innerText =
                window.location.host;
        }

        // ==============================
        // LAST DATA
        // ==============================

        const lastData =
            document.getElementById(
                "device-last-data"
            );

        if (lastData) {

            lastData.innerText =
                data.time
                    ? new Date(
                        data.time
                    ).toLocaleTimeString()
                    : "Waiting...";
        }

        // ==============================
        // SYSTEM BADGE
        // ==============================

        const badge =
            document.getElementById("sys-badge");

        if (badge) {

            badge.textContent =
                "● System Online";

            badge.className =
                "sys-badge online";
        }

        // =====================================================
        // ESP32 CONNECTION STATUS
        // =====================================================

        const deviceDot =
            document.getElementById("device-dot");

        const deviceText =
            document.getElementById(
                "device-status-text"
            );

        /*
         * IMPORTANT:
         * The dashboard now uses the REAL ESP32
         * connection value returned by /api/status.
         *
         * The backend should return:
         *
         * esp32Connected: true
         *
         * when the robot ESP32 has recently
         * sent data to /api/update.
         */

        const esp32Connected =
            data.esp32Connected === true;

        if (deviceDot) {

            deviceDot.style.background =
                esp32Connected
                    ? "var(--green-400)"
                    : "var(--red-500)";
        }

        if (deviceText) {

            deviceText.innerText =
                esp32Connected
                    ? "Connected · Live"
                    : "Disconnected";
        }

        // ==============================
        // LOAD LOGS + HISTORY
        // ==============================

        await loadHistory();

    }

    catch (error) {

        console.error(
            "STATUS ERROR:",
            error
        );

        // ==============================
        // SYSTEM OFFLINE
        // ==============================

        const badge =
            document.getElementById("sys-badge");

        if (badge) {

            badge.textContent =
                "● Offline";

            badge.className =
                "sys-badge refreshing";
        }

        // ==============================
        // BACKEND UNREACHABLE
        // ==============================

        const backendStatus =
            document.getElementById(
                "device-backend-status"
            );

        if (backendStatus) {

            backendStatus.innerText =
                "Unreachable ❌";

            backendStatus.style.color =
                "var(--red-600)";
        }

        // ==============================
        // ESP32 OFFLINE
        // ==============================

        const deviceDot =
            document.getElementById("device-dot");

        const deviceText =
            document.getElementById(
                "device-status-text"
            );

        if (deviceDot) {
            deviceDot.style.background =
                "var(--red-500)";
        }

        if (deviceText) {
            deviceText.innerText =
                "Disconnected";
        }
    }
}


// ==============================
// LOAD HISTORY + LOGS
// ==============================

async function loadHistory() {

    try {

        const res =
            await fetch("/api/logs", {
                cache: "no-store"
            });

        if (!res.ok) {
            throw new Error("Unable to load logs");
        }

        const logs =
            await res.json();

        // ==============================
        // FILTER WEED LOGS
        // ==============================

        const weedLogs =
            logs.filter(
                log =>
                    log.status ===
                    "Weed detected"
            );

        // ==============================
        // CURRENT SESSION
        // ==============================

        const currentSession =
            document.getElementById(
                "current-session-detections"
            );

        const kpiWeeds =
            document.getElementById(
                "kpi-weeds"
            );

        if (currentSession && kpiWeeds) {

            currentSession.innerText =
                kpiWeeds.innerText;
        }

        // ==============================
        // TOTAL DETECTIONS
        // ==============================

        const totalEl =
            document.getElementById(
                "overall-total-detections"
            );

        if (totalEl) {

            totalEl.innerText =
                weedLogs.length;
        }

        // ==============================
        // AVG MOISTURE
        // ==============================

        const avgEl =
            document.getElementById(
                "overall-avg-moisture"
            );

        if (avgEl) {

            const avg =
                weedLogs.length > 0
                    ? Math.round(
                        weedLogs.reduce(
                            (sum, log) =>
                                sum +
                                (log.moisture || 0),
                            0
                        ) / weedLogs.length
                    )
                    : 0;

            avgEl.innerText =
                avg + "%";
        }

        // ==============================
        // LAST 5 DETECTION STATISTICS
        // ==============================

        const latestFive =
            weedLogs.slice(0, 5);

        console.log(
            "LATEST FIVE:",
            latestFive
        );

        // ==============================
        // LAST 5 COUNT
        // ==============================

        const countEl =
            document.getElementById(
                "last5-count"
            );

        if (countEl) {

            countEl.innerText =
                latestFive.length;
        }

        // ==============================
        // LAST 5 AVG MOISTURE
        // ==============================

        const moistureEl =
            document.getElementById(
                "last5-moisture"
            );

        if (moistureEl) {

            const avg =
                latestFive.length > 0
                    ? Math.round(
                        latestFive.reduce(
                            (sum, log) =>
                                sum +
                                (log.moisture || 0),
                            0
                        ) / latestFive.length
                    )
                    : 0;

            moistureEl.innerText =
                avg + "%";
        }

        // ==============================
        // LATEST DETECTION
        // ==============================

        const latestEl =
            document.getElementById(
                "last5-latest"
            );

        if (latestEl) {

            latestEl.innerText =
                latestFive.length > 0
                    ? new Date(
                        latestFive[0].time
                    ).toLocaleString()
                    : "--";
        }

        // ==============================
        // ACTIVITY LOGS
        // ==============================

        const logList =
            document.getElementById(
                "log-list"
            );

        if (logList) {

            logList.innerHTML = "";

            logs
                .slice(0, 10)
                .forEach(log => {

                    const isWeed =
                        log.status ===
                        "Weed detected";

                    const time =
                        log.time
                            ? new Date(
                                log.time
                            ).toLocaleTimeString()
                            : "--";

                    const moisture =
                        log.moisture ??
                        "--";

                    const message =
                        isWeed
                            ? "⚠ Weed detected"
                            : "✔ No weed";

                    const messageClass =
                        isWeed
                            ? "warn"
                            : "ok";

                    logList.innerHTML += `
                        <li class="log-row">

                            <span class="log-time">
                                ${time}
                            </span>

                            <span class="log-zone">
                                ESP32
                            </span>

                            <span class="log-msg ${messageClass}">
                                ${message}
                                — Moisture:
                                ${moisture}%
                            </span>

                        </li>
                    `;
                });
        }

    }

    catch (err) {

        console.error(
            "HISTORY ERROR:",
            err
        );
    }
}


// ==============================
// AUTO REFRESH
// ==============================

loadStatus();

setInterval(
    loadStatus,
    3000
);