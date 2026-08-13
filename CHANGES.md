# UI Update: Previous 5 Sessions

This update adds the "Previous 5 Sessions" card grid to the dashboard, matching the
target UI, and wires it up to real backend data (no hardcoded/fake numbers).

## What changed

### `software/backend/server.js`
- Added `groupIntoSessions(logs, gapMinutes)` — splits the flat detection log into
  "sessions" by detecting time gaps between consecutive entries. If more than
  5 minutes pass between two log entries, a new session is started. This requires
  no hardware/firmware changes since it's derived entirely from existing log data.
- Added `GET /api/sessions` — returns the 5 most recent sessions (newest first),
  each with: `sessionNumber`, `startTime`, `endTime`, `durationMs`,
  `totalDetections` (weed detections in that session), `executions` (total scans
  logged in that session), `avgMoisture`, and `completed` (false only for the most
  recent/still-active session).

### `software/frontend/index.html`
- Replaced the old "Overall Detection Statistics" sidebar panel with a new
  full-width "Previous 5 Sessions" section below the Activity Log, matching the
  target layout.
- Added `loadSessionsFromBackend()` which fetches `/api/sessions` every refresh
  cycle (every 3s, same as the rest of the dashboard) and renders the 5 session
  cards: Session number, date, Total Detections, Executions, % moisture, and a
  Completed / In Progress badge.

### `software/frontend/css/style.css`
- Added `.sessions-row`, `.sessions-grid`, `.session-card` and related styles,
  consistent with the existing design system (same color variables, radii,
  shadows as the rest of the dashboard).
- Adjusted `.bot-row` to 2 columns (Activity Log + Device Info) since the old
  "Overall Detection Statistics" panel was removed from that row.

## Bug fix: Simulate Weed / Simulate Clear buttons

The "Simulate Weed" and "Simulate Clear" buttons on the dashboard called
`simulateWeed()` / `simulateClear()`, but these functions were never defined
anywhere in the original project — clicking them threw
`Uncaught ReferenceError: simulateWeed is not defined` in the browser console
and did nothing.

Fixed in `software/frontend/index.html`: added both functions. They POST a
simulated reading to the existing `/api/update` endpoint (the same one the
real ESP32 uses) with the current moisture value, then trigger an immediate
UI refresh so the status panel, KPIs, and Activity Log update right away.

## Notes / things you may want to tune

- **Session gap threshold**: currently 5 minutes (`SESSION_GAP_MINUTES` in
  `server.js`). If your ESP32 posts less frequently, or you want sessions to
  split more/less aggressively, change that constant.
- **`node_modules` was excluded** from this zip to keep it small — run
  `npm install` inside `software/backend/` (and project root, if needed) before
  starting the server.
- Tested locally: `node software/backend/server.js`, confirmed `/api/sessions`
  returns correct grouped data against the existing `logs.json`, and the
  dashboard renders the 5 session cards as expected.
