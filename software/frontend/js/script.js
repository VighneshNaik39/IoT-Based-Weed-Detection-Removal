async function loadStatus() {
    try {
        const res = await fetch("http://localhost:5000/api/status");
        const data = await res.json();

        document.getElementById("status").innerText = data.status;
    } catch (error) {
        document.getElementById("status").innerText = "Server not connected";
    }
}

// load once
loadStatus();

// auto refresh every 3 sec
setInterval(loadStatus, 3000);