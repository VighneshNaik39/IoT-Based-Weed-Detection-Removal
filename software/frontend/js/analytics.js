// ==============================
// ANALYTICS PAGE
// Reads from GET /api/logs (recent detection log) and
// GET /api/sessions (last 5 grouped sessions) — no new backend
// endpoints needed, this page is purely a different view of
// data the backend already exposes.
// ==============================
const BASE_URL = "";

function tickClock() {
  const el = document.getElementById("clock");
  if (el) el.textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000);
tickClock();

async function loadKpisFromLogs() {
  try {
    const res = await fetch(`${BASE_URL}/api/logs`);
    if (!res.ok) throw new Error("logs unavailable");
    const logs = await res.json();

    const totalScans = logs.length;
    const totalWeeds = logs.filter(l => l.status === "Weed detected").length;
    const rate = totalScans > 0 ? Math.round((totalWeeds / totalScans) * 100) : 0;

    document.getElementById("an-total-scans").textContent = totalScans;
    document.getElementById("an-total-weeds").textContent = totalWeeds;
    document.getElementById("an-detection-rate").textContent = rate + "%";

    const sysBadge = document.getElementById("sys-badge");
    sysBadge.textContent = "● System Online";
    sysBadge.className = "sys-badge online";

    const dot = document.getElementById("device-dot");
    const text = document.getElementById("device-status-text");
    if (dot) dot.style.background = "var(--green-400)";
    if (text) text.textContent = "Connected";

  } catch (err) {
    console.warn("Analytics: could not load logs:", err.message);
    const sysBadge = document.getElementById("sys-badge");
    sysBadge.textContent = "● Offline";
    sysBadge.className = "sys-badge refreshing";
  }
}

async function loadSessions() {
  try {
    const res = await fetch(`${BASE_URL}/api/sessions`);
    if (!res.ok) throw new Error("sessions unavailable");
    const sessions = await res.json();

    document.getElementById("an-sessions").textContent = sessions.length;

    renderBarChart(sessions);
    renderSessionTable(sessions);

  } catch (err) {
    console.warn("Analytics: could not load sessions:", err.message);
    document.getElementById("bar-chart").innerHTML =
      '<p class="chart-empty">Session data unavailable — backend unreachable.</p>';
    document.getElementById("session-table-body").innerHTML =
      '<tr><td colspan="6" class="chart-empty">Session data unavailable.</td></tr>';
  }
}

function renderBarChart(sessions) {
  const chart = document.getElementById("bar-chart");

  if (!sessions.length) {
    chart.innerHTML = '<p class="chart-empty">No sessions recorded yet.</p>';
    return;
  }

  // Oldest -> newest, left to right
  const ordered = [...sessions].reverse();
  const maxDetections = Math.max(1, ...ordered.map(s => s.totalDetections || 0));

  chart.innerHTML = "";
  ordered.forEach(s => {
    const heightPct = Math.max(4, Math.round(((s.totalDetections || 0) / maxDetections) * 100));

    const col = document.createElement("div");
    col.className = "bar-col";
    col.innerHTML = `
      <div class="bar-track">
        <div class="bar-fill" style="height:${heightPct}%">
          <span class="bar-count">${s.totalDetections ?? 0}</span>
        </div>
      </div>
      <span class="bar-label">S${s.sessionNumber}</span>
    `;
    chart.appendChild(col);
  });
}

function renderSessionTable(sessions) {
  const body = document.getElementById("session-table-body");

  if (!sessions.length) {
    body.innerHTML = '<tr><td colspan="6" class="chart-empty">No sessions recorded yet.</td></tr>';
    return;
  }

  body.innerHTML = "";
  sessions.forEach(s => {
    const started = s.startTime
      ? new Date(s.startTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : "--";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.sessionNumber}</td>
      <td>${started}</td>
      <td>${s.executions ?? 0}</td>
      <td>${s.totalDetections ?? 0}</td>
      <td>${s.avgMoisture != null ? s.avgMoisture + "%" : "--"}</td>
      <td><span class="an-badge ${s.completed ? "completed" : "active"}">${s.completed ? "Completed" : "In Progress"}</span></td>
    `;
    body.appendChild(tr);
  });
}

function loadAll() {
  loadKpisFromLogs();
  loadSessions();
}

loadAll();
setInterval(loadAll, 5000);
