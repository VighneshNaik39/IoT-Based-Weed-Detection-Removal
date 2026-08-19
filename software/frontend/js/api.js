// ============================================================
// WEEDGUARD API
// Backend + ESP32 Camera + GPS
// ============================================================


// ============================================================
// BACKEND
// ============================================================

const BASE_URL = "";


// ============================================================
// ESP32 CAMERA
// ============================================================

// CHANGE THIS TO YOUR ESP32 IP
//
// Example:
// 10.15.101.232

const ESP32_CAMERA_IP = "YOUR_ESP32_IP";


// ============================================================
// CAMERA URL
// ============================================================

function getDetectionStreamUrl() {

    return `http://${ESP32_CAMERA_IP}:81/stream`;

}


function getCameraCaptureUrl() {

    return `http://${ESP32_CAMERA_IP}/capture`;

}


// ============================================================
// DETECTION STATUS
// ============================================================

async function getDetectionStatus() {

    const response =
        await fetch(
            `${BASE_URL}/api/detection/status`,
            {
                method: "GET",
                cache: "no-store",
                headers: {
                    "Accept":
                        "application/json"
                }
            }
        );


    if (!response.ok) {

        throw new Error(
            `Detection status HTTP ${response.status}`
        );

    }


    return await response.json();

}


// ============================================================
// CAMERA HEALTH
// ============================================================

async function getDetectionStreamHealth() {

    return new Promise(
        (resolve) => {

            const img =
                new Image();

            let completed = false;


            function finish(result) {

                if (completed) {
                    return;
                }

                completed = true;

                resolve(result);

            }


            img.onload =
                function() {

                    finish({
                        ok: true,
                        status: 200
                    });

                };


            img.onerror =
                function() {

                    finish({
                        ok: false,
                        status: 0,
                        error:
                            "ESP32 camera unavailable"
                    });

                };


            img.src =
                `${getDetectionStreamUrl()}?t=${Date.now()}`;


            setTimeout(
                function() {

                    finish({
                        ok: false,
                        status: 0,
                        error:
                            "Camera timeout"
                    });

                },
                5000
            );

        }
    );

}


// ============================================================
// GPS
// ============================================================

async function getGPSLocation() {

    const response =
        await fetch(
            `${BASE_URL}/api/gps/location`,
            {
                method: "GET",
                cache: "no-store",
                headers: {
                    "Accept":
                        "application/json"
                }
            }
        );


    if (!response.ok) {

        throw new Error(
            `GPS HTTP ${response.status}`
        );

    }


    return await response.json();

}


// ============================================================
// STATUS
// ============================================================

async function loadStatusFromBackend() {

    try {

        const res =
            await fetch(
                `${BASE_URL}/api/status`,
                {
                    cache: "no-store"
                }
            );


        if (!res.ok) {

            throw new Error(
                `Status HTTP ${res.status}`
            );

        }


        const data =
            await res.json();


        console.log(
            "API DATA:",
            data
        );


        const isWeed =
            data.status ===
            "Weed detected";


        if (isWeed) {

            showWeedUI();

        } else {

            showClearUI();

        }


        // KPI

        const kpiCards =
            document.querySelectorAll(
                ".kpi-card .kpi-value"
            );


        if (kpiCards[0]) {

            kpiCards[0].innerText =
                data.scansToday ?? "--";

        }


        if (kpiCards[1]) {

            kpiCards[1].innerText =
                data.weedsDetected ?? "--";

        }


        if (kpiCards[2]) {

            kpiCards[2].innerText =
                data.weedsRemoved ?? 0;

        }


        // Battery

        const battery =
            data.battery ?? 80;


        const batteryEl =
            document.querySelector(
                ".kpi-card:nth-child(5) .kpi-value"
            );


        const batteryBar =
            document.querySelector(
                ".kpi-card:nth-child(5) .kpi-bar-fill"
            );


        if (batteryEl) {

            batteryEl.innerText =
                battery + "%";

        }


        if (batteryBar) {

            batteryBar.style.width =
                battery + "%";

        }


        // Moisture

        const moistureVal =
            document.querySelectorAll(
                ".sensor-value"
            )[0];


        const moistureFill =
            document.querySelectorAll(
                ".sensor-fill"
            )[0];


        if (
            moistureVal &&
            data.moisture != null
        ) {

            moistureVal.innerText =
                data.moisture + "%";


            if (moistureFill) {

                moistureFill.style.width =
                    data.moisture + "%";

            }

        }


        // System

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


    } catch (error) {

        console.warn(
            "Backend not reachable:",
            error.message
        );

    }

}


// ============================================================
// LOGS
// ============================================================

async function loadLogsFromBackend() {

    try {

        const res =
            await fetch(
                `${BASE_URL}/api/logs`,
                {
                    cache: "no-store"
                }
            );


        if (!res.ok) {

            throw new Error(
                `Logs HTTP ${res.status}`
            );

        }


        const logs =
            await res.json();


        const list =
            document.getElementById(
                "log-list"
            );


        if (!list) {

            return;

        }


        if (
            !Array.isArray(logs) ||
            logs.length === 0
        ) {

            list.innerHTML = `
                <li class="log-row">

                    <span class="log-time">
                        --
                    </span>

                    <span class="log-zone">
                        --
                    </span>

                    <span class="log-msg ok">
                        No logs yet
                    </span>

                </li>
            `;

            return;

        }


        const recent =
            [...logs]
                .reverse()
                .slice(0, 10);


        list.innerHTML = "";


        recent.forEach(
            log => {

                const time =
                    log.time
                        ? new Date(
                            log.time
                          ).toLocaleTimeString(
                            "en-US",
                            {
                                hour:
                                    "2-digit",
                                minute:
                                    "2-digit",
                                second:
                                    "2-digit"
                            }
                          )
                        : "--";


                const isWeed =
                    log.status ===
                    "Weed detected";


                const li =
                    document.createElement(
                        "li"
                    );


                li.className =
                    "log-row";


                li.innerHTML = `

                    <span class="log-time">
                        ${time}
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
                                : "✔ No weed — Field clear"
                        }

                    </span>

                `;


                list.appendChild(
                    li
                );

            }
        );


    } catch (error) {

        console.warn(
            "Logs unavailable:",
            error.message
        );

    }

}


// ============================================================
// UI
// ============================================================

function showWeedUI() {

    const panel =
        document.getElementById(
            "status-panel"
        );


    if (panel) {

        panel.className =
            "panel status-panel weed";

    }


    const chip =
        document.getElementById(
            "status-chip"
        );


    if (chip) {

        chip.textContent =
            "WEED DETECTED";

        chip.className =
            "panel-chip weed-chip";

    }


    const icon =
        document.getElementById(
            "status-big-icon"
        );


    if (icon) {

        icon.textContent =
            "⚠";

    }


    const headline =
        document.getElementById(
            "status-headline"
        );


    if (headline) {

        headline.textContent =
            "Weed Detected!";

    }


}


function showClearUI() {

    const panel =
        document.getElementById(
            "status-panel"
        );


    if (panel) {

        panel.className =
            "panel status-panel clear";

    }


    const chip =
        document.getElementById(
            "status-chip"
        );


    if (chip) {

        chip.textContent =
            "CLEAR";

        chip.className =
            "panel-chip clear-chip";

    }


    const icon =
        document.getElementById(
            "status-big-icon"
        );


    if (icon) {

        icon.textContent =
            "✔";

    }


    const headline =
        document.getElementById(
            "status-headline"
        );


    if (headline) {

        headline.textContent =
            "No Weed Detected";

    }

}


// ============================================================
// START
// ============================================================

loadStatusFromBackend();

loadLogsFromBackend();


setInterval(
    loadStatusFromBackend,
    3000
);


setInterval(
    loadLogsFromBackend,
    3000
);