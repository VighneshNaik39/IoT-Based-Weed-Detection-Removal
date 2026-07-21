// ==========================================
// Robot Control JavaScript
// ==========================================

// ---------- Elements ----------

const robotState = document.getElementById("robotState");
const batteryBar = document.getElementById("batteryBar");
const batteryText = document.getElementById("batteryText");
const distance = document.getElementById("distance");
const obstacle = document.getElementById("obstacle");
const currentAction = document.getElementById("currentAction");
const espStatus = document.getElementById("espStatus");

const modeSwitch = document.getElementById("modeSwitch");
const modeText = document.getElementById("modeText");

const forwardBtn = document.getElementById("forwardBtn");
const backwardBtn = document.getElementById("backwardBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const stopBtn = document.getElementById("stopBtn");

const cutterOn = document.getElementById("cutterOn");
const cutterOff = document.getElementById("cutterOff");

const emergency = document.getElementById("emergency");

// ==========================================
// MODE SWITCH
// ==========================================

modeSwitch.addEventListener("change", async () => {

    if(modeSwitch.checked){

        modeText.innerHTML="Autonomous Mode";

        await sendMode("auto");

    }

    else{

        modeText.innerHTML="Manual Mode";

        await sendMode("manual");

    }

});

// ==========================================
// ROBOT MOVEMENT
// ==========================================

forwardBtn.onclick=()=>moveRobot("forward");

backwardBtn.onclick=()=>moveRobot("backward");

leftBtn.onclick=()=>moveRobot("left");

rightBtn.onclick=()=>moveRobot("right");

stopBtn.onclick=()=>moveRobot("stop");

// ==========================================
// MOVE FUNCTION
// ==========================================

async function moveRobot(direction){

    currentAction.innerHTML=direction.toUpperCase();

    robotState.innerHTML=direction.toUpperCase();

    try{

        await robotAPI.sendCommand("/"+direction);

    }

    catch(e){

        console.log(e);

    }

}

// ==========================================
// CUTTER
// ==========================================

cutterOn.onclick=async()=>{

    currentAction.innerHTML="CUTTER ON";

    await robotAPI.sendCommand("/cutter/on");

};

cutterOff.onclick=async()=>{

    currentAction.innerHTML="CUTTER OFF";

    await robotAPI.sendCommand("/cutter/off");

};

// ==========================================
// EMERGENCY
// ==========================================

emergency.onclick=async()=>{

    if(confirm("Emergency Stop?")){

        robotState.innerHTML="STOPPED";

        currentAction.innerHTML="EMERGENCY STOP";

        await robotAPI.sendCommand("/stop");

    }

};

// ==========================================
// SEND MODE
// ==========================================

async function sendMode(mode){

    try{

        await fetch("http://localhost:3000/mode",{

            method:"POST",

            headers:{

                "Content-Type":"application/json"

            },

            body:JSON.stringify({

                mode:mode

            })

        });

    }

    catch(e){

        console.log(e);

    }

}

// ==========================================
// LIVE STATUS
// ==========================================

async function updateStatus(){

    try{

        const response=await fetch("http://localhost:3000/status");

        const data=await response.json();

        batteryText.innerHTML=data.battery+"%";

        batteryBar.style.width=data.battery+"%";

        distance.innerHTML=data.distance+" m";

        obstacle.innerHTML=data.obstacle;

        robotState.innerHTML=data.status;

        currentAction.innerHTML=data.action;

        espStatus.innerHTML=data.esp;

    }

    catch(e){

        console.log("Backend Offline");

    }

}

// ==========================================
// KEYBOARD CONTROLS
// ==========================================

document.addEventListener("keydown",(e)=>{

    switch(e.key.toLowerCase()){

        case "w":

            moveRobot("forward");

        break;

        case "s":

            moveRobot("backward");

        break;

        case "a":

            moveRobot("left");

        break;

        case "d":

            moveRobot("right");

        break;

        case " ":

            moveRobot("stop");

        break;

    }

});

// ==========================================
// AUTO REFRESH
// ==========================================

setInterval(updateStatus,2000);

updateStatus();

console.log("Robot Control Loaded");