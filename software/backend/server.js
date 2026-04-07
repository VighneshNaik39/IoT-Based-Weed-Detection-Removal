const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Store latest data
let latestData = {
    status: "No weed detected",
    moisture: null,
    time: null
};

// Store logs
let logs = [];

// Test route
app.get("/", (req, res) => {
    res.send("IoT Weed Detection Backend Running 🚀");
});

// GET latest status
app.get("/api/status", (req, res) => {
    res.json(latestData);
});

// GET logs
app.get("/api/logs", (req, res) => {
    res.json(logs);
});

// 🔥 POST (ESP32 → Backend)
app.post("/api/update", (req, res) => {
    const { weed, moisture } = req.body;

    // Validation
    if (typeof weed !== "boolean") {
        return res.status(400).json({
            error: "Invalid or missing 'weed' value (true/false required)"
        });
    }

    const data = {
        status: weed ? "Weed detected" : "No weed",
        moisture: moisture ?? null,
        time: new Date()
    };

    // Update latest
    latestData = data;

    // Store logs (limit to last 100 entries)
    logs.push(data);
    if (logs.length > 100) {
        logs.shift();
    }

    console.log("DATA RECEIVED:", data);

    res.json({
        message: "Data updated successfully"
    });
});

// 🔥 IMPORTANT: allow ESP32 access
app.listen(5000, "0.0.0.0", () => {
    console.log("Server running on http://localhost:5000");
});