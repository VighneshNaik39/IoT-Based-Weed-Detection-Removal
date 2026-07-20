// ===================================================
// IoT Weed Detection Robot Dashboard
// script.js (Part 1)
// ===================================================

// -------------------------------
// DOM Elements
// -------------------------------

const robotStatus = document.getElementById("robotStatus");
const connectionStatus = document.getElementById("connectionStatus");
const batteryStatus = document.getElementById("batteryStatus");
const obstacleStatus = document.getElementById("obstacleStatus");

const forwardBtn = document.getElementById("forwardBtn");
const backwardBtn = document.getElementById("backwardBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const stopBtn = document.getElementById("stopBtn");

const cutterOnBtn = document.getElementById("cutterOnBtn");
const cutterOffBtn = document.getElementById("cutterOffBtn");

const emergencyBtn = document.getElementById("emergencyBtn");

const activityList = document.getElementById("activityList");

// -------------------------------
// Dashboard Variables
// -------------------------------

let robotConnected = false;
let activityCounter = 0;

// -------------------------------
// Initialize Dashboard
// -------------------------------

window.onload = function () {

    initializeDashboard();

};

// -------------------------------

function initializeDashboard() {

    registerButtonEvents();

    showToast("Dashboard Loaded", "success");

}

// -------------------------------
// Register Button Events
// -------------------------------

function registerButtonEvents() {

    forwardBtn.addEventListener("click", moveForwardHandler);

    backwardBtn.addEventListener("click", moveBackwardHandler);

    leftBtn.addEventListener("click", moveLeftHandler);

    rightBtn.addEventListener("click", moveRightHandler);

    stopBtn.addEventListener("click", stopHandler);

    cutterOnBtn.addEventListener("click", cutterOnHandler);

    cutterOffBtn.addEventListener("click", cutterOffHandler);

    emergencyBtn.addEventListener("click", emergencyStopHandler);

}

// ===================================================
// ROBOT MOVEMENT
// ===================================================

async function moveForwardHandler() {

    const result = await robotAPI.moveForward();

    if(result.success){

        updateRobotStatus("FORWARD");

        addActivity("Forward");

        showToast("Moving Forward","success");

    }else{

        apiError(result.message);

    }

}

// -------------------------------

async function moveBackwardHandler(){

    const result = await robotAPI.moveBackward();

    if(result.success){

        updateRobotStatus("BACKWARD");

        addActivity("Backward");

        showToast("Moving Backward","success");

    }else{

        apiError(result.message);

    }

}

// -------------------------------

async function moveLeftHandler(){

    const result = await robotAPI.moveLeft();

    if(result.success){

        updateRobotStatus("LEFT");

        addActivity("Turn Left");

        showToast("Turning Left","success");

    }else{

        apiError(result.message);

    }

}

// -------------------------------

async function moveRightHandler(){

    const result = await robotAPI.moveRight();

    if(result.success){

        updateRobotStatus("RIGHT");

        addActivity("Turn Right");

        showToast("Turning Right","success");

    }else{

        apiError(result.message);

    }

}

// -------------------------------

async function stopHandler(){

    const result = await robotAPI.stopRobot();

    if(result.success){

        updateRobotStatus("STOPPED");

        addActivity("Stop");

        showToast("Robot Stopped","warning");

    }else{

        apiError(result.message);

    }

}

// ===================================================
// CUTTER CONTROL
// ===================================================

async function cutterOnHandler(){

    const result = await robotAPI.cutterOn();

    if(result.success){

        addActivity("Cutter ON");

        showToast("Cutter Started","success");

    }else{

        apiError(result.message);

    }

}

// -------------------------------

async function cutterOffHandler(){

    const result = await robotAPI.cutterOff();

    if(result.success){

        addActivity("Cutter OFF");

        showToast("Cutter Stopped","warning");

    }else{

        apiError(result.message);

    }

}

// ===================================================
// EMERGENCY STOP
// ===================================================

async function emergencyStopHandler(){

    const ok = confirm("Emergency Stop Robot?");

    if(!ok) return;

    const result = await robotAPI.emergencyStop();

    if(result.success){

        updateRobotStatus("EMERGENCY STOP");

        addActivity("Emergency Stop");

        showToast("Emergency Stop Activated","error");

    }else{

        apiError(result.message);

    }

}

// ===================================================
// UPDATE ROBOT STATUS
// ===================================================

function updateRobotStatus(status){

    robotStatus.innerHTML = status;

}

// ===================================================
// ACTIVITY PANEL
// ===================================================

function addActivity(text){

    activityCounter++;

    const item = document.createElement("li");

    const time = new Date().toLocaleTimeString();

    item.innerHTML =
        "<strong>#"+activityCounter+"</strong> - "
        + text +
        " <span style='float:right'>"
        + time +
        "</span>";

    activityList.prepend(item);

    while(activityList.children.length>10){

        activityList.removeChild(activityList.lastChild);

    }

}
// ===================================================
// LIVE ROBOT STATUS (Part 2)
// ===================================================

// Auto refresh every 2 seconds
setInterval(updateDashboardStatus, 2000);

// Initial status fetch
updateDashboardStatus();

// ----------------------------------------

async function updateDashboardStatus() {

    try {

        const data = await robotAPI.getRobotStatus();

        if (data.success === false) {

            updateConnection(false);

            return;

        }

        updateConnection(true);

        // Robot Status
        if (data.status) {
            robotStatus.textContent = data.status;
        }

        // Battery
        if (data.battery !== undefined) {
            batteryStatus.textContent = data.battery + "%";

            if (data.battery < 20) {

                batteryStatus.style.color = "#ff3b30";

            } else if (data.battery < 50) {

                batteryStatus.style.color = "#ffb020";

            } else {

                batteryStatus.style.color = "#2ecc71";

            }
        }

        // Obstacle
        if (data.obstacle) {

            obstacleStatus.textContent = data.obstacle;

            if (data.obstacle === "DETECTED") {

                obstacleStatus.style.color = "#ff3b30";

            } else {

                obstacleStatus.style.color = "#2ecc71";

            }

        }

    }

    catch (error) {

        console.error(error);

        updateConnection(false);

    }

}

// ===================================================
// CONNECTION STATUS
// ===================================================

function updateConnection(isConnected) {

    robotConnected = isConnected;

    if (isConnected) {

        connectionStatus.innerHTML = "🟢 Connected";

        connectionStatus.className = "connected";

        enableControls();

    }

    else {

        connectionStatus.innerHTML = "🔴 Offline";

        connectionStatus.className = "disconnected";

        disableControls();

    }

}

// ===================================================
// ENABLE BUTTONS
// ===================================================

function enableControls() {

    const controls = [

        forwardBtn,
        backwardBtn,
        leftBtn,
        rightBtn,
        stopBtn,

        cutterOnBtn,
        cutterOffBtn,

        emergencyBtn

    ];

    controls.forEach(button => {

        button.disabled = false;

        button.style.opacity = "1";

        button.style.cursor = "pointer";

    });

}

// ===================================================
// DISABLE BUTTONS
// ===================================================

function disableControls() {

    const controls = [

        forwardBtn,
        backwardBtn,
        leftBtn,
        rightBtn,
        stopBtn,

        cutterOnBtn,
        cutterOffBtn,

        emergencyBtn

    ];

    controls.forEach(button => {

        button.disabled = true;

        button.style.opacity = "0.5";

        button.style.cursor = "not-allowed";

    });

}

// ===================================================
// LOAD LOGS
// ===================================================

async function loadLatestLogs() {

    try {

        const logs = await robotAPI.getLogs();

        if (!Array.isArray(logs)) return;

        activityList.innerHTML = "";

        logs.slice(-10).reverse().forEach(log => {

            const li = document.createElement("li");

            li.innerHTML = `

                <strong>${log.command || "Unknown"}</strong>

                <span style="float:right">

                    ${log.time || "--"}

                </span>

            `;

            activityList.appendChild(li);

        });

    }

    catch (error) {

        console.error(error);

    }

}

// Refresh logs every 5 seconds
setInterval(loadLatestLogs, 5000);

// Initial log load
loadLatestLogs();

// ===================================================
// API ERROR HANDLING
// ===================================================

function apiError(message) {

    console.error(message);

    showToast(

        message || "Unable to communicate with robot.",

        "error"

    );

}
// ===================================================
// KEYBOARD CONTROLS
// W = Forward
// S = Backward
// A = Left
// D = Right
// Space = Stop
// ===================================================

document.addEventListener("keydown", function(event){

    // Ignore if typing inside an input/textarea
    if (
        event.target.tagName === "INPUT" ||
        event.target.tagName === "TEXTAREA"
    ){
        return;
    }

    switch(event.key.toLowerCase()){

        case "w":
            moveForwardHandler();
            animateButton(forwardBtn);
            break;

        case "s":
            moveBackwardHandler();
            animateButton(backwardBtn);
            break;

        case "a":
            moveLeftHandler();
            animateButton(leftBtn);
            break;

        case "d":
            moveRightHandler();
            animateButton(rightBtn);
            break;

        case " ":
            event.preventDefault();
            stopHandler();
            animateButton(stopBtn);
            break;

    }

});

// ===================================================
// BUTTON ANIMATION
// ===================================================

function animateButton(button){

    button.style.transform = "scale(0.90)";

    setTimeout(function(){

        button.style.transform = "scale(1)";

    },150);

}

// ===================================================
// TOAST NOTIFICATION
// ===================================================

function showToast(message,type="success"){

    const toast=document.createElement("div");

    toast.innerText=message;

    toast.style.position="fixed";
    toast.style.top="20px";
    toast.style.right="20px";
    toast.style.padding="15px 20px";
    toast.style.borderRadius="8px";
    toast.style.color="white";
    toast.style.fontWeight="bold";
    toast.style.zIndex="9999";
    toast.style.boxShadow="0 5px 15px rgba(0,0,0,.3)";
    toast.style.transition="0.3s";

    switch(type){

        case "success":
            toast.style.background="#2ecc71";
            break;

        case "warning":
            toast.style.background="#f39c12";
            break;

        case "error":
            toast.style.background="#e74c3c";
            break;

        default:
            toast.style.background="#3498db";

    }

    document.body.appendChild(toast);

    setTimeout(function(){

        toast.style.opacity="0";

    },2500);

    setTimeout(function(){

        toast.remove();

    },3000);

}

// ===================================================
// LOADING EFFECT
// ===================================================

function showLoading(){

    document.body.style.cursor="wait";

}

function hideLoading(){

    document.body.style.cursor="default";

}

// ===================================================
// PAGE VISIBILITY
// ===================================================

document.addEventListener("visibilitychange",function(){

    if(document.hidden){

        console.log("Dashboard Hidden");

    }

    else{

        console.log("Dashboard Active");

        updateDashboardStatus();

    }

});

// ===================================================
// WINDOW ONLINE/OFFLINE
// ===================================================

window.addEventListener("online",function(){

    showToast("Internet Connected","success");

    updateDashboardStatus();

});

window.addEventListener("offline",function(){

    connectionStatus.innerHTML="🔴 Offline";

    connectionStatus.className="disconnected";

    showToast("Internet Disconnected","error");

});

// ===================================================
// DASHBOARD STARTUP
// ===================================================

document.addEventListener("DOMContentLoaded",function(){

    console.log("Dashboard Ready");

    showToast("Welcome to IoT Robot Dashboard","success");

    updateDashboardStatus();

    loadLatestLogs();

});

// ===================================================
// ROBOT HEARTBEAT
// ===================================================

setInterval(async()=>{

    const connected=await robotAPI.checkConnection();

    updateConnection(connected);

},5000);

// ===================================================
// DEBUG MODE
// ===================================================

console.log("==================================");
console.log("IoT Weed Detection Robot");
console.log("Frontend Loaded Successfully");
console.log("Member 2 Dashboard");
console.log("==================================");