// ==============================
// ALERTS PAGE
// Derives alerts from existing endpoints — no dedicated "alerts" data
// is stored server-side yet, this synthesizes a live feed from:
//   GET /api/status        -> weed detection + ESP32 connectivity
//   GET /api/robot/status  -> obstacle sensor + robot link
// ==============================
const BASE_URL = "";

function tickClock() {
  const el = document.getElementById("clock");
  if (el) el.textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000);
tickClock();

function timeNow() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function checkAlerts() {
  const alerts = [];

  // --- Weed / dashboard status ---
  let weedData = null;
  try {
    const res = await fetch(`${BASE_URL}/api/status`);
    if (!res.ok) throw new Error();
    weedData = await res.json();

    document.getElementById("al-backend").textContent = "Online";
    document.getElementById("al-backend").className = "kpi-value";

    const sysBadge = document.getElementById("sys-badge");
    sysBadge.textContent = "● System Online";
    sysBadge.className = "sys-badge online";

    const dot = document.getElementById("device-dot");
    const text = document.getElementById("device-status-text");
    if (dot) dot.style.background = "var(--green-400)";
    if (text) text.textContent = "Connected";

    if (weedData.status === "Weed detected") {
      alerts.push({
        level: "warning",
        icon: "⚠",
        title: "Weed detected in field",
        desc: `Moisture reading: ${weedData.moisture != null ? weedData.moisture + "%" : "unknown"}`
      });
    }

    document.getElementById("al-esp32").textContent = weedData.esp32Connected ? "Connected" : "Idle";
    document.getElementById("al-esp32").className = "kpi-value " + (weedData.esp32Connected ? "" : "amber");

    if (!weedData.esp32Connected) {
      alerts.push({
        level: "warning",
        icon: "📡",
        title: "ESP32 sensor feed idle",
        desc: "No detection data received in the last 15 seconds."
      });
    }

  } catch (err) {
    document.getElementById("al-backend").textContent = "Offline";
    document.getElementById("al-backend").className = "kpi-value red";

    const sysBadge = document.getElementById("sys-badge");
    sysBadge.textContent = "● Offline";
    sysBadge.className = "sys-badge refreshing";

    const dot = document.getElementById("device-dot");
    const text = document.getElementById("device-status-text");
    if (dot) dot.style.background = "var(--red-600)";
    if (text) text.textContent = "Disconnected";

    alerts.push({
      level: "critical",
      icon: "🔌",
      title: "Backend unreachable",
      desc: "Dashboard can't reach the Node.js API at all — check the server."
    });
  }

  // --- Robot / obstacle status ---
  try {
    const res = await fetch(`${BASE_URL}/api/robot/status`);
    if (!res.ok) throw new Error();
    const payload = await res.json();
    const data = payload.data || payload;

    document.getElementById("al-obstacle").textContent = data.obstacle ? "Blocked" : "Clear";
    document.getElementById("al-obstacle").className = "kpi-value " + (data.obstacle ? "red" : "");

    if (data.obstacle) {
      alerts.push({
        level: "critical",
        icon: "🚧",
        title: "Obstacle detected",
        desc: `HC-SR04 reads ${data.distanceCm != null ? data.distanceCm.toFixed(1) + " cm" : "an obstruction"} — avoidance routine active.`
      });
    }

  } catch (err) {
    document.getElementById("al-obstacle").textContent = "Unknown";
    document.getElementById("al-obstacle").className = "kpi-value amber";

    alerts.push({
      level: "warning",
      icon: "🤖",
      title: "Robot link unreachable",
      desc: "Can't reach the ESP32 for movement/obstacle status via the backend."
    });
  }

  renderAlerts(alerts);
}

function renderAlerts(alerts) {
  const feed = document.getElementById("alert-feed");
  const badge = document.getElementById("alert-badge");

  badge.textContent = alerts.length;

  document.getElementById("al-active").textContent = alerts.length;
  document.getElementById("al-active").className = "kpi-value " + (alerts.length > 0 ? "red" : "");

  if (alerts.length === 0) {
    feed.innerHTML = '<li class="alert-empty">✔ No active alerts — everything looks normal.</li>';
    return;
  }

  feed.innerHTML = "";
  alerts.forEach(a => {
    const li = document.createElement("li");
    li.className = "alert-item " + a.level;
    li.innerHTML = `
      <span class="alert-icon">${a.icon}</span>
      <div class="alert-body">
        <p class="alert-title">${a.title}</p>
        <p class="alert-desc">${a.desc}</p>
      </div>
      <span class="alert-time">${timeNow()}</span>
    `;
    feed.appendChild(li);
  });
}

checkAlerts();
setInterval(checkAlerts, 4000);
