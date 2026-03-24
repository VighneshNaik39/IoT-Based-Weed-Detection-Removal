async function loadStatusFromBackend() {
  const res = await fetch("http://localhost:5000/api/status");
  const data = await res.json();

  // Status UI
  if (data.status === "Weed detected") {
    showWeedUI();
  } else {
    showClearUI();
  }

  // 🔥 UPDATE KPIs
  document.querySelector(".kpi-card:nth-child(1) .kpi-value").innerText = data.scansToday;
  document.querySelector(".kpi-card:nth-child(2) .kpi-value").innerText = data.weedsDetected;
  document.querySelector(".kpi-card:nth-child(3) .kpi-value").innerText = data.weedsRemoved;
  document.querySelector(".kpi-card:nth-child(5) .kpi-value").innerText = data.battery + "%";

  // 🔥 SENSOR DATA
  document.querySelectorAll(".sensor-value")[0].innerText = data.sensors.moisture + "%";
  document.querySelectorAll(".sensor-value")[1].innerText = data.sensors.temperature + "°C";
  document.querySelectorAll(".sensor-value")[2].innerText = data.sensors.humidity + "%";
  document.querySelectorAll(".sensor-value")[3].innerText = data.sensors.light;
}