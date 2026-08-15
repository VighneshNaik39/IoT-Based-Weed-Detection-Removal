"""
train.py -- WeedGuard Phase 5 (Member 3)

Trains a YOLOv8 weed/crop detector via transfer learning from
COCO-pretrained weights, per the task doc's spec:
  80/10/10 split, ~100 epochs, batch size 16, Adam optimizer (lr 0.001).

Usage
-----
    python train.py
    python train.py --epochs 150 --batch 8 --weights yolov8s.pt

Requires dataset/annotations.yaml to point at an already-split
dataset (see prepare_dataset.py or label straight into the
images/{train,val,test} + labels/{train,val,test} layout).

After training, the best checkpoint is copied to
../models/yolov8_weed.pt so detect_stream.py has a stable path to
load regardless of which run produced it.
"""

import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA = SCRIPT_DIR / ".." / "dataset" / "annotations.yaml"
DEFAULT_MODELS_DIR = SCRIPT_DIR / ".." / "models"
DEFAULT_RUNS_DIR = DEFAULT_MODELS_DIR / "runs"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", default=str(DEFAULT_DATA),
                     help="Path to annotations.yaml")
    ap.add_argument("--weights", default="yolov8n.pt",
                     help="Starting checkpoint for transfer learning "
                          "(yolov8n.pt is smallest/fastest -- fine for a "
                          "laptop RTX 3050 and a 2-class problem; try "
                          "yolov8s.pt if accuracy needs more headroom)")
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--optimizer", default="Adam")
    ap.add_argument("--lr0", type=float, default=0.001,
                     help="Initial learning rate")
    ap.add_argument("--patience", type=int, default=20,
                     help="Early-stop if val metrics don't improve for "
                          "this many epochs")
    ap.add_argument("--device", default="",
                     help="'0' for first GPU, 'cpu' to force CPU, "
                          "'' lets ultralytics auto-pick (GPU if available)")
    ap.add_argument("--project", default=str(DEFAULT_RUNS_DIR))
    ap.add_argument("--name", default="yolov8_weed")
    ap.add_argument("--resume", action="store_true",
                     help="Resume the most recent interrupted run")
    args = ap.parse_args()

    data_path = Path(args.data).resolve()
    if not data_path.exists():
        raise SystemExit(
            f"Dataset config not found: {data_path}\n"
            f"Have you labeled + split the dataset yet? See "
            f"dataset/raw/README.md and scripts/prepare_dataset.py."
        )

    print(f"[train] data={data_path}")
    print(f"[train] weights={args.weights}  epochs={args.epochs}  "
          f"batch={args.batch}  imgsz={args.imgsz}  "
          f"optimizer={args.optimizer}  lr0={args.lr0}")

    model = YOLO(args.weights)

    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        optimizer=args.optimizer,
        lr0=args.lr0,
        patience=args.patience,
        device=args.device if args.device else None,
        project=args.project,
        name=args.name,
        resume=args.resume,
        verbose=True,
    )

    # Ultralytics writes best.pt under <project>/<name>/weights/best.pt.
    # Copy it somewhere stable so detect_stream.py doesn't need to know
    # which run number produced the current model.
    run_dir = Path(results.save_dir)
    best_weights = run_dir / "weights" / "best.pt"
    if best_weights.exists():
        target = (DEFAULT_MODELS_DIR / "yolov8_weed.pt").resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(best_weights, target)
        print(f"\n[train] best checkpoint copied to: {target}")
        print("[train] detect_stream.py's default --weights path will "
              "pick this up automatically.")
    else:
        print(f"\n[train] WARNING: expected {best_weights} but it wasn't "
              f"found -- check the run output above for errors.")

    # Quick reminder of what to check against the Phase 5 success
    # criteria (≥85% precision/recall on validation).
    print("\n[train] Validate against the success criteria with:")
    print(f"  yolo val model={DEFAULT_MODELS_DIR / 'yolov8_weed.pt'} data={data_path}")


if __name__ == "__main__":
    main()
