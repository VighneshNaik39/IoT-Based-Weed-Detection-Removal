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

// Generate a simple lawn-mower (serpentine) GPS path from the
// calibrated field orientation. The ESP32 follows these points.
// Row spacing is deliberately conservative for the current robot
// and can be adjusted here without changing the ESP32 firmware.
function generateAutonomousWaypoints(cfg, rowSpacingM = 1.0) {
  if (!isConfigured(cfg)) {
    throw new Error("Field is not fully configured");
  }

  const toLocalMeters = (lat, lng, lat0, lng0) => {
    const metersPerDegLat = 110574;
    const metersPerDegLng =
      111320 * Math.cos((lat0 * Math.PI) / 180);

    return {
      x: (lng - lng0) * metersPerDegLng,
      y: (lat - lat0) * metersPerDegLat
    };
  };

  const origin = cfg.origin;
  const edge = cfg.edge;
  const edgeVec = toLocalMeters(
    edge.lat, edge.lng, origin.lat, origin.lng
  );

  const edgeLen = Math.hypot(edgeVec.x, edgeVec.y);
  if (edgeLen < 0.5) {
    throw new Error("Origin and edge are too close to define field direction");
  }

  const u = {
    x: edgeVec.x / edgeLen,
    y: edgeVec.y / edgeLen
  };

  const sign = cfg.mirrored ? -1 : 1;
  const v = {
    x: sign * -u.y,
    y: sign * u.x
  };

  const pointFromLocal = (alongWidth, alongLength) => {
    const east = u.x * alongWidth + v.x * alongLength;
    const north = u.y * alongWidth + v.y * alongLength;

    const metersPerDegLat = 110574;
    const metersPerDegLng =
      111320 * Math.cos((origin.lat * Math.PI) / 180);

    return {
      lat: origin.lat + north / metersPerDegLat,
      lng: origin.lng + east / metersPerDegLng
    };
  };

  // Keep the plan within the ESP32's 64-waypoint limit while
  // preserving at least 1 m row spacing.
  const spacing = Math.max(1.0, Number(rowSpacingM) || 1.0, cfg.lengthM / 30);
  const waypoints = [];

  // Start at the calibrated origin. The operator should place the
  // robot at this point and face toward the origin -> edge direction.
  waypoints.push({ lat: origin.lat, lng: origin.lng });

  // First pass follows the calibrated width edge.
  waypoints.push({ lat: edge.lat, lng: edge.lng });

  let y = spacing;
  let leftToRight = false;

  while (y < cfg.lengthM && waypoints.length < 64) {
    const a = pointFromLocal(0, y);
    const b = pointFromLocal(cfg.widthM, y);

    if (leftToRight) {
      waypoints.push(b);
      waypoints.push(a);
    } else {
      waypoints.push(a);
      waypoints.push(b);
    }

    leftToRight = !leftToRight;
    y += spacing;
  }

  // Finish at the far side of the field if it is not already there.
  const finalA = pointFromLocal(0, cfg.lengthM);
  const finalB = pointFromLocal(cfg.widthM, cfg.lengthM);
  const finalPoint = leftToRight ? finalA : finalB;
  waypoints.push(finalPoint);

  return waypoints.slice(0, 64);
}

module.exports = { readField, writeField, resetField, DEFAULT_FIELD, generateAutonomousWaypoints };