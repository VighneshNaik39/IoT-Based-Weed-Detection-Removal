// ==============================
// LOAD STATUS FUNCTION
// ==============================
async function loadStatus() {

    try {

        // ==============================
        // FETCH STATUS
        // ==============================
        const res =
            await fetch("/api/status");

        if (!res.ok) {
            throw new Error(
                "Backend not reachable"
            );
        }

        const data =
            await res.json();

        console.log(
            "STATUS DATA:",
            data
        );

        const isWeed =
            data.status ===
            "Weed detected";

        // ==============================
        // FIELD STATUS UI
        // ==============================
        if (isWeed) {

            showWeedUI();

        } else {

            showClearUI();
        }

        // ==============================
        // KPI CARDS
        // ==============================
        const scansEl =
            document.getElementById(
                "kpi-scans"
            );

        if (scansEl) {

            scansEl.innerText =
                data.scansToday ?? 0;
        }

        const weedsEl =
            document.getElementById(
                "kpi-weeds"
            );

        if (weedsEl) {

            weedsEl.innerText =
                data.weedsDetected ?? 0;
        }

        const removedEl =
            document.getElementById(
                "kpi-removed"
            );

        if (removedEl) {

            removedEl.innerText =
                data.weedsRemoved ?? 0;
        }

        // ==============================
        // ALERT BADGE
        // ==============================
        const alertBadge =
            document.getElementById(
                "alert-badge"
            );

        if (alertBadge) {

            alertBadge.innerText =
                data.weedsDetected ?? 0;
        }

        // ==============================
        // SOIL MOISTURE
        // ==============================
        if (data.moisture != null) {

            const kpiMoisture =
                document.getElementById(
                    "kpi-moisture"
                );

            const sensorMoisture =
                document.getElementById(
                    "sensor-moisture"
                );

            const kpiBar =
                document.getElementById(
                    "kpi-moisture-bar"
                );

            const sensorBar =
                document.getElementById(
                    "sensor-moisture-bar"
                );

            if (kpiMoisture) {
                kpiMoisture.innerText =
                    data.moisture + "%";
            }

            if (sensorMoisture) {
                sensorMoisture.innerText =
                    data.moisture + "%";
            }

            if (kpiBar) {
                kpiBar.style.width =
                    data.moisture + "%";
            }

            if (sensorBar) {
                sensorBar.style.width =
                    data.moisture + "%";
            }
        }

        // ==============================
        // BATTERY
        // ==============================
        const batteryEl =
            document.getElementById(
                "kpi-battery"
            );

        const batteryBar =
            document.getElementById(
                "kpi-battery-bar"
            );

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
        // LAST DATA TIME
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
            document.getElementById(
                "sys-badge"
            );

        if (badge) {

            badge.textContent =
                "● System Online";

            badge.className =
                "sys-badge online";
        }

        // ==============================
        // DEVICE STATUS
        // ==============================
        const deviceDot =
            document.getElementById(
                "device-dot"
            );

        if (deviceDot) {

            deviceDot.style.background =
                "var(--green-400)";
        }

        const deviceText =
            document.getElementById(
                "device-status-text"
            );

        if (deviceText) {

            deviceText.innerText =
                "Connected · Live";
        }

        // ==============================
        // LOAD LOGS + HISTORY
        // ==============================
        await loadHistory();

    } catch (error) {

        console.error(
            "STATUS ERROR:",
            error
        );

        const badge =
            document.getElementById(
                "sys-badge"
            );

        if (badge) {

            badge.textContent =
                "● Offline";

            badge.className =
                "sys-badge refreshing";
        }

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
    }
}

// ==============================
// LOAD HISTORY + LOGS
// ==============================
async function loadHistory() {

    try {

        const res =
            await fetch("/api/logs");

        const logs =
            await res.json();

        // =================================
        // FILTER WEED LOGS
        // =================================
        const weedLogs =
            logs.filter(
                log =>
                    log.status ===
                    "Weed detected"
            );

        // =================================
        // CURRENT SESSION
        // =================================
        const currentSession =
            document.getElementById(
                "current-session-detections"
            );

        if (currentSession) {

            currentSession.innerText =
    document.getElementById(
        "kpi-weeds"
    ).innerText;
        }

        // =================================
        // TOTAL DETECTIONS
        // =================================
        const totalEl =
            document.getElementById(
                "overall-total-detections"
            );

        if (totalEl) {

            totalEl.innerText =
                weedLogs.length;
        }

        // =================================
        // AVG MOISTURE
        // =================================
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

        // =================================
// LAST 5 DETECTION STATISTICS
// =================================
const latestFive =
    weedLogs.slice(0, 5);
    console.log("LATEST FIVE:", latestFive);

// Count
const countEl =
    document.getElementById(
        "last5-count"
    );

if (countEl) {

    countEl.innerText =
        latestFive.length;
}

// Avg moisture
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

// Latest detection
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
        // =================================
        // ACTIVITY LOGS
        // =================================
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

                    logList.innerHTML += `
                        <li class="log-row">

                            <span class="log-time">
                                ${new Date(
                                    log.time
                                ).toLocaleTimeString()}
                            </span>

                            <span class="log-zone">
                                ESP32
                            </span>

                            <span class="log-msg ${
                                isWeed
                                    ? "warn"
                                    : "ok"
                            }">

                                ${
                                    isWeed
                                        ? "⚠ Weed detected"
                                        : "✔ No weed"
                                }

                                — Moisture:
                                ${log.moisture ?? "--"}%

                            </span>

                        </li>
                    `;
                });
        }

    } catch (err) {

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