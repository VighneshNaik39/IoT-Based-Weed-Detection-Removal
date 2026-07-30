// ==============================
// ROBOT CONTROL PAGE
// Talks to:
//   GET  /api/robot/status  -> { mode, command, distanceCm, obstacle, cutter, connected }
//   POST /api/robot/mode    -> { mode: "manual" | "autonomous" }
//   POST /api/move          -> { command: "forward" | "backward" | "left" | "right" }
//   POST /api/stop
//   POST /api/cutter        -> { state: true | false }
//   GET  /api/status        -> dashboard weed/battery status (for battery + link badge)
// ==============================
const BASE_URL = "";

let currentMode = "manual";      // tracked locally so we can disable D-pad instantly
let robotReachable = false;

// ------------------------------
// CLOCK (same pattern as dashboard)
// ------------------------------
function tickClock() {
  const el = document.getElementById("clock");
  if (el) el.textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000);
tickClock();

// ------------------------------
// MODE SWITCH
// ------------------------------
async function setMode(mode) {
  try {
    const res = await fetch(`${BASE_URL}/api/robot/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode })
    });
    if (!res.ok) throw new Error("Mode change rejected");
    applyModeUI(mode);
  } catch (err) {
    console.warn("Could not switch mode:", err.message);
    flashUnreachable();
  }
}

function applyModeUI(mode) {
  currentMode = mode;

  document.getElementById("btn-manual").classList.toggle("active", mode === "manual");
  document.getElementById("btn-autonomous").classList.toggle("active", mode === "autonomous");

  const desc = document.getElementById("mode-desc");
  const chip = document.getElementById("dpad-chip");
  const hint = document.getElementById("dpad-hint");

  if (mode === "autonomous") {
    desc.textContent = "Autonomous — the robot drives itself and avoids obstacles.";
    chip.textContent = "AUTONOMOUS";
    hint.textContent = "Manual movement is disabled while autonomous. Stop still works.";
  } else {
    desc.textContent = "Manual — you're driving the robot directly.";
    chip.textContent = "MANUAL";
    hint.textContent = "Use the arrows to drive. Stop always works.";
  }

  setDpadEnabled(mode === "manual");
}

function setDpadEnabled(enabled) {
  ["btn-forward", "btn-backward", "btn-left", "btn-right"].forEach(id => {
    document.getElementById(id).disabled = !enabled;
  });
}

document.getElementById("btn-manual").addEventListener("click", () => setMode("manual"));
document.getElementById("btn-autonomous").addEventListener("click", () => setMode("autonomous"));

// ------------------------------
// MOVEMENT
// ------------------------------
async function sendMove(command) {
  try {
    const res = await fetch(`${BASE_URL}/api/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command })
    });
    if (!res.ok) throw new Error("Move rejected");
  } catch (err) {
    console.warn("Move failed:", err.message);
    flashUnreachable();
  }
}

async function sendStop() {
  try {
    const res = await fetch(`${BASE_URL}/api/stop`, { method: "POST" });
    if (!res.ok) throw new Error("Stop failed");
    // ESP32 firmware drops back to Manual on emergency stop — mirror that here
    applyModeUI("manual");
  } catch (err) {
    console.warn("Stop failed:", err.message);
    flashUnreachable();
  }
}

document.querySelectorAll(".dpad-btn[data-cmd]").forEach(btn => {
  btn.addEventListener("click", () => sendMove(btn.dataset.cmd));
});
document.getElementById("btn-stop").addEventListener("click", sendStop);

// ------------------------------
// CUTTER
// ------------------------------
async function setCutter(state) {
  try {
    const res = await fetch(`${BASE_URL}/api/cutter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    });
    if (!res.ok) throw new Error("Cutter command rejected");
  } catch (err) {
    console.warn("Cutter command failed:", err.message);
    flashUnreachable();
  }
}

document.getElementById("btn-cutter-on").addEventListener("click", () => setCutter(true));
document.getElementById("btn-cutter-off").addEventListener("click", () => setCutter(false));

function applyCutterUI(on) {
  const chip = document.getElementById("cutter-chip");
  chip.textContent = on ? "ON" : "OFF";
  chip.className = "panel-chip " + (on ? "weed-chip" : "clear-chip");

  document.getElementById("btn-cutter-on").classList.toggle("armed", on);
  document.getElementById("btn-cutter-off").classList.toggle("armed", !on);
}

// ------------------------------
// LIVE STATUS POLLING
// ------------------------------
async function loadRobotStatus() {
  try {
    const res = await fetch(`${BASE_URL}/api/robot/status`);
    if (!res.ok) throw new Error("robot status unavailable");
    const payload = await res.json();
    const data = payload.data || payload;

    robotReachable = true;
    setLinkUI(true);

    // Keep mode buttons/D-pad in sync with what the ESP32 reports,
    // in case someone else (or the physical e-stop) changed it.
    if (data.mode && data.mode !== currentMode) applyModeUI(data.mode);

    document.getElementById("st-mode").textContent = (data.mode || "--").toUpperCase();
    document.getElementById("st-action").textContent = (data.command || "--").toUpperCase();

    const distEl = document.getElementById("st-distance");
    distEl.textContent = (data.distanceCm != null ? data.distanceCm.toFixed(1) : "--") + " cm";

    const obsEl = document.getElementById("st-obstacle");
    obsEl.textContent = data.obstacle ? "BLOCKED" : "CLEAR";
    obsEl.className = "status-value " + (data.obstacle ? "warn" : "ok");

    applyCutterUI(!!data.cutter);

  } catch (err) {
    robotReachable = false;
    setLinkUI(false);
  }
}

async function loadWeedStatusForBattery() {
  try {
    const res = await fetch(`${BASE_URL}/api/status`);
    if (!res.ok) throw new Error("status unavailable");
    const data = await res.json();

    const battEl = document.getElementById("st-battery");
    battEl.textContent = (data.battery ?? "--") + "%";
    battEl.className = "status-value " + (data.battery != null && data.battery < 20 ? "warn" : "");

    const sysBadge = document.getElementById("sys-badge");
    if (sysBadge) {
      sysBadge.textContent = data.esp32Connected ? "● System Online" : "● Backend Online, ESP32 Idle";
      sysBadge.className = "sys-badge " + (data.esp32Connected ? "online" : "refreshing");
    }
  } catch (err) {
    const sysBadge = document.getElementById("sys-badge");
    if (sysBadge) {
      sysBadge.textContent = "● Offline";
      sysBadge.className = "sys-badge refreshing";
    }
  }
}

function setLinkUI(reachable) {
  const linkEl = document.getElementById("st-link");
  linkEl.textContent = reachable ? "CONNECTED" : "UNREACHABLE";
  linkEl.className = "status-value " + (reachable ? "ok" : "warn");

  const connChip = document.getElementById("conn-chip");
  connChip.textContent = reachable ? "LIVE" : "OFFLINE";
  connChip.className = "panel-chip " + (reachable ? "clear-chip" : "weed-chip");

  const dot = document.getElementById("device-dot");
  const text = document.getElementById("device-status-text");
  if (dot) dot.style.background = reachable ? "var(--green-400)" : "var(--red-600)";
  if (text) text.textContent = reachable ? "Connected" : "Disconnected";

  // Movement/cutter/mode only make sense to send when the ESP32 is reachable.
  setDpadEnabled(reachable && currentMode === "manual");
}

function flashUnreachable() {
  robotReachable = false;
  setLinkUI(false);
}

// ------------------------------
// BOOT + POLLING LOOP
// ------------------------------
loadRobotStatus();
loadWeedStatusForBattery();

setInterval(loadRobotStatus, 1500);
setInterval(loadWeedStatusForBattery, 3000);
