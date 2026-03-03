async function fetchData() {
    try {
        const response = await fetch("http://localhost:5000/api/status");
        const data = await response.json();
        document.getElementById("status").innerText = data.message;
    } catch (error) {
        document.getElementById("status").innerText = "Server not connected";
    }
}

fetchData();