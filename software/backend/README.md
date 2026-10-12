# Backend setup

Run from this folder: `npm install`, then copy `.env.example` to `.env`, edit network/API-key values, and run `npm start`. The server listens on `PORT` (default 5000).

The camera and robot are discovered by mDNS as `weedguard-cam.local` and `weedguard-robot.local`; use `CAMERA_STREAM_URL` / `ESP32_IP` fallbacks if multicast discovery is blocked. Automatic cutter activation is disabled unless `ENABLE_AUTOMATIC_CUTTING=true` is explicitly set.


For the included AI-Thinker ESP32-CAM sketch, the MJPEG stream runs on port 81. If mDNS is unavailable, set `CAMERA_STREAM_URL=http://<camera-ip>:81/stream` in `.env`; `/status` and `/capture` are served on port 80.
