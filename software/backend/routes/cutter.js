const express = require("express");
const router = express.Router();

const cutterController = require("../controllers/cutterController");

router.post("/", cutterController.setCutter);

module.exports = router;