// ==========================================
// Field Map JavaScript
// ==========================================

const fieldGrid = document.getElementById("fieldGrid");

const robotPosition = document.getElementById("robotPosition");
const direction = document.getElementById("direction");
const distance = document.getElementById("distance");
const weedCount = document.getElementById("weedCount");

// ==========================================
// SETTINGS
// ==========================================

const ROWS = 10;
const COLS = 10;

let robotX = 0;
let robotY = 0;

let travelledDistance = 0;

let currentDirection = "STOP";

let weeds = [
    {x:2,y:3},
    {x:6,y:5},
    {x:8,y:8},
    {x:4,y:1},
    {x:1,y:7}
];

// ==========================================
// CREATE GRID
// ==========================================

function createGrid(){

    fieldGrid.innerHTML="";

    for(let r=0;r<ROWS;r++){

        for(let c=0;c<COLS;c++){

            const cell=document.createElement("div");

            cell.classList.add("cell");

            cell.id=`cell-${r}-${c}`;

            fieldGrid.appendChild(cell);

        }

    }

}

// ==========================================
// DRAW WEEDS
// ==========================================

function drawWeeds(){

    weeds.forEach(w=>{

        const cell=document.getElementById(`cell-${w.x}-${w.y}`);

        if(cell){

            cell.classList.add("weed");

            cell.innerHTML="🌱";

        }

    });

}

// ==========================================
// DRAW ROBOT
// ==========================================

function drawRobot(){

    document.querySelectorAll(".robot").forEach(cell=>{

        cell.classList.remove("robot");

        cell.innerHTML="";

    });

    const robotCell=document.getElementById(`cell-${robotX}-${robotY}`);

    if(robotCell){

        robotCell.classList.add("robot");

        robotCell.innerHTML="🤖";

    }

    robotPosition.innerHTML=`X:${robotX} Y:${robotY}`;

    direction.innerHTML=currentDirection;

    distance.innerHTML=travelledDistance.toFixed(2)+" m";

    weedCount.innerHTML=weeds.length;

}

// ==========================================
// PATH
// ==========================================

function drawPath(x,y){

    const cell=document.getElementById(`cell-${x}-${y}`);

    if(cell){

        if(!cell.classList.contains("weed")){

            cell.classList.add("path");

        }

    }

}

// ==========================================
// MOVE ROBOT
// ==========================================

function move(dx,dy,dir){

    drawPath(robotX,robotY);

    const nx=robotX+dx;
    const ny=robotY+dy;

    if(nx<0 || ny<0 || nx>=ROWS || ny>=COLS){

        return;

    }

    robotX=nx;
    robotY=ny;

    currentDirection=dir;

    travelledDistance+=1;

    removeWeed(robotX,robotY);

    drawRobot();

}

// ==========================================
// REMOVE WEED
// ==========================================

function removeWeed(x,y){

    weeds=weeds.filter(w=>{

        return !(w.x===x && w.y===y);

    });

}

// ==========================================
// KEYBOARD CONTROL
// ==========================================

document.addEventListener("keydown",e=>{

    switch(e.key.toLowerCase()){

        case "w":

            move(-1,0,"FORWARD");

        break;

        case "s":

            move(1,0,"BACKWARD");

        break;

        case "a":

            move(0,-1,"LEFT");

        break;

        case "d":

            move(0,1,"RIGHT");

        break;

    }

});

// ==========================================
// LIVE BACKEND UPDATE
// ==========================================

async function updateFromBackend(){

    try{

        const res=await fetch("http://localhost:3000/field-map");

        const data=await res.json();

        robotX=data.x;
        robotY=data.y;

        travelledDistance=data.distance;

        currentDirection=data.direction;

        weeds=data.weeds;

        createGrid();

        drawWeeds();

        drawRobot();

    }

    catch(e){

        console.log("Backend not connected");

    }

}

// ==========================================
// AUTO REFRESH
// ==========================================

setInterval(updateFromBackend,3000);

// ==========================================
// INITIALIZE
// ==========================================

createGrid();

drawWeeds();

drawRobot();

console.log("Field Map Loaded");