// ==========================================
// Analytics Dashboard
// ==========================================

// Dashboard Cards
const weedDetected = document.getElementById("weedDetected");
const weedRemoved = document.getElementById("weedRemoved");
const distanceTravelled = document.getElementById("distanceTravelled");
const battery = document.getElementById("battery");
const runtime = document.getElementById("runtime");
const obstacles = document.getElementById("obstacles");

// ==========================================
// SAMPLE DATA
// (Replace with backend data later)
// ==========================================

let dashboard = {

    weedsDetected:24,

    weedsRemoved:18,

    distance:42.5,

    battery:88,

    runtime:52,

    obstacles:5

};

// ==========================================
// UPDATE CARDS
// ==========================================

function updateCards(){

    weedDetected.innerHTML = dashboard.weedsDetected;

    weedRemoved.innerHTML = dashboard.weedsRemoved;

    distanceTravelled.innerHTML =
        dashboard.distance + " m";

    battery.innerHTML =
        dashboard.battery + "%";

    runtime.innerHTML =
        dashboard.runtime + " min";

    obstacles.innerHTML =
        dashboard.obstacles;

}

// ==========================================
// MOVEMENT CHART
// ==========================================

const movementChart = new Chart(

document.getElementById("movementChart"),

{

type:"bar",

data:{

labels:[

"Forward",

"Backward",

"Left",

"Right",

"Stop"

],

datasets:[{

label:"Commands",

data:[

55,

14,

20,

18,

10

],

backgroundColor:[

"#00E676",

"#00BCD4",

"#FFC107",

"#FF9800",

"#F44336"

],

borderRadius:8

}]

},

options:{

responsive:true,

plugins:{

legend:{

display:false

}

}

}

}

// ==========================================
// BATTERY CHART
// ==========================================

);

const batteryChart = new Chart(

document.getElementById("batteryChart"),

{

type:"line",

data:{

labels:[

"10 AM",

"11 AM",

"12 PM",

"1 PM",

"2 PM",

"3 PM"

],

datasets:[{

label:"Battery",

data:[

100,

98,

95,

93,

90,

88

],

fill:true,

borderColor:"#00E676",

backgroundColor:"rgba(0,230,118,.15)",

tension:.4

}]

},

options:{

responsive:true

}

}

// ==========================================
// FETCH BACKEND
// ==========================================

);

async function loadAnalytics(){

    try{

        const response = await fetch(

        "http://localhost:3000/analytics"

        );

        const data = await response.json();

        dashboard.weedsDetected =
            data.weedsDetected;

        dashboard.weedsRemoved =
            data.weedsRemoved;

        dashboard.distance =
            data.distance;

        dashboard.battery =
            data.battery;

        dashboard.runtime =
            data.runtime;

        dashboard.obstacles =
            data.obstacles;

        updateCards();

    }

    catch(error){

        console.log(

        "Using Local Sample Data"

        );

        updateCards();

    }

}

// ==========================================
// AUTO REFRESH
// ==========================================

setInterval(loadAnalytics,5000);

loadAnalytics();

// ==========================================
// CONSOLE
// ==========================================

console.log(

"Analytics Dashboard Loaded"

);