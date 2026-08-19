// =====================================================
// FIELD MAP PAGE
// =====================================================
// Features:
// 1. Weed / clear zone status
// 2. Robot command position
// 3. Robot mode / obstacle / distance
// 4. NEO-6M live GPS
// 5. GPS fix / satellite / HDOP information
// 6. Google Maps location link
// =====================================================

const BASE_URL = "";


// =====================================================
// ILLUSTRATIVE ROBOT POSITIONS
// =====================================================
// These positions are still based on the robot command.
// The actual GPS coordinates are displayed separately.
//
// Later, GPS coordinates can be used to place the robot
// on a real field map.
// =====================================================

const ZONE_POSITIONS = {

    forward: {
        top: "22%",
        left: "50%",
        zone: "a"
    },

    right: {
        top: "50%",
        left: "78%",
        zone: "b"
    },

    backward: {
        top: "78%",
        left: "50%",
        zone: "c"
    },

    left: {
        top: "50%",
        left: "22%",
        zone: "d"
    },

    stop: {
        top: "50%",
        left: "50%",
        zone: null
    }

};


// =====================================================
// CLOCK
// =====================================================

function tickClock() {

    const el =
        document.getElementById("clock");

    if (el) {

        el.textContent =
            new Date().toLocaleTimeString();

    }

}

tickClock();

setInterval(
    tickClock,
    1000
);


// =====================================================
// WEED STATUS
// =====================================================

async function loadWeedStatus() {

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
                "status unavailable"
            );

        }

        const data =
            await res.json();


        // ==========================================
        // Weed state
        // ==========================================

        const isWeed =
            data.status === "Weed detected";


        // ==========================================
        // Update zones
        // ==========================================

        ["a", "b", "c", "d"].forEach(
            (z) => {

                const zoneEl =
                    document.getElementById(
                        `fz-${z}`
                    );

                const statusEl =
                    document.getElementById(
                        `fz-${z}-status`
                    );


                if (zoneEl) {

                    zoneEl.classList.toggle(
                        "danger",
                        isWeed
                    );

                }


                if (statusEl) {

                    statusEl.textContent =
                        isWeed
                            ? "WEED"
                            : "CLEAR";

                }

            }
        );


        // ==========================================
        // Field chip
        // ==========================================

        const fieldChip =
            document.getElementById(
                "field-chip"
            );


        if (fieldChip) {

            fieldChip.textContent =
                isWeed
                    ? "WEED DETECTED"
                    : "CLEAR";


            fieldChip.className =
                "panel-chip " +
                (
                    isWeed
                        ? "weed-chip"
                        : "clear-chip"
                );

        }


        // ==========================================
        // Field summary
        // ==========================================

        const sumClear =
            document.getElementById(
                "sum-clear"
            );

        const sumFlagged =
            document.getElementById(
                "sum-flagged"
            );


        if (sumClear) {

            sumClear.textContent =
                isWeed
                    ? "0 / 4"
                    : "4 / 4";

        }


        if (sumFlagged) {

            sumFlagged.textContent =
                isWeed
                    ? "4 / 4"
                    : "0 / 4";

        }


        // ==========================================
        // Last updated
        // ==========================================

        if (data.time) {

            const lastUpdated =
                document.getElementById(
                    "last-updated"
                );


            if (lastUpdated) {

                lastUpdated.textContent =
                    "Last update: " +
                    new Date(
                        data.time
                    ).toLocaleTimeString();

            }

        }


        // ==========================================
        // System status
        // ==========================================

        const sysBadge =
            document.getElementById(
                "sys-badge"
            );


        if (sysBadge) {

            sysBadge.textContent =
                data.esp32Connected
                    ? "● System Online"
                    : "● Backend Online, ESP32 Idle";


            sysBadge.className =
                "sys-badge " +
                (
                    data.esp32Connected
                        ? "online"
                        : "refreshing"
                );

        }


        // ==========================================
        // ESP32 device indicator
        // ==========================================

        const dot =
            document.getElementById(
                "device-dot"
            );

        const text =
            document.getElementById(
                "device-status-text"
            );


        if (dot) {

            dot.style.background =
                data.esp32Connected
                    ? "var(--green-400)"
                    : "var(--red-600)";

        }


        if (text) {

            text.textContent =
                data.esp32Connected
                    ? "Connected"
                    : "Waiting for data";

        }


    } catch (err) {

        console.warn(
            "Field map: weed status unreachable:",
            err.message
        );

    }

}


// =====================================================
// ROBOT POSITION
// =====================================================
// This keeps your existing command-based robot marker.
// =====================================================

async function loadRobotPosition() {

    try {

        const res =
            await fetch(
                `${BASE_URL}/api/robot/status`,
                {
                    cache: "no-store"
                }
            );


        if (!res.ok) {

            throw new Error(
                "robot status unavailable"
            );

        }


        const payload =
            await res.json();


        const data =
            payload.data || payload;


        // ==========================================
        // Current command
        // ==========================================

        const cmd =
            (
                data.command ||
                "stop"
            ).toLowerCase();


        const pos =
            ZONE_POSITIONS[cmd] ||
            ZONE_POSITIONS.stop;


        // ==========================================
        // Robot marker
        // ==========================================

        const robotEl =
            document.getElementById(
                "field-robot"
            );


        if (robotEl) {

            robotEl.style.top =
                pos.top;

            robotEl.style.left =
                pos.left;

        }


        // ==========================================
        // Active zone
        // ==========================================

        ["a", "b", "c", "d"].forEach(
            (z) => {

                const zoneEl =
                    document.getElementById(
                        `fz-${z}`
                    );


                if (zoneEl) {

                    zoneEl.classList.toggle(
                        "active-zone",
                        pos.zone === z
                    );

                }

            }
        );


        // ==========================================
        // Command
        // ==========================================

        const commandEl =
            document.getElementById(
                "pos-command"
            );


        if (commandEl) {

            commandEl.textContent =
                cmd.toUpperCase();

        }


        // ==========================================
        // Mode
        // ==========================================

        const modeEl =
            document.getElementById(
                "pos-mode"
            );


        if (modeEl) {

            modeEl.textContent =
                (
                    data.mode ||
                    "--"
                ).toUpperCase();

        }


        // ==========================================
        // Obstacle
        // ==========================================

        const obsEl =
            document.getElementById(
                "pos-obstacle"
            );


        if (obsEl) {

            obsEl.textContent =
                data.obstacle
                    ? "BLOCKED"
                    : "CLEAR";


            obsEl.className =
                "status-value " +
                (
                    data.obstacle
                        ? "warn"
                        : "ok"
                );

        }


        // ==========================================
        // Distance
        // ==========================================

        const distanceEl =
            document.getElementById(
                "pos-distance"
            );


        if (distanceEl) {

            distanceEl.textContent =
                (
                    data.distanceCm != null
                        ? Number(
                            data.distanceCm
                        ).toFixed(1)
                        : "--"
                ) + " cm";

        }


    } catch (err) {

        console.warn(
            "Field map: robot status unreachable:",
            err.message
        );

        // Keep last-known marker position.

    }

}


// =====================================================
// NEO-6M GPS
// =====================================================

async function loadGPSLocation() {

    try {

        // ==========================================
        // Call backend GPS API
        // ==========================================

        const result =
            await getGPSLocation();


        if (
            !result ||
            result.success === false
        ) {

            throw new Error(
                result?.message ||
                "GPS unavailable"
            );

        }


        const gps =
            result.gps;


        // ==========================================
        // Get HTML elements
        // ==========================================

        const gpsStatus =
            document.getElementById(
                "gps-status"
            );

        const gpsChip =
            document.getElementById(
                "gps-chip"
            );

        const latitude =
            document.getElementById(
                "gps-latitude"
            );

        const longitude =
            document.getElementById(
                "gps-longitude"
            );

        const satellites =
            document.getElementById(
                "gps-satellites"
            );

        const hdop =
            document.getElementById(
                "gps-hdop"
            );

        const gpsFix =
            document.getElementById(
                "gps-fix"
            );

        const satellitesSide =
            document.getElementById(
                "gps-satellites-side"
            );

        const latitudeSide =
            document.getElementById(
                "gps-latitude-side"
            );

        const longitudeSide =
            document.getElementById(
                "gps-longitude-side"
            );

        const mapLink =
            document.getElementById(
                "gps-map-link"
            );


        // ==========================================
        // Validate GPS object
        // ==========================================

        if (!gps) {

            throw new Error(
                "GPS data not received"
            );

        }


        // ==========================================
        // GPS FIX CHECK
        // ==========================================

        const hasFix =
            gps.fix === true &&
            gps.latitude != null &&
            gps.longitude != null;


        // ==========================================
        // NO GPS FIX
        // ==========================================

        if (!hasFix) {

            if (gpsStatus) {

                gpsStatus.textContent =
                    "🟠 Waiting for GPS fix...";

            }


            if (gpsChip) {

                gpsChip.textContent =
                    "NO FIX";

                gpsChip.className =
                    "panel-chip weed-chip";

            }


            if (latitude) {

                latitude.textContent =
                    "--";

            }


            if (longitude) {

                longitude.textContent =
                    "--";

            }


            if (satellites) {

                satellites.textContent =
                    gps.satellites ?? 0;

            }


            if (hdop) {

                hdop.textContent =
                    gps.hdop ?? "--";

            }


            if (gpsFix) {

                gpsFix.textContent =
                    "NO FIX";

                gpsFix.className =
                    "status-value warn";

            }


            if (satellitesSide) {

                satellitesSide.textContent =
                    gps.satellites ?? 0;

            }


            if (latitudeSide) {

                latitudeSide.textContent =
                    "--";

            }


            if (longitudeSide) {

                longitudeSide.textContent =
                    "--";

            }


            if (mapLink) {

                mapLink.style.display =
                    "none";

            }


            return;

        }


        // ==========================================
        // GPS FIX ACTIVE
        // ==========================================

        const lat =
            Number(gps.latitude);

        const lng =
            Number(gps.longitude);


        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {

            throw new Error(
                "Invalid GPS coordinates"
            );

        }


        // ==========================================
        // Main GPS panel
        // ==========================================

        if (gpsStatus) {

            gpsStatus.textContent =
                "🟢 GPS FIX ACTIVE";

        }


        if (gpsChip) {

            gpsChip.textContent =
                "GPS ACTIVE";

            gpsChip.className =
                "panel-chip clear-chip";

        }


        if (latitude) {

            latitude.textContent =
                lat.toFixed(6) + "°";

        }


        if (longitude) {

            longitude.textContent =
                lng.toFixed(6) + "°";

        }


        if (satellites) {

            satellites.textContent =
                gps.satellites ?? "--";

        }


        if (hdop) {

            hdop.textContent =
                gps.hdop != null
                    ? Number(gps.hdop).toFixed(1)
                    : "--";

        }


        // ==========================================
        // Side GPS information
        // ==========================================

        if (gpsFix) {

            gpsFix.textContent =
                "ACTIVE";

            gpsFix.className =
                "status-value ok";

        }


        if (satellitesSide) {

            satellitesSide.textContent =
                gps.satellites ?? "--";

        }


        if (latitudeSide) {

            latitudeSide.textContent =
                lat.toFixed(6);

        }


        if (longitudeSide) {

            longitudeSide.textContent =
                lng.toFixed(6);

        }


        // ==========================================
        // Google Maps
        // ==========================================

        if (mapLink) {

            mapLink.href =
                `https://www.google.com/maps?q=${lat},${lng}`;

            mapLink.style.display =
                "inline-block";

        }


        // ==========================================
        // Console
        // ==========================================

        console.log(
            "📍 NEO-6M GPS:",
            {
                latitude: lat,
                longitude: lng,
                satellites: gps.satellites,
                hdop: gps.hdop
            }
        );


    } catch (error) {

        console.warn(
            "Field map: GPS unavailable:",
            error.message
        );


        // ==========================================
        // Update GPS UI to offline
        // ==========================================

        const gpsStatus =
            document.getElementById(
                "gps-status"
            );

        const gpsChip =
            document.getElementById(
                "gps-chip"
            );

        const gpsFix =
            document.getElementById(
                "gps-fix"
            );


        if (gpsStatus) {

            gpsStatus.textContent =
                "🔴 GPS backend unavailable";

        }


        if (gpsChip) {

            gpsChip.textContent =
                "OFFLINE";

            gpsChip.className =
                "panel-chip weed-chip";

        }


        if (gpsFix) {

            gpsFix.textContent =
                "OFFLINE";

            gpsFix.className =
                "status-value warn";

        }

    }

}
// =====================================================
// LIVE CAMERA
// =====================================================

const FIELD_CAMERA_URL = "/api/detection/stream";

let fieldCameraReconnectTimer = null;

function initFieldCamera() {

    const camera = document.getElementById("field-camera-stream");
    const placeholder = document.getElementById(
        "field-camera-placeholder"
    );

    const chip = document.getElementById(
        "field-camera-chip"
    );

    if (!camera) {
        console.warn("Field Map: camera element not found");
        return;
    }

    function cameraConnected() {

        if (placeholder) {
            placeholder.classList.add("hidden");
        }

        if (chip) {
            chip.textContent = "LIVE";

            chip.className =
                "panel-chip clear-chip";
        }

        console.log(
            "Field Map: camera stream connected"
        );
    }

    function cameraDisconnected() {

        if (placeholder) {
            placeholder.classList.remove("hidden");
        }

        if (chip) {
            chip.textContent = "OFFLINE";

            chip.className =
                "panel-chip weed-chip";
        }

        console.warn(
            "Field Map: camera stream disconnected"
        );

        scheduleCameraReconnect();
    }

    function scheduleCameraReconnect() {

        if (fieldCameraReconnectTimer) {
            return;
        }

        fieldCameraReconnectTimer =
            setTimeout(() => {

                fieldCameraReconnectTimer = null;

                camera.src =
                    FIELD_CAMERA_URL +
                    "?t=" +
                    Date.now();

            }, 3000);
    }

    camera.onload = cameraConnected;

    camera.onerror = cameraDisconnected;

    // Initial stream
    camera.src =
        FIELD_CAMERA_URL +
        "?t=" +
        Date.now();
}

// =====================================================
// INITIAL LOAD
// =====================================================
loadWeedStatus();

loadRobotPosition();

loadGPSLocation();

initFieldCamera();


// =====================================================
// AUTOMATIC REFRESH
// =====================================================

// Weed / field status every 3 seconds
setInterval(
    loadWeedStatus,
    3000
);


// Robot status every 2 seconds
setInterval(
    loadRobotPosition,
    2000
);


// NEO-6M GPS every 2 seconds
setInterval(
    loadGPSLocation,
    2000
);