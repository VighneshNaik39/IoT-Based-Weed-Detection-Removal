// ==========================================
// settings.js
// Dashboard Settings
// ==========================================

// DOM Elements
const backendURL = document.getElementById("backendURL");
const robotName = document.getElementById("robotName");
const refreshInterval = document.getElementById("refreshInterval");
const theme = document.getElementById("theme");

const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");

// ==========================================
// DEFAULT SETTINGS
// ==========================================

const defaultSettings = {

    backendURL: "http://localhost:3000",

    robotName: "IoT Weed Robot",

    refreshInterval: "2",

    theme: "dark"

};

// ==========================================
// LOAD SETTINGS
// ==========================================

window.onload = function () {

    loadSettings();

};

// ==========================================
// LOAD
// ==========================================

function loadSettings() {

    const settings = JSON.parse(

        localStorage.getItem("robotSettings")

    );

    if (settings) {

        backendURL.value = settings.backendURL;

        robotName.value = settings.robotName;

        refreshInterval.value = settings.refreshInterval;

        theme.value = settings.theme;

        applyTheme(settings.theme);

    }

    else {

        backendURL.value = defaultSettings.backendURL;

        robotName.value = defaultSettings.robotName;

        refreshInterval.value = defaultSettings.refreshInterval;

        theme.value = defaultSettings.theme;

    }

}

// ==========================================
// SAVE
// ==========================================

saveBtn.addEventListener("click", function () {

    const settings = {

        backendURL: backendURL.value,

        robotName: robotName.value,

        refreshInterval: refreshInterval.value,

        theme: theme.value

    };

    localStorage.setItem(

        "robotSettings",

        JSON.stringify(settings)

    );

    applyTheme(theme.value);

    alert("Settings Saved Successfully");

});

// ==========================================
// RESET
// ==========================================

resetBtn.addEventListener("click", function () {

    if (!confirm("Reset all settings?")) {

        return;

    }

    localStorage.removeItem("robotSettings");

    backendURL.value = defaultSettings.backendURL;

    robotName.value = defaultSettings.robotName;

    refreshInterval.value = defaultSettings.refreshInterval;

    theme.value = defaultSettings.theme;

    applyTheme(defaultSettings.theme);

    alert("Settings Reset");

});

// ==========================================
// THEME
// ==========================================

theme.addEventListener("change", function () {

    applyTheme(this.value);

});

function applyTheme(selectedTheme) {

    if (selectedTheme === "light") {

        document.body.style.background = "#f5f5f5";

        document.body.style.color = "#222";

    }

    else {

        document.body.style.background = "#0d1117";

        document.body.style.color = "#ffffff";

    }

}

// ==========================================
// BACKEND URL
// ==========================================

function getBackendURL() {

    const settings = JSON.parse(

        localStorage.getItem("robotSettings")

    );

    if (settings) {

        return settings.backendURL;

    }

    return defaultSettings.backendURL;

}

// ==========================================
// ROBOT NAME
// ==========================================

function getRobotName() {

    const settings = JSON.parse(

        localStorage.getItem("robotSettings")

    );

    if (settings) {

        return settings.robotName;

    }

    return defaultSettings.robotName;

}

// ==========================================
// REFRESH INTERVAL
// ==========================================

function getRefreshInterval() {

    const settings = JSON.parse(

        localStorage.getItem("robotSettings")

    );

    if (settings) {

        return parseInt(settings.refreshInterval);

    }

    return 2;

}

// ==========================================
// CONSOLE
// ==========================================

console.log("Settings Loaded Successfully");