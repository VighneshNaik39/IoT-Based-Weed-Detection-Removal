// ============================================================
// ROBOT CONTROL PAGE
// ============================================================
//
// Backend API:
//
// GET  /api/robot/status
//      -> { mode, command, distanceCm, obstacle, cutter, connected }
//
// POST /api/robot/mode
//      -> { mode: "manual" | "autonomous" }
//
// POST /api/move
//      -> { command: "forward" | "backward" | "left" | "right" }
//
// POST /api/stop
//
// POST /api/cutter
//      -> { state: true | false }
//
// POST /api/robot/speed
//      -> { speed: 0-100 }
//
// GET  /api/status
//      -> dashboard / battery status
//
// ============================================================

const BASE_URL = "";

// ============================================================
// GLOBAL STATE
// ============================================================

let currentMode = "manual";
let robotReachable = false;

let cutterState = false;
let cutterCommandInProgress = false;

let currentSpeed = 60;
let speedSendTimer = null;

// ============================================================
// CLOCK
// ============================================================

function tickClock() {
  const clock = document.getElementById("clock");

  if (clock) {
    clock.textContent = new Date().toLocaleTimeString();
  }
}

setInterval(tickClock, 1000);
tickClock();

// ============================================================
// MODE SWITCH
// ============================================================

async function setMode(mode) {
  if (mode !== "manual" && mode !== "autonomous") {
    console.warn("Invalid mode:", mode);
    return;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/api/robot/mode`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: mode
        })
      }
    );

    if (!res.ok) {
      let message = "Mode change rejected";

      try {
        const payload = await res.json();

        if (payload.message) {
          message = payload.message;
        }
      } catch (_) {}

      throw new Error(message);
    }

    // Update UI immediately.
    applyModeUI(mode);

    // Your ESP32 firmware turns the cutter OFF
    // when the operating mode changes.
    //
    // Status polling will confirm the real state.
    applyCutterUI(false);

  } catch (err) {
    console.warn(
      "Could not switch mode:",
      err.message
    );

    alert(`⚠️ Mode change rejected:\n\n${err.message}`);
  }
}

// ============================================================
// MODE UI
// ============================================================

function applyModeUI(mode) {
  currentMode = mode;

  const manualBtn =
    document.getElementById("btn-manual");

  const autonomousBtn =
    document.getElementById("btn-autonomous");

  if (manualBtn) {
    manualBtn.classList.toggle(
      "active",
      mode === "manual"
    );
  }

  if (autonomousBtn) {
    autonomousBtn.classList.toggle(
      "active",
      mode === "autonomous"
    );
  }

  const desc =
    document.getElementById("mode-desc");

  const chip =
    document.getElementById("dpad-chip");

  const hint =
    document.getElementById("dpad-hint");

  if (mode === "autonomous") {

    if (desc) {
      desc.textContent =
        "Autonomous — the robot drives itself and avoids obstacles.";
    }

    if (chip) {
      chip.textContent = "AUTONOMOUS";
    }

    if (hint) {
      hint.textContent =
        "Manual movement is disabled while autonomous. Stop still works.";
    }

  } else {

    if (desc) {
      desc.textContent =
        "Manual — you're driving the robot directly.";
    }

    if (chip) {
      chip.textContent = "MANUAL";
    }

    if (hint) {
      hint.textContent =
        "Use the arrows to drive. Stop always works.";
    }
  }

  setDpadEnabled(
    mode === "manual" &&
    robotReachable
  );
}

// ============================================================
// D-PAD ENABLE / DISABLE
// ============================================================

function setDpadEnabled(enabled) {
  const buttons = [
    "btn-forward",
    "btn-backward",
    "btn-left",
    "btn-right"
  ];

  buttons.forEach(id => {
    const btn =
      document.getElementById(id);

    if (btn) {
      btn.disabled = !enabled;
    }
  });
}

// ============================================================
// MODE BUTTONS
// ============================================================

const manualButton =
  document.getElementById("btn-manual");

if (manualButton) {

  manualButton.addEventListener(
    "click",
    () => {

      if (!robotReachable) {
        flashUnreachable();
        return;
      }

      setMode("manual");
    }
  );
}

const autonomousButton =
  document.getElementById("btn-autonomous");

if (autonomousButton) {

  autonomousButton.addEventListener(
    "click",
    () => {

      if (!robotReachable) {
        flashUnreachable();
        return;
      }

      setMode("autonomous");
    }
  );
}

// ============================================================
// MOVEMENT
// ============================================================

async function sendMove(command) {

  if (!robotReachable) {
    flashUnreachable();
    return;
  }

  // Manual movement only.
  //
  // Autonomous movement is controlled by
  // the ESP32/backend when currentMode is autonomous.
  if (currentMode !== "manual") {
    console.warn(
      "Manual movement disabled in autonomous mode."
    );
    return;
  }

  const validCommands = [
    "forward",
    "backward",
    "left",
    "right"
  ];

  if (!validCommands.includes(command)) {
    console.warn(
      "Invalid movement command:",
      command
    );
    return;
  }

  try {

    const res = await fetch(
      `${BASE_URL}/api/robot/move`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          command: command
        })
      }
    );

    if (!res.ok) {

      let message = "Move rejected";

      try {
        const payload =
          await res.json();

        if (payload.message) {
          message =
            payload.message;
        }
      } catch (_) {}

      throw new Error(message);
    }

  } catch (err) {

    console.warn(
      "Move failed:",
      err.message
    );

    flashUnreachable();
  }
}

// ============================================================
// STOP
// ============================================================

async function sendStop() {

  try {

    const res = await fetch(
      `${BASE_URL}/api/robot/stop`,
      {
        method: "POST"
      }
    );

    if (!res.ok) {
      throw new Error("Stop failed");
    }

    // ESP32 /stop:
    //
    // - stops motors
    // - sets manual mode
    // - turns cutter OFF

    applyModeUI("manual");
    applyCutterUI(false);

  } catch (err) {

    console.warn(
      "Stop failed:",
      err.message
    );

    flashUnreachable();
  }
}

// ============================================================
// D-PAD BUTTONS
// ============================================================

document
  .querySelectorAll(".dpad-btn[data-cmd]")
  .forEach(btn => {

    btn.addEventListener(
      "click",
      () => {

        const command =
          btn.dataset.cmd;

        if (command) {
          sendMove(command);
        }
      }
    );
  });

// ============================================================
// STOP BUTTON
// ============================================================

const stopButton =
  document.getElementById("btn-stop");

if (stopButton) {

  stopButton.addEventListener(
    "click",
    sendStop
  );
}

// ============================================================
// CUTTER
// ============================================================
//
// CURRENT STATE:
//
// OFF
//   ↓
// button = "🔪 Cutter ON"
//   ↓
// click
//   ↓
// ON
//   ↓
// button = "⏹ Cutter OFF"
//   ↓
// click
//   ↓
// OFF
//
// ============================================================

// ============================================================
// SEND CUTTER COMMAND
// ============================================================

async function setCutter(state) {

  const desiredState =
    Boolean(state);

  try {

    const res = await fetch(
      `${BASE_URL}/api/robot/cutter`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          state: desiredState
        })
      }
    );

    if (!res.ok) {

      let message =
        "Cutter command rejected";

      try {

        const payload =
          await res.json();

        if (payload.message) {
          message =
            payload.message;
        }

      } catch (_) {}

      throw new Error(message);
    }

    // Backend accepted command.
    cutterState =
      desiredState;

    applyCutterUI(
      cutterState
    );

    return true;

  } catch (err) {

    console.warn(
      "Cutter command failed:",
      err.message
    );

    return false;
  }
}

// ============================================================
// CUTTER TOGGLE
// ============================================================

async function toggleCutter() {

  if (cutterCommandInProgress) {
    return;
  }

  if (!robotReachable) {
    flashUnreachable();
    return;
  }

  const button =
    document.getElementById(
      "btn-cutter"
    );

  if (!button) {
    return;
  }

  const newState =
    !cutterState;

  cutterCommandInProgress =
    true;

  button.disabled = true;

  try {

    const success =
      await setCutter(
        newState
      );

    if (!success) {
      return;
    }

  } finally {

    cutterCommandInProgress =
      false;

    button.disabled =
      !robotReachable;
  }
}

// ============================================================
// CUTTER BUTTON
// ============================================================

const cutterButton =
  document.getElementById(
    "btn-cutter"
  );

if (cutterButton) {

  cutterButton.addEventListener(
    "click",
    toggleCutter
  );
}

// ============================================================
// CUTTER UI
// ============================================================

function applyCutterUI(on) {

  cutterState =
    Boolean(on);

  const chip =
    document.getElementById(
      "cutter-chip"
    );

  const button =
    document.getElementById(
      "btn-cutter"
    );

  // ----------------------------------------------------------
  // CUTTER STATUS CHIP
  // ----------------------------------------------------------

  if (chip) {

    chip.textContent =
      cutterState
        ? "ON"
        : "OFF";

    chip.className =
      "panel-chip " +
      (
        cutterState
          ? "weed-chip"
          : "clear-chip"
      );
  }

  // ----------------------------------------------------------
  // CUTTER BUTTON
  // ----------------------------------------------------------

  if (button) {

    // IMPORTANT:
    //
    // Button text describes the ACTION,
    // not the current state.
    //
    // Current OFF -> ON action
    // Current ON  -> OFF action

    if (cutterState) {

      button.textContent =
        "⏹ Cutter OFF";

    } else {

      button.textContent =
        "🔪 Cutter ON";
    }

    button.classList.toggle(
      "on",
      cutterState
    );

    button.classList.toggle(
      "off",
      !cutterState
    );

    button.classList.toggle(
      "armed",
      cutterState
    );

    button.setAttribute(
      "aria-pressed",
      cutterState
        ? "true"
        : "false"
    );
  }
}

// ============================================================
// SPEED CONTROL
// ============================================================

const speedSlider =
  document.getElementById(
    "speed-slider"
  );

const speedReadout =
  document.getElementById(
    "speed-readout"
  );

const speedChip =
  document.getElementById(
    "speed-chip"
  );

const presetBtns =
  document.querySelectorAll(
    ".speed-preset-btn"
  );

// ============================================================
// SPEED ENABLE / DISABLE
// ============================================================

function setSpeedEnabled(enabled) {

  if (speedSlider) {
    speedSlider.disabled =
      !enabled;
  }

  presetBtns.forEach(btn => {
    btn.disabled =
      !enabled;
  });
}

// ============================================================
// SPEED UI
// ============================================================

function updateSpeedUI(pct) {

  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(pct)
      )
    );

  currentSpeed =
    value;

  if (speedSlider) {
    speedSlider.value =
      value;
  }

  if (speedReadout) {
    speedReadout.textContent =
      value + "%";
  }

  if (speedChip) {
    speedChip.textContent =
      value + "%";
  }

  presetBtns.forEach(btn => {

    btn.classList.toggle(
      "active",
      Number(
        btn.dataset.speed
      ) === value
    );

  });
}

// ============================================================
// SEND SPEED
// ============================================================

async function sendSpeed(pct) {

  if (!robotReachable) {
    flashUnreachable();
    return;
  }

  const value =
    Math.max(
      0,
      Math.min(
        100,
        Number(pct)
      )
    );

  try {

    const res = await fetch(
      `${BASE_URL}/api/robot/speed`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          speed: value
        })
      }
    );

    if (!res.ok) {
      throw new Error(
        "Speed command rejected"
      );
    }

    currentSpeed =
      value;

  } catch (err) {

    console.warn(
      "Speed command failed:",
      err.message
    );

    flashUnreachable();
  }
}

// ============================================================
// SPEED SLIDER
// ============================================================

if (speedSlider) {

  speedSlider.addEventListener(
    "input",
    () => {

      const pct =
        Number(
          speedSlider.value
        );

      updateSpeedUI(
        pct
      );

      clearTimeout(
        speedSendTimer
      );

      speedSendTimer =
        setTimeout(
          () => {

            sendSpeed(
              pct
            );

          },
          200
        );
    }
  );

  speedSlider.addEventListener(
    "change",
    () => {

      clearTimeout(
        speedSendTimer
      );

      sendSpeed(
        Number(
          speedSlider.value
        )
      );
    }
  );
}

// ============================================================
// SPEED PRESETS
// ============================================================

presetBtns.forEach(btn => {

  btn.addEventListener(
    "click",
    () => {

      if (!robotReachable) {
        flashUnreachable();
        return;
      }

      const pct =
        Number(
          btn.dataset.speed
        );

      if (speedSlider) {
        speedSlider.value =
          pct;
      }

      updateSpeedUI(
        pct
      );

      clearTimeout(
        speedSendTimer
      );

      sendSpeed(
        pct
      );
    }
  );
});

updateSpeedUI(
  currentSpeed
);

// ============================================================
// LIVE ROBOT STATUS
// ============================================================

async function loadRobotStatus() {

  try {

    const res = await fetch(
      `${BASE_URL}/api/robot/status`,
      {
        cache: "no-store"
      }
    );

    if (!res.ok) {
      throw new Error(
        "Robot status unavailable"
      );
    }

    const payload =
      await res.json();

    // Supports both:
    //
    // { data: {...} }
    //
    // and:
    //
    // { mode: ..., cutter: ... }

    const data =
      payload.data ||
      payload;

    // ========================================================
    // CONNECTION
    // ========================================================

    robotReachable =
      true;

    setLinkUI(
      true
    );

    // ========================================================
    // MODE
    // ========================================================

    if (
      data.mode &&
      data.mode !== currentMode
    ) {

      applyModeUI(
        data.mode
      );
    }

    const modeEl =
      document.getElementById(
        "st-mode"
      );

    if (modeEl) {

      modeEl.textContent =
        (
          data.mode ||
          "--"
        ).toUpperCase();
    }

    // ========================================================
    // CURRENT ACTION
    // ========================================================

    const actionEl =
      document.getElementById(
        "st-action"
      );

    if (actionEl) {

      actionEl.textContent =
        (
          data.command ||
          data.dir ||
          "--"
        ).toUpperCase();
    }

    // ========================================================
    // DISTANCE
    // ========================================================

    const distEl =
      document.getElementById(
        "st-distance"
      );

    if (distEl) {

      let distance =
        data.distanceCm;

      if (
        distance == null &&
        data.distance_cm != null
      ) {

        distance =
          data.distance_cm;
      }

      if (
        distance != null &&
        Number.isFinite(
          Number(distance)
        )
      ) {

        distEl.textContent =
          Number(distance)
            .toFixed(1) +
          " cm";

      } else {

        distEl.textContent =
          "-- cm";
      }
    }

    // ========================================================
    // OBSTACLE
    // ========================================================

    const obsEl =
      document.getElementById(
        "st-obstacle"
      );

    if (obsEl) {

      let obstacle =
        Boolean(
          data.obstacle
        );

      // If backend does not provide
      // obstacle directly, calculate
      // it using the 20 cm threshold.

      if (
        typeof data.obstacle ===
        "undefined"
      ) {

        let distance =
          data.distanceCm;

        if (
          distance == null &&
          data.distance_cm != null
        ) {

          distance =
            data.distance_cm;
        }

        obstacle =
          distance != null &&
          Number(distance) > 0 &&
          Number(distance) < 20;
      }

      obsEl.textContent =
        obstacle
          ? "BLOCKED"
          : "CLEAR";

      obsEl.className =
        "status-value " +
        (
          obstacle
            ? "warn"
            : "ok"
        );
    }

    // ========================================================
    // CUTTER
    // ========================================================
    //
    // IMPORTANT:
    //
    // Do NOT invert this.
    //
    // cutter:true  = ON
    // cutter:false = OFF
    //
    // ========================================================

    if (
      typeof data.cutter !==
      "undefined"
    ) {

      applyCutterUI(
        Boolean(
          data.cutter
        )
      );
    }

  } catch (err) {

    console.warn(
      "Robot status failed:",
      err.message
    );

    robotReachable =
      false;

    setLinkUI(
      false
    );
  }
}

// ============================================================
// DASHBOARD / BATTERY STATUS
// ============================================================

async function loadWeedStatusForBattery() {

  try {

    const res = await fetch(
      `${BASE_URL}/api/status`,
      {
        cache: "no-store"
      }
    );

    if (!res.ok) {
      throw new Error(
        "Status unavailable"
      );
    }

    const data =
      await res.json();

    // ========================================================
    // CUTTER STATUS
    // ========================================================

    const cutterStatusEl =
      document.getElementById(
        "st-cutter-status"
      );

    if (cutterStatusEl) {
      cutterStatusEl.textContent =
        cutterState ? "Active (Cutting)" : "Ready (GPIO 4)";
      cutterStatusEl.className =
        "status-value " + (cutterState ? "warn" : "");
    }

    // ========================================================
    // SYSTEM BADGE
    // ========================================================

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

  } catch (err) {

    console.warn(
      "Dashboard status failed:",
      err.message
    );

    const sysBadge =
      document.getElementById(
        "sys-badge"
      );

    if (sysBadge) {

      sysBadge.textContent =
        "● Offline";

      sysBadge.className =
        "sys-badge refreshing";
    }
  }
}

// ============================================================
// CONNECTION UI
// ============================================================

function setLinkUI(reachable) {

  // ==========================================================
  // ESP32 LINK STATUS
  // ==========================================================

  const linkEl =
    document.getElementById(
      "st-link"
    );

  if (linkEl) {

    linkEl.textContent =
      reachable
        ? "CONNECTED"
        : "UNREACHABLE";

    linkEl.className =
      "status-value " +
      (
        reachable
          ? "ok"
          : "warn"
      );
  }

  // ==========================================================
  // CONNECTION CHIP
  // ==========================================================

  const connChip =
    document.getElementById(
      "conn-chip"
    );

  if (connChip) {

    connChip.textContent =
      reachable
        ? "LIVE"
        : "OFFLINE";

    connChip.className =
      "panel-chip " +
      (
        reachable
          ? "clear-chip"
          : "weed-chip"
      );
  }

  // ==========================================================
  // DEVICE DOT
  // ==========================================================

  const dot =
    document.getElementById(
      "device-dot"
    );

  const deviceText =
    document.getElementById(
      "device-status-text"
    );

  if (dot) {

    dot.style.background =
      reachable
        ? "var(--green-400)"
        : "var(--red-600)";
  }

  if (deviceText) {

    deviceText.textContent =
      reachable
        ? "Connected"
        : "Disconnected";
  }

  // ==========================================================
  // MOVEMENT
  // ==========================================================

  setDpadEnabled(
    reachable &&
    currentMode === "manual"
  );

  // ==========================================================
  // SPEED
  // ==========================================================

  setSpeedEnabled(
    reachable
  );

  // ==========================================================
  // MODE BUTTONS
  // ==========================================================

  const manualBtn =
    document.getElementById(
      "btn-manual"
    );

  const autonomousBtn =
    document.getElementById(
      "btn-autonomous"
    );

  if (manualBtn) {
    manualBtn.disabled =
      !reachable;
  }

  if (autonomousBtn) {
    autonomousBtn.disabled =
      !reachable;
  }

  // ==========================================================
  // CUTTER BUTTON
  // ==========================================================

  const cutterBtn =
    document.getElementById(
      "btn-cutter"
    );

  if (cutterBtn) {

    cutterBtn.disabled =
      !reachable ||
      cutterCommandInProgress;
  }
}

// ============================================================
// UNREACHABLE
// ============================================================

function flashUnreachable() {

  robotReachable =
    false;

  setLinkUI(
    false
  );
}

// ============================================================
// INITIAL UI STATE
// ============================================================

// Safe initial state.
// ESP32 status polling will replace this
// with the actual cutter state.

applyCutterUI(
  false
);

applyModeUI(
  currentMode
);

updateSpeedUI(
  currentSpeed
);

// ============================================================
// INITIAL LOAD
// ============================================================

loadRobotStatus();

loadWeedStatusForBattery();

// ============================================================
// POLLING
// ============================================================

// Robot state every 1.5 seconds.
setInterval(
  loadRobotStatus,
  1500
);

// Battery/system every 3 seconds.
setInterval(
  loadWeedStatusForBattery,
  3000
);