// ==============================
// FIELD MAP PAGE
// Zone status comes from /api/status (weed/clear), same signal the
// dashboard uses. Robot marker position is an illustrative mapping of
// the current movement command from /api/robot/status — there's no
// GPS/positioning sensor on the robot yet (see Phase 5 roadmap).
// ==============================
const BASE_URL = "";

const ZONE_POSITIONS = {
  forward:  { top: "22%", left: "50%", zone: "a" },
  right:    { top: "50%", left: "78%", zone: "b" },
  backward: { top: "78%", left: "50%", zone: "c" },
  left:     { top: "50%", left: "22%", zone: "d" },
  stop:     { top: "50%", left: "50%", zone: null }
};

function tickClock() {
  const el = document.getElementById("clock");
  if (el) el.textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000);
tickClock();

async function loadWeedStatus() {
  try {
    const res = await fetch(`${BASE_URL}/api/status`);
    if (!res.ok) throw new Error("status unavailable");
    const data = await res.json();

    const isWeed = data.status === "Weed detected";

    ["a", "b", "c", "d"].forEach(z => {
      const zoneEl = document.getElementById(`fz-${z}`);
      const statusEl = document.getElementById(`fz-${z}-status`);
      zoneEl.classList.toggle("danger", isWeed);
      statusEl.textContent = isWeed ? "WEED" : "CLEAR";
    });

    const fieldChip = document.getElementById("field-chip");
    fieldChip.textContent = isWeed ? "WEED DETECTED" : "CLEAR";
    fieldChip.className = "panel-chip " + (isWeed ? "weed-chip" : "clear-chip");

    document.getElementById("sum-clear").textContent = isWeed ? "0 / 4" : "4 / 4";
    document.getElementById("sum-flagged").textContent = isWeed ? "4 / 4" : "0 / 4";

    if (data.time) {
      document.getElementById("last-updated").textContent =
        "Last update: " + new Date(data.time).toLocaleTimeString();
    }

    const sysBadge = document.getElementById("sys-badge");
    sysBadge.textContent = data.esp32Connected ? "● System Online" : "● Backend Online, ESP32 Idle";
    sysBadge.className = "sys-badge " + (data.esp32Connected ? "online" : "refreshing");

    const dot = document.getElementById("device-dot");
    const text = document.getElementById("device-status-text");
    if (dot) dot.style.background = data.esp32Connected ? "var(--green-400)" : "var(--red-600)";
    if (text) text.textContent = data.esp32Connected ? "Connected" : "Waiting for data";

  } catch (err) {
    console.warn("Field map: weed status unreachable:", err.message);
  }
}

async function loadRobotPosition() {
  try {
    const res = await fetch(`${BASE_URL}/api/robot/status`);
    if (!res.ok) throw new Error("robot status unavailable");
    const payload = await res.json();
    const data = payload.data || payload;

    const cmd = (data.command || "stop").toLowerCase();
    const pos = ZONE_POSITIONS[cmd] || ZONE_POSITIONS.stop;

    const robotEl = document.getElementById("field-robot");
    robotEl.style.top = pos.top;
    robotEl.style.left = pos.left;

    ["a", "b", "c", "d"].forEach(z => {
      document.getElementById(`fz-${z}`).classList.toggle("active-zone", pos.zone === z);
    });

    document.getElementById("pos-command").textContent = cmd.toUpperCase();
    document.getElementById("pos-mode").textContent = (data.mode || "--").toUpperCase();

    const obsEl = document.getElementById("pos-obstacle");
    obsEl.textContent = data.obstacle ? "BLOCKED" : "CLEAR";
    obsEl.className = "status-value " + (data.obstacle ? "warn" : "ok");

    document.getElementById("pos-distance").textContent =
      (data.distanceCm != null ? data.distanceCm.toFixed(1) : "--") + " cm";

  } catch (err) {
    // Robot/ESP32 not reachable — leave last-known marker position in place.
    console.warn("Field map: robot status unreachable:", err.message);
  }
}

loadWeedStatus();
loadRobotPosition();
setInterval(loadWeedStatus, 3000);
setInterval(loadRobotPosition, 2000);
