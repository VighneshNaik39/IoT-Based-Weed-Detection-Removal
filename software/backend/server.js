const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Store latest status
let latestData = {
    status: "No weed detected",
    time: null
};

// Store history logs
let logs = [];

// Test route
app.get("/", (req, res) => {
    res.send("IoT Weed Detection Backend Running 🚀");
});

// GET latest status (for frontend)
app.get("/api/status", (req, res) => {
    res.json(latestData);
});

// GET logs/history
app.get("/api/logs", (req, res) => {
    res.json(logs);
});

// POST update (from ESP32)
app.post("/api/update", (req, res) => {
    const { status } = req.body;

    // Validate input
    if (!status) {
        return res.status(400).json({
            error: "Status is required"
        });
    }

    const data = {
        status: status,
        time: new Date()
    };

    // Update latest data
    latestData = data;

    // Store in logs
    logs.push(data);

    console.log("Received data:", data);

    // IMPORTANT: send response (you missed this earlier)
    res.json({
        message: "Data updated successfully"
    });
});

// Start server
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});