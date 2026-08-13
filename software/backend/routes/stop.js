const express = require("express");

const router = express.Router();

const robot = require("../controllers/robotController");

router.post("/", robot.stop);

module.exports = router;