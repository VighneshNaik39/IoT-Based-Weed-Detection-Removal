const fieldService = require("../services/fieldService");

// GET /api/field
exports.getField = (req, res) => {
  res.json({ success: true, data: fieldService.readField() });
};

// POST /api/field
// Accepts a partial update, e.g.:
//   { widthM: 12, lengthM: 8 }
//   { origin: { lat: 12.34, lng: 56.78 } }
//   { edge: { lat: 12.35, lng: 56.79 } }
//   { mirrored: true }
exports.updateField = (req, res) => {
  try {
    const updated = fieldService.writeField(req.body || {});
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to save field config" });
  }
};

// POST /api/field/reset
exports.resetField = (req, res) => {
  try {
    const cleared = fieldService.resetField();
    res.json({ success: true, data: cleared });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to reset field config" });
  }
};
