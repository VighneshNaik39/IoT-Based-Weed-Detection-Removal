// ==============================
// BACKEND CONFIG
// ==============================
const BASE_URL = "http://192.168.99.135:5000";

// ==============================
// LOAD STATUS + KPIs
// ==============================
async function loadStatusFromBackend() {
  try {
    const res = await fetch(`${BASE_URL}/api/status`);
    const data = await res.json();

    // --- Status Panel ---
    if (data.status === "Weed detected") {
      showWeedUI();
    } else {
      showClearUI();
    }

    // --- KPI Cards ---
    const kpiCards = document.querySelectorAll(".kpi-card .kpi-value");
    if (kpiCards[0]) kpiCards[0].innerText = data.scansToday ?? "--";
    if (kpiCards[1]) kpiCards[1].innerText = data.weedsDetected ?? "--";
    if (kpiCards[2]) kpiCards[2].innerText = data.weedsRemoved ?? "0";

    // Battery
    const batteryEl = document.querySelector(".kpi-card:nth-child(5) .kpi-value");
    const batteryBar = document.querySelector(".kpi-card:nth-child(5) .kpi-bar-fill");
    if (batteryEl) batteryEl.innerText = (data.battery ?? 80) + "%";
    if (batteryBar) batteryBar.style.width = (data.battery ?? 80) + "%";

    // --- Moisture Sensor ---
    const moistureVal = document.querySelectorAll(".sensor-value")[0];
    const moistureFill = document.querySelectorAll(".sensor-fill")[0];
    if (moistureVal && data.moisture != null) {
      moistureVal.innerText = data.moisture + "%";
      if (moistureFill) moistureFill.style.width = data.moisture + "%";
    }

    // --- Last Updated Time ---
    if (data.time) {
      const t = new Date(data.time).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const lastSeen = document.getElementById("last-updated");
      if (lastSeen) lastSeen.innerText = "Last update: " + t;
    }

    // --- System badge back to online ---
    const badge = document.getElementById("sys-badge");
    if (badge) { badge.textContent = "● System Online"; badge.className = "sys-badge online"; }

  } catch (err) {
    console.warn("Backend not reachable:", err.message);
    const badge = document.getElementById("sys-badge");
    if (badge) { badge.textContent = "● Offline"; badge.className = "sys-badge refreshing"; }
  }
}

// ==============================
// LOAD LOGS
// ==============================
async function loadLogsFromBackend() {
  try {
    const res = await fetch(`${BASE_URL}/api/logs`);
    const logs = await res.json();

    const list = document.getElementById("log-list");
    if (!list) return;

    if (logs.length === 0) {
      list.innerHTML = '<li class="log-row"><span class="log-time">--</span><span class="log-zone">--</span><span class="log-msg ok">No logs yet</span></li>';
      return;
    }

    // Show latest 10 in dashboard log
    const recent = [...logs].reverse().slice(0, 10);
    list.innerHTML = "";
    recent.forEach(log => {
      const t = log.time ? new Date(log.time).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }) : "--";
      const isWeed = log.status === "Weed detected";
      const li = document.createElement("li");
      li.className = "log-row";
      li.innerHTML = `
        <span class="log-time">${t}</span>
        <span class="log-zone">ESP32</span>
        <span class="log-msg ${isWeed ? 'warn' : 'ok'}">
          ${isWeed ? '⚠ Weed detected' : '✔ No weed — Field clear'}
          ${log.moisture != null ? ' · Moisture: ' + log.moisture + '%' : ''}
        </span>`;
      list.appendChild(li);
    });

  } catch (err) {
    console.warn("Could not load logs:", err.message);
  }
}

// ==============================
// SIMULATE (correct format for backend)
// ==============================
async function simulateWeed() {
  try {
    await fetch(`${BASE_URL}/api/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weed: true, moisture: 45 })
    });
    await loadStatusFromBackend();
    await loadLogsFromBackend();
  } catch (err) { console.warn("Simulate weed failed:", err.message); }
}

async function simulateClear() {
  try {
    await fetch(`${BASE_URL}/api/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weed: false, moisture: 62 })
    });
    await loadStatusFromBackend();
    await loadLogsFromBackend();
  } catch (err) { console.warn("Simulate clear failed:", err.message); }
}

// ==============================
// UI STATE
// ==============================
function showWeedUI() {
  const panel = document.getElementById('status-panel');
  if (panel) panel.className = 'panel status-panel weed';

  const chip = document.getElementById('status-chip');
  if (chip) { chip.className = 'panel-chip weed-chip'; chip.textContent = 'WEED DETECTED'; }

  const icon = document.getElementById('status-big-icon');
  if (icon) icon.textContent = '⚠';

  const headline = document.getElementById('status-headline');
  if (headline) headline.textContent = 'Weed Detected!';

  const desc = document.getElementById('status-desc');
  if (desc) desc.textContent = 'Weed has been detected in the field. Review logs and take action.';

  ['zone-a','zone-b','zone-c','zone-d'].forEach(id => {
    const z = document.getElementById(id);
    if (z) { z.className = 'zone-item danger'; z.textContent = id.replace('zone-','Zone ').toUpperCase() + ' ⚠'; }
  });
}

function showClearUI() {
  const panel = document.getElementById('status-panel');
  if (panel) panel.className = 'panel status-panel clear';

  const chip = document.getElementById('status-chip');
  if (chip) { chip.className = 'panel-chip clear-chip'; chip.textContent = 'CLEAR'; }

  const icon = document.getElementById('status-big-icon');
  if (icon) icon.textContent = '✔';

  const headline = document.getElementById('status-headline');
  if (headline) headline.textContent = 'No Weed Detected';

  const desc = document.getElementById('status-desc');
  if (desc) desc.textContent = 'Your field is clear. Continuous monitoring active across all zones.';

  ['zone-a','zone-b','zone-c','zone-d'].forEach(id => {
    const z = document.getElementById(id);
    if (z) { z.className = 'zone-item safe'; z.textContent = id.replace('zone-','Zone ').toUpperCase() + ' ✔'; }
  });
}