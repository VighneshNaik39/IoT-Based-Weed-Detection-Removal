// =====================================================
// FIELD MAP PAGE
// =====================================================
// Features:
// 1. Two-point field calibration (origin + edge GPS points
//    + real-world width/length) so the map reflects the
//    field's actual orientation, not assumed north/south.
// 2. Robot marker plotted from live GPS, projected onto the
//    calibrated field axes — not from the last drive command.
// 3. Weed / clear status overlay on the marker.
// 4. NEO-6M live GPS panel (fix / satellites / HDOP).
// 5. Google Maps location link.
// =====================================================

// BASE_URL is declared once, in api.js, which is loaded before this
// file on field-map.html — don't redeclare it here. (This page is the
// only one that loads both api.js and a page-specific script together,
// so this collision doesn't show up on the other pages.)


// =====================================================
// STATE
// =====================================================

let fieldConfig = null;   // last config fetched from /api/field
let latestGPS = null;     // last GPS fix {lat, lng, fix}
let latestIsWeed = false; // last weed status from /api/status
let setupVisible = true;  // whether the calibration form is shown


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

setInterval(tickClock, 1000);


// =====================================================
// GEOMETRY HELPERS
// =====================================================
// Small-field local projection: converts lat/lng into
// meters-east / meters-north relative to an origin point.
// Fine for field-sized areas (not for large-scale mapping).
// =====================================================

function toLocalMeters(lat, lng, lat0, lng0) {

    const metersPerDegLat = 110574;

    const metersPerDegLng =
        111320 * Math.cos((lat0 * Math.PI) / 180);

    return {
        x: (lng - lng0) * metersPerDegLng, // east
        y: (lat - lat0) * metersPerDegLat  // north
    };

}


// Returns the field's local axes (unit vectors) derived from
// the origin -> edge walk, plus a helper to project any GPS
// point onto those axes as {alongWidth, alongLength} meters.
function getFieldAxes(cfg) {

    if (
        !cfg ||
        !cfg.origin ||
        !cfg.edge ||
        cfg.origin.lat == null ||
        cfg.edge.lat == null
    ) {
        return null;
    }

    const edgeVec =
        toLocalMeters(
            cfg.edge.lat,
            cfg.edge.lng,
            cfg.origin.lat,
            cfg.origin.lng
        );

    const edgeLen =
        Math.sqrt(
            edgeVec.x * edgeVec.x +
            edgeVec.y * edgeVec.y
        );

    if (edgeLen < 0.5) {
        // Origin and edge points are basically the same spot —
        // not enough separation to trust a direction from.
        return null;
    }

    const u = {
        x: edgeVec.x / edgeLen,
        y: edgeVec.y / edgeLen
    };

    // Perpendicular to u. The sign is genuinely ambiguous from
    // just two points (we don't know which side of the walked
    // edge the field extends into) — "mirrored" lets the user
    // flip it from the UI once they see the marker on the
    // wrong side.
    const sign = cfg.mirrored ? -1 : 1;

    const v = {
        x: sign * -u.y,
        y: sign * u.x
    };

    return { u, v };

}


// Projects a GPS point onto the calibrated field, returning
// fractional position (0..1 = inside the field) along width
// and length, plus straight-line distance from origin in meters.
function projectOntoField(lat, lng, cfg) {

    const axes = getFieldAxes(cfg);

    if (!axes) {
        return null;
    }

    const p =
        toLocalMeters(
            lat,
            lng,
            cfg.origin.lat,
            cfg.origin.lng
        );

    const alongWidth =
        p.x * axes.u.x + p.y * axes.u.y;

    const alongLength =
        p.x * axes.v.x + p.y * axes.v.y;

    const distanceM =
        Math.sqrt(p.x * p.x + p.y * p.y);

    return {
        fx: alongWidth / cfg.widthM,
        fy: alongLength / cfg.lengthM,
        distanceM
    };

}


// =====================================================
// FIELD CONFIG — LOAD / SAVE
// =====================================================

async function loadFieldConfig() {

    try {

        const res =
            await fetch(
                `${BASE_URL}/api/field`,
                { cache: "no-store" }
            );

        if (!res.ok) {

            throw new Error(
                `Field config HTTP ${res.status}`
            );

        }

        const payload =
            await res.json();

        fieldConfig =
            payload.data;

        setupVisible =
            !fieldConfig.configured;

        renderFieldSetupState();

    } catch (err) {

        console.warn(
            "Field map: config unreachable:",
            err.message
        );

    }

}


async function postFieldConfig(partial) {

    const res =
        await fetch(
            `${BASE_URL}/api/field`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(partial)
            }
        );

    if (!res.ok) {

        throw new Error(
            `Field save HTTP ${res.status}`
        );

    }

    const payload =
        await res.json();

    fieldConfig =
        payload.data;

    renderFieldSetupState();

    return fieldConfig;

}


// captureOrigin / captureEdge intentionally do NOT hit the ESP32
// themselves. The page already polls /api/gps/location every few
// seconds in the background (loadGPSLocation), and that's the only
// GPS traffic that should exist — real GPS/ESP32 hardware doesn't
// have much headroom for extra concurrent requests on top of its
// regular serial reads, and stacking a fresh request on every
// button click was the actual cause of trouble on real hardware.
// Instead, these just snapshot whatever the latest poll already saw.

async function captureOrigin() {

    const statusEl =
        document.getElementById("origin-status");

    if (!latestGPS || latestGPS.fix !== true) {

        if (statusEl) {

            statusEl.textContent =
                "⚠ No GPS fix yet — wait for the live panel above to show a fix";

        }

        return;

    }

    try {

        await postFieldConfig({
            origin: {
                lat: latestGPS.lat,
                lng: latestGPS.lng
            }
        });

    } catch (err) {

        if (statusEl) {

            statusEl.textContent =
                "⚠ Couldn't reach backend";

        }

        console.warn(
            "Set origin failed:",
            err.message
        );

    }

}


async function captureEdge() {

    const statusEl =
        document.getElementById("edge-status");

    if (!latestGPS || latestGPS.fix !== true) {

        if (statusEl) {

            statusEl.textContent =
                "⚠ No GPS fix yet — wait for the live panel above to show a fix";

        }

        return;

    }

    try {

        await postFieldConfig({
            edge: {
                lat: latestGPS.lat,
                lng: latestGPS.lng
            }
        });

    } catch (err) {

        if (statusEl) {

            statusEl.textContent =
                "⚠ Couldn't reach backend";

        }

        console.warn(
            "Set edge failed:",
            err.message
        );

    }

}


// =====================================================
// MANUAL COORDINATE ENTRY
// For testing/setup before the GPS module is connected —
// type in coordinates (e.g. read off Google Maps) instead
// of capturing a live fix from the robot.
// =====================================================

// Number("") is 0, not NaN — so a blank field was silently
// treated as a valid "0, 0" coordinate. This parses strictly:
// blank/whitespace-only input is rejected, not coerced to 0.
function parseCoordField(input) {

    if (!input) {
        return NaN;
    }

    const raw =
        input.value.trim();

    if (raw === "") {
        return NaN;
    }

    return Number(raw);

}


async function saveManualOrigin() {

    const latInput =
        document.getElementById("origin-lat-input");

    const lngInput =
        document.getElementById("origin-lng-input");

    const statusEl =
        document.getElementById("origin-status");

    const lat = parseCoordField(latInput);
    const lng = parseCoordField(lngInput);

    if (
        !Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180
    ) {

        alert(
            "Enter both a latitude (-90 to 90) and longitude (-180 to 180) — one or both boxes are empty or invalid."
        );

        return;

    }

    try {

        await postFieldConfig({
            origin: { lat, lng }
        });

    } catch (err) {

        if (statusEl) {

            statusEl.textContent =
                "⚠ Couldn't reach backend";

        }

        console.warn(
            "Save manual origin failed:",
            err.message
        );

    }

}


async function saveManualEdge() {

    const latInput =
        document.getElementById("edge-lat-input");

    const lngInput =
        document.getElementById("edge-lng-input");

    const statusEl =
        document.getElementById("edge-status");

    const lat = parseCoordField(latInput);
    const lng = parseCoordField(lngInput);

    if (
        !Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180
    ) {

        alert(
            "Enter both a latitude (-90 to 90) and longitude (-180 to 180) — one or both boxes are empty or invalid."
        );

        return;

    }

    try {

        await postFieldConfig({
            edge: { lat, lng }
        });

    } catch (err) {

        if (statusEl) {

            statusEl.textContent =
                "⚠ Couldn't reach backend";

        }

        console.warn(
            "Save manual edge failed:",
            err.message
        );

    }

}


async function saveFieldConfig() {

    const widthInput =
        document.getElementById("field-width-input");

    const lengthInput =
        document.getElementById("field-length-input");

    const width =
        widthInput
            ? Number(widthInput.value)
            : null;

    const length =
        lengthInput
            ? Number(lengthInput.value)
            : null;

    if (!(width > 0) || !(length > 0)) {

        alert(
            "Enter a valid width and length (in meters) before saving."
        );

        return;

    }

    try {

        await postFieldConfig({
            widthM: width,
            lengthM: length
        });

        if (fieldConfig && fieldConfig.configured) {

            setupVisible = false;

            renderFieldSetupState();

        }

    } catch (err) {

        alert(
            "Couldn't save field config — is the backend running?"
        );

        console.warn(
            "Save field failed:",
            err.message
        );

    }

}


async function flipFieldOrientation() {

    if (!fieldConfig) {
        return;
    }

    try {

        await postFieldConfig({
            mirrored: !fieldConfig.mirrored
        });

        updateRobotOnField();

    } catch (err) {

        console.warn(
            "Flip orientation failed:",
            err.message
        );

    }

}


async function resetFieldConfig() {

    if (
        !confirm(
            "Reset field calibration? You'll need to re-walk the origin and edge points."
        )
    ) {
        return;
    }

    try {

        const res =
            await fetch(
                `${BASE_URL}/api/field/reset`,
                { method: "POST" }
            );

        const payload =
            await res.json();

        fieldConfig =
            payload.data;

        setupVisible = true;

        renderFieldSetupState();

    } catch (err) {

        console.warn(
            "Reset field failed:",
            err.message
        );

    }

}


function toggleSetup(show) {

    setupVisible = show;

    renderFieldSetupState();

}


// =====================================================
// RENDER: SETUP FORM vs CANVAS
// =====================================================

function renderFieldSetupState() {

    if (!fieldConfig) {
        return;
    }

    const setupEl =
        document.getElementById("field-setup");

    const canvasWrapEl =
        document.getElementById("field-canvas-wrap");

    if (setupEl) {

        setupEl.style.display =
            setupVisible
                ? ""
                : "none";

    }

    if (canvasWrapEl) {

        canvasWrapEl.style.display =
            (fieldConfig.configured && !setupVisible)
                ? ""
                : "none";

    }


    // Prefill dimension inputs / status text

    const widthInput =
        document.getElementById("field-width-input");

    const lengthInput =
        document.getElementById("field-length-input");

    if (widthInput && fieldConfig.widthM != null) {

        widthInput.value =
            fieldConfig.widthM;

    }

    if (lengthInput && fieldConfig.lengthM != null) {

        lengthInput.value =
            fieldConfig.lengthM;

    }

    const originStatus =
        document.getElementById("origin-status");

    const edgeStatus =
        document.getElementById("edge-status");

    if (originStatus) {

        originStatus.textContent =
            (fieldConfig.origin && fieldConfig.origin.lat != null)
                ? `Set (${fieldConfig.origin.lat.toFixed(6)}, ${fieldConfig.origin.lng.toFixed(6)})`
                : "Not set";

    }

    if (edgeStatus) {

        edgeStatus.textContent =
            (fieldConfig.edge && fieldConfig.edge.lat != null)
                ? `Set (${fieldConfig.edge.lat.toFixed(6)}, ${fieldConfig.edge.lng.toFixed(6)})`
                : "Not set";

    }


    // Field chip

    const fieldChip =
        document.getElementById("field-chip");

    if (fieldChip) {

        if (!fieldConfig.configured) {

            fieldChip.textContent =
                "NOT CONFIGURED";

            fieldChip.className =
                "panel-chip neutral-chip";

        } else if (latestIsWeed) {

            fieldChip.textContent =
                "WEED DETECTED";

            fieldChip.className =
                "panel-chip weed-chip";

        } else {

            fieldChip.textContent =
                "CALIBRATED";

            fieldChip.className =
                "panel-chip clear-chip";

        }

    }


    updateRobotOnField();

}


// =====================================================
// ROBOT MARKER ON THE TO-SCALE CANVAS
// =====================================================

function updateRobotOnField() {

    const robotEl =
        document.getElementById("field-robot");

    const sumSize =
        document.getElementById("sum-size");

    const sumArea =
        document.getElementById("sum-area");

    const sumDistance =
        document.getElementById("sum-distance");

    const sumBounds =
        document.getElementById("sum-bounds");

    if (!fieldConfig || !fieldConfig.configured) {

        if (sumSize) sumSize.textContent = "--";
        if (sumArea) sumArea.textContent = "--";
        if (sumDistance) sumDistance.textContent = "--";
        if (sumBounds) sumBounds.textContent = "Not calibrated";

        return;

    }

    if (sumSize) {

        sumSize.textContent =
            `${fieldConfig.widthM} m × ${fieldConfig.lengthM} m`;

    }

    const canvasEl =
        document.getElementById("field-canvas");

    if (canvasEl) {

        canvasEl.style.aspectRatio =
            `${fieldConfig.widthM} / ${fieldConfig.lengthM}`;

    }

    if (sumArea) {

        sumArea.textContent =
            `${(fieldConfig.widthM * fieldConfig.lengthM).toFixed(1)} m²`;

    }

    if (
        !latestGPS ||
        latestGPS.fix !== true
    ) {

        if (sumDistance) sumDistance.textContent = "--";
        if (sumBounds) sumBounds.textContent = "Waiting for GPS fix";

        return;

    }

    const proj =
        projectOntoField(
            latestGPS.lat,
            latestGPS.lng,
            fieldConfig
        );

    if (!proj) {
        return;
    }

    if (sumDistance) {

        sumDistance.textContent =
            `${proj.distanceM.toFixed(1)} m`;

    }

    const inBounds =
        proj.fx >= 0 && proj.fx <= 1 &&
        proj.fy >= 0 && proj.fy <= 1;

    if (sumBounds) {

        sumBounds.textContent =
            inBounds
                ? "Inside field"
                : "Outside field bounds";

        sumBounds.className =
            "status-value " +
            (inBounds ? "ok" : "warn");

    }

    if (robotEl) {

        const clampedFx =
            Math.max(0, Math.min(1, proj.fx));

        const clampedFy =
            Math.max(0, Math.min(1, proj.fy));

        robotEl.style.left =
            (clampedFx * 100) + "%";

        robotEl.style.top =
            (clampedFy * 100) + "%";

        robotEl.classList.toggle(
            "danger",
            latestIsWeed
        );

        robotEl.classList.toggle(
            "out-of-bounds",
            !inBounds
        );

    }

}


// =====================================================
// WEED STATUS
// =====================================================

async function loadWeedStatus() {

    try {

        const res =
            await fetch(
                `${BASE_URL}/api/status`,
                { cache: "no-store" }
            );

        if (!res.ok) {

            throw new Error(
                "status unavailable"
            );

        }

        const data =
            await res.json();

        latestIsWeed =
            data.status === "Weed detected";

        renderFieldSetupState();


        // Last updated

        if (data.time) {

            const lastUpdated =
                document.getElementById("last-updated");

            if (lastUpdated) {

                lastUpdated.textContent =
                    "Last update: " +
                    new Date(data.time).toLocaleTimeString();

            }

        }


        // System status

        const sysBadge =
            document.getElementById("sys-badge");

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


        // ESP32 device indicator

        const dot =
            document.getElementById("device-dot");

        const text =
            document.getElementById("device-status-text");

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
// ROBOT COMMAND / MODE / OBSTACLE INFO
// (text side-panel only — the marker position itself now
// comes from GPS, not the last drive command)
// =====================================================

async function loadRobotPosition() {

    try {

        const res =
            await fetch(
                `${BASE_URL}/api/robot/status`,
                { cache: "no-store" }
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

        const cmd =
            (data.command || "stop").toLowerCase();

        const commandEl =
            document.getElementById("pos-command");

        if (commandEl) {

            commandEl.textContent =
                cmd.toUpperCase();

        }

        const modeEl =
            document.getElementById("pos-mode");

        if (modeEl) {

            modeEl.textContent =
                (data.mode || "--").toUpperCase();

        }

        const obsEl =
            document.getElementById("pos-obstacle");

        if (obsEl) {

            obsEl.textContent =
                data.obstacle
                    ? "BLOCKED"
                    : "CLEAR";

            obsEl.className =
                "status-value " +
                (data.obstacle ? "warn" : "ok");

        }

        const distanceEl =
            document.getElementById("pos-distance");

        if (distanceEl) {

            const distanceValue =
    data.distanceCm ??
    data.distance_cm ??
    data.distance;

distanceEl.textContent =
    (
        distanceValue != null &&
        Number.isFinite(Number(distanceValue)) &&
        Number(distanceValue) >= 0
            ? Number(distanceValue).toFixed(1)
            : "--"
    ) + " cm";

        }

    } catch (err) {

        console.warn(
            "Field map: robot status unreachable:",
            err.message
        );

    }

}


// =====================================================
// NEO-6M GPS
// =====================================================

let gpsFetchInFlight = false;

async function loadGPSLocation() {

    // Don't stack a new request on top of one that hasn't
    // finished yet — real GPS/ESP32 hardware has little room
    // for concurrent requests.
    if (gpsFetchInFlight) {
        return;
    }

    gpsFetchInFlight = true;

    try {

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

        const gpsStatus =
            document.getElementById("gps-status");

        const gpsChip =
            document.getElementById("gps-chip");

        const latitude =
            document.getElementById("gps-latitude");

        const longitude =
            document.getElementById("gps-longitude");

        const satellites =
            document.getElementById("gps-satellites");

        const hdop =
            document.getElementById("gps-hdop");

        const gpsFix =
            document.getElementById("gps-fix");

        const satellitesSide =
            document.getElementById("gps-satellites-side");

        const latitudeSide =
            document.getElementById("gps-latitude-side");

        const longitudeSide =
            document.getElementById("gps-longitude-side");

        const mapLink =
            document.getElementById("gps-map-link");

        if (!gps) {

            throw new Error(
                "GPS data not received"
            );

        }

        const hasFix =
            gps.fix === true &&
            gps.latitude != null &&
            gps.longitude != null;

        if (!hasFix) {

            latestGPS =
                { fix: false };

            if (gpsStatus) gpsStatus.textContent = "🟠 Waiting for GPS fix...";
            if (gpsChip) { gpsChip.textContent = "NO FIX"; gpsChip.className = "panel-chip weed-chip"; }
            if (latitude) latitude.textContent = "--";
            if (longitude) longitude.textContent = "--";
            if (satellites) satellites.textContent = gps.satellites ?? 0;
            if (hdop) hdop.textContent = gps.hdop ?? "--";
            if (gpsFix) { gpsFix.textContent = "NO FIX"; gpsFix.className = "status-value warn"; }
            if (satellitesSide) satellitesSide.textContent = gps.satellites ?? 0;
            if (latitudeSide) latitudeSide.textContent = "--";
            if (longitudeSide) longitudeSide.textContent = "--";
            if (mapLink) mapLink.style.display = "none";

            updateRobotOnField();

            return;

        }

        const lat = Number(gps.latitude);
        const lng = Number(gps.longitude);

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {

            throw new Error(
                "Invalid GPS coordinates"
            );

        }

        latestGPS =
            { lat, lng, fix: true };

        if (gpsStatus) gpsStatus.textContent = "🟢 GPS FIX ACTIVE";
        if (gpsChip) { gpsChip.textContent = "GPS ACTIVE"; gpsChip.className = "panel-chip clear-chip"; }
        if (latitude) latitude.textContent = lat.toFixed(6) + "°";
        if (longitude) longitude.textContent = lng.toFixed(6) + "°";
        if (satellites) satellites.textContent = gps.satellites ?? "--";
        if (hdop) hdop.textContent = gps.hdop != null ? Number(gps.hdop).toFixed(1) : "--";
        if (gpsFix) { gpsFix.textContent = "ACTIVE"; gpsFix.className = "status-value ok"; }
        if (satellitesSide) satellitesSide.textContent = gps.satellites ?? "--";
        if (latitudeSide) latitudeSide.textContent = lat.toFixed(6);
        if (longitudeSide) longitudeSide.textContent = lng.toFixed(6);

        if (mapLink) {

            mapLink.href =
                `https://www.google.com/maps?q=${lat},${lng}`;

            mapLink.style.display =
                "inline-block";

        }

        updateRobotOnField();

    } catch (error) {

        console.warn(
            "Field map: GPS unavailable:",
            error.message
        );

        const gpsStatus =
            document.getElementById("gps-status");

        const gpsChip =
            document.getElementById("gps-chip");

        const gpsFix =
            document.getElementById("gps-fix");

        if (gpsStatus) gpsStatus.textContent = "🔴 GPS backend unavailable";
        if (gpsChip) { gpsChip.textContent = "OFFLINE"; gpsChip.className = "panel-chip weed-chip"; }
        if (gpsFix) { gpsFix.textContent = "OFFLINE"; gpsFix.className = "status-value warn"; }

    } finally {

        gpsFetchInFlight = false;

    }

}


// =====================================================
// INITIAL LOAD
// =====================================================

loadFieldConfig();
loadWeedStatus();
loadRobotPosition();
loadGPSLocation();


// =====================================================
// AUTOMATIC REFRESH
// =====================================================

setInterval(loadWeedStatus, 3000);
setInterval(loadRobotPosition, 2000);
setInterval(loadGPSLocation, 2000);
