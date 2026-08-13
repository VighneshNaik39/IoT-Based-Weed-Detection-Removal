"""
detect_stream.py -- WeedGuard Phase 5 (Member 3)

Reads the MJPEG stream served by sketch_phase5_vision.ino (the
T-SIMCAM), runs YOLOv8 inference at roughly 1 FPS, and calls the
backend's POST /api/detection/weed when a weed is confirmed above the
confidence threshold. Runs on the laptop (HP Victus, RTX 3050) doing
the heavy inference work -- the ESP32 boards stay lightweight.

Payload contract (agreed with Member 1, per the task doc):
    { "confidence": 0.87, "timestamp": "<ISO8601>", "frame_id": 42,
      "label": "weed" }

Safety notes
------------
- COOLDOWN_SECONDS below is a CLIENT-SIDE debounce independent of
  whatever cooldown Member 1 implements on the backend -- belt and
  suspenders, so a backend restart or bug doesn't turn into a
  cutter that fires on every single frame.
- --safety-check (on by default) polls the backend's
  GET /api/robot/status before every trigger and SKIPS the trigger
  if the robot reports an active obstacle-avoidance maneuver. The
  idea: don't fire the cutter while the drive ESP32 is mid
  reverse/turn -- the blade shouldn't be commanded to engage while
  the robot's motion state is not settled. If the status check
  itself fails (network hiccup, backend down), the script also
  skips the trigger and logs a warning rather than firing blind.
- This script only ever calls the backend's detection endpoint, never
  the drive ESP32 directly -- the backend owns the actual cutter
  trigger logic (reusing the same internal function as /api/cutter,
  per Member 1's task).

Usage
-----
    python detect_stream.py \
        --cam-url http://10.15.101.233/stream \
        --backend-url http://localhost:5000 \
        --weights ../models/yolov8_weed.pt \
        --conf 0.5

Ctrl+C to stop.
"""

import argparse
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import requests
from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_WEIGHTS = SCRIPT_DIR / ".." / "models" / "yolov8_weed.pt"

WEED_CLASS_NAME = "weed"  # must match dataset/annotations.yaml names


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


class Detector:
    def __init__(self, args):
        self.args = args
        self.model = YOLO(args.weights)
        self.last_trigger_ts = 0.0
        self.frame_id = 0
        self.session = requests.Session()

    # ---------------- stream handling ----------------

    def open_capture(self) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(self.args.cam_url)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open camera stream: {self.args.cam_url}")
        return cap

    def run(self):
        min_frame_interval = 1.0 / self.args.fps if self.args.fps > 0 else 0
        cap = self.open_capture()
        log(f"Reading stream: {self.args.cam_url}")
        log(f"Model: {self.args.weights}  conf>={self.args.conf}  "
            f"target_fps={self.args.fps}  cooldown={self.args.cooldown}s")

        last_infer_ts = 0.0
        consecutive_read_failures = 0

        try:
            while True:
                ok, frame = cap.read()
                if not ok or frame is None:
                    consecutive_read_failures += 1
                    log(f"stream read failed ({consecutive_read_failures}/10)")
                    if consecutive_read_failures >= 10:
                        log("too many failed reads, reconnecting to stream...")
                        cap.release()
                        time.sleep(2)
                        cap = self.open_capture()
                        consecutive_read_failures = 0
                    time.sleep(0.5)
                    continue
                consecutive_read_failures = 0

                now = time.time()
                if now - last_infer_ts < min_frame_interval:
                    continue  # throttle to target FPS; camera stream itself runs faster
                last_infer_ts = now
                self.frame_id += 1

                self.process_frame(frame)

        except KeyboardInterrupt:
            log("stopped by user")
        finally:
            cap.release()

    # ---------------- inference + trigger ----------------

    def process_frame(self, frame):
        results = self.model.predict(
            source=frame,
            conf=self.args.conf,
            verbose=False,
        )
        if not results:
            return

        result = results[0]
        best_weed_conf = 0.0
        names = result.names  # class-id -> name, from the loaded model

        for box in result.boxes:
            cls_id = int(box.cls[0])
            cls_name = names.get(cls_id, str(cls_id))
            conf = float(box.conf[0])
            if cls_name == WEED_CLASS_NAME and conf > best_weed_conf:
                best_weed_conf = conf

        if best_weed_conf <= 0.0:
            return  # nothing weed-like above threshold in this frame

        log(f"frame {self.frame_id}: weed detected, confidence={best_weed_conf:.2f}")
        self.maybe_trigger(best_weed_conf)

    def maybe_trigger(self, confidence: float):
        now = time.time()
        if now - self.last_trigger_ts < self.args.cooldown:
            remaining = self.args.cooldown - (now - self.last_trigger_ts)
            log(f"  in cooldown, {remaining:.1f}s remaining -- not re-triggering")
            return

        if self.args.safety_check and not self.robot_is_safe_to_trigger():
            log("  safety check failed / robot mid-maneuver -- skipping trigger")
            return

        self.last_trigger_ts = now
        self.send_detection(confidence)

    def robot_is_safe_to_trigger(self) -> bool:
        """Poll the backend's robot status proxy before firing the
        cutter. Conservative: any failure or an active obstacle
        maneuver means we skip this trigger and wait for the next
        detection instead of forcing it through."""
        try:
            resp = self.session.get(
                f"{self.args.backend_url}/api/robot/status",
                timeout=self.args.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            # Shape depends on Member 1/the ESP32 proxy; obstacle/avoid
            # flags are checked defensively since the exact key name
            # may differ -- adjust once the real /api/robot/status
            # response shape is confirmed.
            payload = data.get("data", data)
            obstacle = payload.get("obstacle") or payload.get("avoiding")
            return not bool(obstacle)
        except Exception as exc:
            log(f"  safety check request failed: {exc}")
            return False

    def send_detection(self, confidence: float):
        payload = {
            "confidence": round(confidence, 4),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "frame_id": self.frame_id,
            "label": WEED_CLASS_NAME,
        }
        url = f"{self.args.backend_url}/api/detection/weed"

        for attempt in range(1, self.args.retries + 1):
            try:
                resp = self.session.post(url, json=payload, timeout=self.args.timeout)
                if resp.status_code < 300:
                    log(f"  -> POST {url} OK ({resp.status_code})")
                    return
                log(f"  -> POST {url} returned {resp.status_code}: {resp.text[:200]}")
            except requests.RequestException as exc:
                log(f"  -> POST {url} failed (attempt {attempt}/{self.args.retries}): {exc}")
            time.sleep(0.5 * attempt)
        log("  -> giving up on this detection event after retries")


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cam-url", required=True,
                     help="MJPEG stream URL served by sketch_phase5_vision.ino, "
                          "e.g. http://10.15.101.233/stream")
    ap.add_argument("--cam-key", default="",
                     help="X-API-Key for the camera stream, if CAM_KEY is set "
                          "in the firmware (blank = no auth)")
    ap.add_argument("--backend-url", default="http://localhost:5000",
                     help="Node backend base URL")
    ap.add_argument("--weights", default=str(DEFAULT_WEIGHTS),
                     help="Path to trained YOLOv8 weights (.pt)")
    ap.add_argument("--conf", type=float, default=0.5,
                     help="Confidence threshold for a positive weed detection")
    ap.add_argument("--fps", type=float, default=1.0,
                     help="Target inference rate (frames/sec) -- keeps CPU/GPU "
                          "load and backend traffic reasonable")
    ap.add_argument("--cooldown", type=float, default=4.0,
                     help="Minimum seconds between triggers sent to the backend "
                          "(client-side debounce, in addition to any backend-side "
                          "cooldown Member 1 implements)")
    ap.add_argument("--safety-check", action="store_true", default=True,
                     help="Check /api/robot/status before triggering (default on)")
    ap.add_argument("--no-safety-check", dest="safety_check", action="store_false")
    ap.add_argument("--timeout", type=float, default=3.0, help="HTTP timeout (seconds)")
    ap.add_argument("--retries", type=int, default=3, help="POST retry attempts")
    return ap.parse_args()


def main():
    args = parse_args()
    if not Path(args.weights).exists():
        log(f"WARNING: weights file not found at {args.weights} -- "
            f"train a model first with train.py, or pass --weights explicitly.")
        sys.exit(1)

    detector = Detector(args)
    detector.run()


if __name__ == "__main__":
    main()
