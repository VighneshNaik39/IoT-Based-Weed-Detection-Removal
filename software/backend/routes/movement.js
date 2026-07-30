const express = require("express");

const router = express.Router();

const movement = require("../controllers/robotController");

router.post("/", movement.move);

module.exports = router;