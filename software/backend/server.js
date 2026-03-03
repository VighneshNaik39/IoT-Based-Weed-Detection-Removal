const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let weedStatus = "No weed detected";

app.get("/", (req, res) => {
    res.send("IoT Weed Detection Backend Running 🚀");
});

app.get("/api/status", (req, res) => {
    res.json({ message: weedStatus });
});

app.post("/api/update", (req, res) => {
    const { status } = req.body;
    weedStatus = status;
    res.json({ success: true });
});

app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});
