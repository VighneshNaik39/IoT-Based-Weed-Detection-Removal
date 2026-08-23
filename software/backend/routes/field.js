const express = require("express");
const router = express.Router();

const fieldController = require("../controllers/fieldController");

router.get("/", fieldController.getField);
router.post("/", fieldController.updateField);
router.post("/reset", fieldController.resetField);

module.exports = router;
