"""
detect_stream.py -- WeedGuard Phase 5 (Member 3)

Reads the MJPEG stream served by the AI-Thinker ESP32-CAM, runs YOLOv8
inference at roughly 1 FPS, and calls the backend's
POST /api/detection/weed when a weed is confirmed above the confidence
threshold.

The laptop performs the heavy YOLO inference. The ESP32 boards remain
lightweight.

Flow:
    AI-Thinker ESP32-CAM
        -> MJPEG /stream
        -> this Python script
        -> YOLOv8
        -> backend /api/detection/weed
        -> robot control backend
"""

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import requests
from ultralytics import YOLO


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_WEIGHTS = SCRIPT_DIR / ".." / "models" / "yolov8_weed.pt"

WEED_CLASS_NAME = "weed"


def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


class MJPEGStream:
    """Incrementally decode JPEG frames from an HTTP MJPEG response."""

    def __init__(self, response):
        self.response = response
        self.buffer = bytearray()
        # Keep one iterator for the lifetime of the response. Recreating it
        # for each read can cause unreliable reads with some HTTP streams.
        self.chunks = response.iter_content(chunk_size=1024, decode_unicode=False)
        self.closed = False

    def read(self):
        if self.closed:
            return False, None

        try:
            while True:
                # Locate a complete JPEG frame (SOI ... EOI).
                start = self.buffer.find(b"\xff\xd8")
                if start >= 0:
                    end = self.buffer.find(b"\xff\xd9", start + 2)
                    if end >= 0:
                        jpg = bytes(self.buffer[start:end + 2])
                        del self.buffer[:end + 2]
                        frame = cv2.imdecode(
                            np.frombuffer(jpg, dtype=np.uint8),
                            cv2.IMREAD_COLOR,
                        )
                        if frame is not None:
                            return True, frame
                        # Ignore malformed JPEG data and continue searching.
                        continue

                    # Discard multipart headers/garbage before the JPEG start.
                    if start > 0:
                        del self.buffer[:start]
                elif len(self.buffer) > 65536:
                    # Keep a bounded tail if no JPEG start marker was found.
                    del self.buffer[:-65536]

                chunk = next(self.chunks, None)
                if chunk is None:
                    log("Camera MJPEG stream ended")
                    self.release()
                    return False, None
                if chunk:
                    self.buffer.extend(chunk)

                if len(self.buffer) > 4 * 1024 * 1024:
                    log("MJPEG buffer exceeded 4 MB; resetting buffer")
                    self.buffer.clear()

        except requests.RequestException as exc:
            log(f"Camera stream request failed: {exc}")
            self.release()
            return False, None
        except Exception as exc:
            log(f"MJPEG frame reader error: {exc}")
            self.release()
            return False, None

    def release(self):
        if self.closed:
            return
        self.closed = True
        try:
            self.response.close()
        except Exception:
            pass


class Detector:
    def __init__(self, args):
        self.args = args

        log(f"Loading YOLO model: {args.weights}")
        self.model = YOLO(args.weights)

        self.last_trigger_ts = 0.0
        self.frame_id = 0

        self.session = requests.Session()

    # ------------------------------------------------------------
    # STREAM HANDLING
    # ------------------------------------------------------------

    def open_capture(self):
        headers = {}

        if self.args.cam_key:
            headers["X-API-Key"] = self.args.cam_key

        log(f"Connecting to camera: {self.args.cam_url}")

        try:
            response = requests.get(
                self.args.cam_url,
                headers=headers,
                stream=True,
                timeout=(self.args.timeout, self.args.timeout),
            )

            response.raise_for_status()

        except requests.RequestException as exc:
            raise RuntimeError(
                f"Could not open camera stream: "
                f"{self.args.cam_url}\n"
                f"Reason: {exc}"
            ) from exc

        content_type = response.headers.get("Content-Type", "")

        log(f"Camera connected")
        log(f"Content-Type: {content_type}")

        if (
            "multipart" not in content_type.lower()
            and "mjpeg" not in content_type.lower()
        ):
            log(
                f"WARNING: camera Content-Type is "
                f"{content_type!r}; continuing anyway"
            )

        return MJPEGStream(response)

    # ------------------------------------------------------------
    # MAIN LOOP
    # ------------------------------------------------------------

    def run(self):
        min_frame_interval = (
            1.0 / self.args.fps
            if self.args.fps > 0
            else 0
        )

        cap = None

        log("Starting detector...")

        try:
            cap = self.open_capture()

            log(f"Reading stream: {self.args.cam_url}")
            log(f"Model: {self.args.weights}")
            log(f"Confidence threshold: {self.args.conf}")
            log(f"Target FPS: {self.args.fps}")
            log(f"Cooldown: {self.args.cooldown}s")
            log(
                f"Backend: "
                f"{self.args.backend_url}"
            )

            last_infer_ts = 0.0
            consecutive_read_failures = 0

            while True:
                ok, frame = cap.read()

                if not ok or frame is None:
                    consecutive_read_failures += 1

                    log(
                        f"stream read failed "
                        f"({consecutive_read_failures}/10)"
                    )

                    if consecutive_read_failures >= 10:
                        log(
                            "Too many failed reads. "
                            "Reconnecting to camera..."
                        )

                        cap.release()

                        time.sleep(2)

                        try:
                            cap = self.open_capture()
                            consecutive_read_failures = 0

                        except RuntimeError as exc:
                            log(str(exc))
                            time.sleep(3)
                            continue

                    time.sleep(0.2)
                    continue

                consecutive_read_failures = 0

                now = time.time()

                if (
                    now - last_infer_ts
                    < min_frame_interval
                ):
                    continue

                last_infer_ts = now

                self.frame_id += 1

                self.process_frame(frame)

        except KeyboardInterrupt:
            log("Stopped by user.")

        finally:
            if cap is not None:
                cap.release()

    # ------------------------------------------------------------
    # YOLO INFERENCE
    # ------------------------------------------------------------

    def report_scan(self):
        """Increment the dashboard scan counter without blocking detection."""
        try:
            self.session.post(
                f"{self.args.backend_url}/api/detection/scan",
                json={"frame_id": self.frame_id, "timestamp": datetime.now(timezone.utc).isoformat()},
                timeout=0.5,
            )
        except requests.RequestException:
            # Scan reporting is best-effort; it must never stop the detector.
            pass

    def process_frame(self, frame):
        self.report_scan()
        try:
            results = self.model.predict(
                source=frame,
                conf=self.args.conf,
                verbose=False,
            )

        except Exception as exc:
            log(f"YOLO inference error: {exc}")
            return

        if not results:
            return

        result = results[0]

        best_weed_conf = 0.0

        names = result.names

        for box in result.boxes:
            cls_id = int(box.cls[0])

            cls_name = names.get(
                cls_id,
                str(cls_id),
            )

            confidence = float(
                box.conf[0]
            )

            if (
                cls_name == WEED_CLASS_NAME
                and confidence > best_weed_conf
            ):
                best_weed_conf = confidence

        if best_weed_conf <= 0.0:
            log(
                f"frame {self.frame_id}: "
                "no weed detected"
            )
            return

        log(
            f"frame {self.frame_id}: "
            f"WEED DETECTED "
            f"confidence={best_weed_conf:.2f}"
        )

        self.maybe_trigger(
            best_weed_conf
        )

    # ------------------------------------------------------------
    # DETECTION TRIGGER
    # ------------------------------------------------------------

    def maybe_trigger(
        self,
        confidence: float,
    ):
        now = time.time()

        # Client-side cooldown
        if (
            now - self.last_trigger_ts
            < self.args.cooldown
        ):
            remaining = (
                self.args.cooldown
                - (
                    now
                    - self.last_trigger_ts
                )
            )

            log(
                f"  in cooldown, "
                f"{remaining:.1f}s remaining"
            )

            return

        # Safety check
        if (
            self.args.safety_check
            and not self.robot_is_safe_to_trigger()
        ):
            log(
                "  safety check failed "
                "or robot is mid-maneuver. "
                "Skipping trigger."
            )

            return

        self.last_trigger_ts = now

        self.send_detection(
            confidence
        )

    # ------------------------------------------------------------
    # ROBOT SAFETY CHECK
    # ------------------------------------------------------------

    def robot_is_safe_to_trigger(self) -> bool:
        """
        Ask the backend for robot status before sending
        a weed detection event.

        Any network/API failure is treated as unsafe.
        """

        try:
            url = (
                f"{self.args.backend_url}"
                f"/api/robot/status"
            )

            resp = self.session.get(
                url,
                timeout=self.args.timeout,
            )

            resp.raise_for_status()

            data = resp.json()

            payload = data.get(
                "data",
                data,
            )

            obstacle = (
                payload.get("obstacle")
                or payload.get("avoiding")
            )

            mode = payload.get(
                "mode"
            )

            log(
                f"  robot status: "
                f"mode={mode}, "
                f"obstacle={bool(obstacle)}"
            )

            return not bool(obstacle)

        except Exception as exc:
            log(
                f"  safety check request failed: "
                f"{exc}"
            )

            return False

    # ------------------------------------------------------------
    # SEND DETECTION TO BACKEND
    # ------------------------------------------------------------

    def send_detection(
        self,
        confidence: float,
    ):
        payload = {
            "confidence": round(
                confidence,
                4,
            ),
            "timestamp": (
                datetime.now(
                    timezone.utc
                ).isoformat()
            ),
            "frame_id": self.frame_id,
            "label": WEED_CLASS_NAME,
        }

        url = (
            f"{self.args.backend_url}"
            f"/api/detection/weed"
        )

        log(
            f"  sending detection to: "
            f"{url}"
        )

        for attempt in range(
            1,
            self.args.retries + 1,
        ):
            try:
                resp = self.session.post(
                    url,
                    json=payload,
                    timeout=self.args.timeout,
                )

                if resp.status_code < 300:
                    log(
                        f"  -> POST OK "
                        f"({resp.status_code})"
                    )

                    return

                log(
                    f"  -> POST returned "
                    f"{resp.status_code}: "
                    f"{resp.text[:200]}"
                )

            except requests.RequestException as exc:
                log(
                    f"  -> POST failed "
                    f"(attempt "
                    f"{attempt}/"
                    f"{self.args.retries}): "
                    f"{exc}"
                )

            time.sleep(
                0.5 * attempt
            )

        log(
            "  -> giving up on this "
            "detection event after retries"
        )

    # ------------------------------------------------------------
    # ARGUMENTS
    # ------------------------------------------------------------


def parse_args():
    ap = argparse.ArgumentParser(
        description=__doc__
    )

    ap.add_argument(
        "--cam-url",
        default=os.getenv("CAMERA_STREAM_URL", "http://localhost:5000/api/detection/stream"),
        help="Camera MJPEG URL. Defaults to the backend camera proxy; override with --cam-url if needed.",
    )

    ap.add_argument(
        "--cam-key",
        default="",
        help=(
            "X-API-Key for the camera "
            "stream, if enabled."
        ),
    )

    ap.add_argument(
        "--backend-url",
        default=os.getenv("BACKEND_URL", "http://localhost:5000").rstrip("/"),
        help="Node backend base URL.",
    )

    ap.add_argument(
        "--weights",
        default=str(DEFAULT_WEIGHTS),
        help=(
            "Path to trained YOLOv8 "
            "weights (.pt)."
        ),
    )

    ap.add_argument(
        "--conf",
        type=float,
        default=0.5,
        help=(
            "Confidence threshold for "
            "positive weed detection."
        ),
    )

    ap.add_argument(
        "--fps",
        type=float,
        default=1.0,
        help=(
            "Target inference rate "
            "(frames/sec)."
        ),
    )

    ap.add_argument(
        "--cooldown",
        type=float,
        default=4.0,
        help=(
            "Minimum seconds between "
            "backend detection triggers."
        ),
    )

    ap.add_argument(
        "--safety-check",
        action="store_true",
        default=False,
        help=(
            "Optionally require a safe robot status before posting a detection. "
            "The backend independently gates physical cutter activation."
        ),
    )

    ap.add_argument(
        "--no-safety-check",
        dest="safety_check",
        action="store_false",
        help=(
            "Do not require robot status before logging detections (default)."
        ),
    )

    ap.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help=(
            "HTTP connection/read timeout "
            "in seconds."
        ),
    )

    ap.add_argument(
        "--retries",
        type=int,
        default=3,
        help=(
            "POST retry attempts."
        ),
    )

    return ap.parse_args()


def main():
    args = parse_args()

    weights_path = Path(
        args.weights
    ).resolve()

    if not weights_path.exists():
        log(
            f"ERROR: trained weights file not found: {weights_path}\n"
            "Train a model first: cd software/ai-vision/scripts; "
            "python train.py --weights yolov8n.pt. "
            "The base YOLO checkpoint is downloaded by Ultralytics when internet is available."
        )
        sys.exit(1)

    args.weights = str(
        weights_path
    )

    detector = Detector(args)

    detector.run()


if __name__ == "__main__":
    main()