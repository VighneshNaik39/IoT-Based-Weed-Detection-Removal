# API Documentation — IoT Weed Detection & Removal (Phase 4)

Base URL (local): `http://localhost:5000`
All bodies are JSON. All responses are JSON unless noted.

The backend sits between the **dashboard (frontend)** and the **ESP32 robot**.
Two groups of endpoints exist:

- **Dashboard-facing** — used by the web UI to read status/logs and to send commands.
- **ESP32-facing (proxy)** — the backend forwards these to the robot's own tiny HTTP
  server (see `software/backend/config/esp32.js`, `services/esp32Service.js`) and
  relays the robot's response back.
- **ESP32 → backend (ingest)** — the one endpoint the robot itself calls, to push
  sensor readings *up* to the backend (`POST /api/update`).

---

## Health / Misc

### `GET /api/data`
Simple liveness check.

**Response `200`**
```json
{ "message": "Hello ESP32 👋", "status": "Server running" }
```

---

## Weed Detection Status & Logs

### `GET /api/status`
Current weed-detection state, derived from the most recent log entry, plus
running session counters. Used by the main dashboard KPIs.

**Response `200`**
```json
{
  "status": "Weed detected" | "No weed detected",
  "moisture": 42,
  "time": "2026-07-19T10:15:00.000Z",
  "scansToday": 118,
  "weedsDetected": 12,
  "weedsRemoved": 8,
  "battery": 80,
  "esp32Connected": true
}
```
`esp32Connected` is `true` only if the ESP32 posted to `/api/update` within the
last 15 seconds (`ESP32_TIMEOUT_MS`).

### `POST /api/update`  *(called by the ESP32, not the dashboard)*
Ingests one sensor reading. Updates live state, appends to the log (capped at
100 entries), and updates the current session's counters.

**Request body**
```json
{ "weed": true, "moisture": 42 }
```
- `weed` (boolean, required)
- `moisture` (number, optional)

**Response `200`**
```json
{ "success": true }
```
**Response `400`** if `weed` is missing or not a boolean:
```json
{ "error": "Invalid or missing 'weed' value" }
```

### `GET /api/logs`
Returns the full stored log array (newest first, max 100 entries), each entry
shaped like the `status`/`moisture`/`time` fields above.

**Response `200`**
```json
[
  { "status": "Weed detected", "moisture": 40, "time": "2026-07-19T10:15:00.000Z" },
  { "status": "No weed detected", "moisture": 38, "time": "2026-07-19T10:14:57.000Z" }
]
```

### `GET /api/sessions`
Returns the 5 most recent "sessions" (a session = a run of the robot, grouped
by activity), newest first. The most recent session may still be in progress
(`completed: false`) and reflects live in-memory counters.

**Response `200`**
```json
[
  {
    "sessionNumber": 7,
    "startTime": "2026-07-19T09:00:00.000Z",
    "endTime": null,
    "durationMs": 340000,
    "totalDetections": 4,
    "executions": 55,
    "avgMoisture": 41,
    "completed": false
  }
]
```

---

## Robot Movement & Cutter (proxied to ESP32)

These all forward to the ESP32's own HTTP server at `ESP32_IP` (set in
`software/backend/.env`) and return whatever the ESP32 responds with, wrapped
in `{ success, data }`. If the ESP32 is unreachable, they respond `5xx` with
`{ success: false, message: <error> }`.

### `POST /api/move`
**Request body**
```json
{ "command": "forward" | "backward" | "left" | "right" }
```

### `POST /api/stop`
No body required. Halts the robot.

### `POST /api/mode`  (also mounted at `POST /api/robot/mode`)
**Request body**
```json
{ "mode": "manual" | "autonomous" }
```
**Response `400`** if `mode` is missing or not one of the two allowed values.

### `POST /api/cutter`
**Request body**
```json
{ "state": true | false }
```

### `GET /api/robot/status`
Proxies the ESP32's own `/status` endpoint (live mode, current command,
distance reading, obstacle flag, cutter state, connectivity) — distinct from
`GET /api/status` above, which is the *weed-detection* status derived from
logs, not the robot's motion/hardware status.

---

## Literal API Contract Aliases

These exist purely so the documented contract in the Phase 4 Execution Guide
has a matching, literally-named endpoint. They forward to the exact same
controllers as the generic endpoints above (the dashboard itself uses the
generic ones; these are equivalent alternates).

| Endpoint | Equivalent to |
|---|---|
| `POST /api/forward` | `POST /api/move` with `{ "command": "forward" }` |
| `POST /api/backward` | `POST /api/move` with `{ "command": "backward" }` |
| `POST /api/left` | `POST /api/move` with `{ "command": "left" }` |
| `POST /api/right` | `POST /api/move` with `{ "command": "right" }` |
| `POST /api/cutter/on` | `POST /api/cutter` with `{ "state": true }` |
| `POST /api/cutter/off` | `POST /api/cutter` with `{ "state": false }` |

`POST /api/stop` already lives at that exact path natively — no alias needed.

---

## Settings

### `GET /api/settings`
Returns the current saved settings (falls back to defaults for anything not
yet set).

**Response `200`**
```json
{
  "success": true,
  "data": {
    "autoDetect": true,
    "alerts": true,
    "autoRemove": false,
    "robotSpeed": 200,
    "obstacleThresholdCm": 25,
    "wifiSSID": "meowww"
  }
}
```

### `POST /api/settings`
Merges the given fields into the saved settings (partial updates allowed) and
persists to `software/backend/data/settings.json`.

**Request body** (any subset of the fields above)
```json
{ "robotSpeed": 180, "obstacleThresholdCm": 30 }
```

**Response `200`**
```json
{ "success": true, "data": { "...": "full merged settings object" } }
```

**Note:** these values are stored on the backend and shown in the dashboard,
but changing `robotSpeed`, `obstacleThresholdCm`, or `wifiSSID` here does
**not** reflash the ESP32 — the firmware currently reads its own hardcoded
constants (`MOTOR_SPEED`, `OBSTACLE_CM`, `ssid`) at compile time. Syncing
these live is a Phase 5+ item (would require the ESP32 to poll `/api/settings`
or the backend to push values to it on change).

---

## Legacy / Unused

### `POST /api/control`
Overwrites an in-memory `control` object (`{ autoMode, removal }`). Not
currently read by any other endpoint or by the dashboard — kept for backward
compatibility, safe to remove once confirmed unused.

### Dead route file
`software/backend/routes/status.js` + `controllers/statusController.js`'s
`getStatus` are not mounted anywhere in `server.js` under a bare `/api/status`
path (only `/api/robot/status`, via `routes/robot.js`, is active). The file is
currently unused — either remove it or intentionally mount it if a plain
`/api/status` proxy to the ESP32 is still wanted alongside the log-derived one.
