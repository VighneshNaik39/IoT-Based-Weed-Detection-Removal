// ============================================================
// Thin aliases matching the literal API Contract in the
// Phase 4 Execution Guide (POST /api/forward, /api/backward,
// /api/left, /api/right, /api/cutter/on, /api/cutter/off).
//
// These forward to the same controllers used by /api/move and
// /api/cutter so behaviour (and ESP32 wiring) stays identical —
// this file exists purely so the documented contract has a real
// matching endpoint, in addition to the generic ones the
// dashboard actually uses.
// (POST /api/stop already exists natively at that exact path.)
// ============================================================
const express = require("express");
const router = express.Router();

const robotController  = require("../controllers/robotController");
const cutterController = require("../controllers/cutterController");

function withCommand(command) {
  return (req, res, next) => {
    req.body = { ...req.body, command };
    next();
  };
}

function withCutterState(state) {
  return (req, res, next) => {
    req.body = { ...req.body, state };
    next();
  };
}

router.post("/forward",  withCommand("forward"),  robotController.move);
router.post("/backward", withCommand("backward"), robotController.move);
router.post("/left",     withCommand("left"),     robotController.move);
router.post("/right",    withCommand("right"),    robotController.move);

router.post("/cutter/on",  withCutterState(true),  cutterController.setCutter);
router.post("/cutter/off", withCutterState(false), cutterController.setCutter);

module.exports = router;
