const fs = require("fs");
const path = require("path");

const fieldFilePath = path.join(__dirname, "..", "data", "field.json");

// A field is only "configured" once we have both calibration points AND
// real-world dimensions. Everything starts null so the frontend knows to
// show the setup flow instead of guessing at a layout.
const DEFAULT_FIELD = {
  configured: false,
  widthM: null,   // real-world length of the walked origin -> edge side
  lengthM: null,  // real-world length of the perpendicular side
  mirrored: false, // flips which side of the origin->edge line the field extends into
  origin: { lat: null, lng: null }, // one corner of the field
  edge: { lat: null, lng: null }    // adjacent corner, along the "width" side
};

if (!fs.existsSync(fieldFilePath)) {
  fs.writeFileSync(fieldFilePath, JSON.stringify(DEFAULT_FIELD, null, 2));
}

function readField() {
  try {
    const saved = JSON.parse(fs.readFileSync(fieldFilePath, "utf8"));
    return { ...DEFAULT_FIELD, ...saved };
  } catch (err) {
    console.error("❌ Error reading field config:", err.message);
    return { ...DEFAULT_FIELD };
  }
}

function isConfigured(cfg) {
  return !!(
    cfg.widthM > 0 &&
    cfg.lengthM > 0 &&
    cfg.origin && cfg.origin.lat != null && cfg.origin.lng != null &&
    cfg.edge && cfg.edge.lat != null && cfg.edge.lng != null
  );
}

function writeField(partial) {
  const current = readField();

  const merged = {
    ...current,
    ...partial,
    origin: { ...current.origin, ...(partial.origin || {}) },
    edge: { ...current.edge, ...(partial.edge || {}) }
  };

  merged.configured = isConfigured(merged);

  fs.writeFileSync(fieldFilePath, JSON.stringify(merged, null, 2));
  return merged;
}

function resetField() {
  fs.writeFileSync(fieldFilePath, JSON.stringify(DEFAULT_FIELD, null, 2));
  return { ...DEFAULT_FIELD };
}

module.exports = { readField, writeField, resetField, DEFAULT_FIELD };
