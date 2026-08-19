# Member 2 - Phase 5 Frontend

Files for the Phase 5 Camera Feed task.

Copy:
- pages/camera-feed.html -> software/frontend/pages/
- js/camera-feed.js -> software/frontend/js/
- css/camera-feed.css -> software/frontend/css/
- js/api.js -> software/frontend/js/ (replace existing; preserves existing functions and adds detection helpers)
- index.html -> software/frontend/ (replace existing; adds Camera Feed navigation)

Expected backend endpoints:
- GET /api/detection/status
- GET /api/detection/stream

The page expects the backend status response:
{
  "success": true,
  "detection": {
    "label": "weed",
    "confidence": 0.87,
    "timestamp": "2026-08-15T03:00:00.000Z",
    "frame_id": 123,
    "modelVersion": "YOLOv8"
  }
}

The live camera is loaded from /api/detection/stream, so no hard-coded camera IP is required in the frontend.
