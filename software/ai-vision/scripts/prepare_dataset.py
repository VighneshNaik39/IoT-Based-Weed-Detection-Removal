"""
prepare_dataset.py -- WeedGuard Phase 5 (Member 3)

Bonus utility, not one of the three files explicitly assigned in the
task doc, but directly supports the "80/10/10 split" step called out
under train.py -- included so you don't have to hand-shuffle files.

Takes a flat folder of labeled images + YOLO-format .txt label files
(same basename, e.g. img001.jpg + img001.txt) and splits them into
the images/{train,val,test} + labels/{train,val,test} layout that
annotations.yaml expects.

Usage
-----
    # Point --src at wherever your labeled pairs currently live, e.g.
    # a flat folder you exported from LabelImg.
    python prepare_dataset.py --src ../dataset/labeled_flat \
                               --dst ../dataset/labeled \
                               --train 0.8 --val 0.1 --test 0.1

If your labeling tool already exports directly into the
images/train, images/val, ... structure, you don't need this script
at all -- just point train.py at annotations.yaml.
"""

import argparse
import random
import shutil
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def find_pairs(src: Path):
    """Return list of (image_path, label_path) where both exist."""
    pairs = []
    for img_path in sorted(src.iterdir()):
        if img_path.suffix.lower() not in IMAGE_EXTS:
            continue
        label_path = img_path.with_suffix(".txt")
        if not label_path.exists():
            print(f"[skip] no label file for {img_path.name}")
            continue
        pairs.append((img_path, label_path))
    return pairs


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", required=True, help="Folder of labeled image+txt pairs (flat)")
    ap.add_argument("--dst", required=True, help="Dataset root to write images/ + labels/ into")
    ap.add_argument("--train", type=float, default=0.8)
    ap.add_argument("--val", type=float, default=0.1)
    ap.add_argument("--test", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--copy", action="store_true",
                     help="Copy files instead of moving them (default: move)")
    args = ap.parse_args()

    ratios_sum = args.train + args.val + args.test
    if abs(ratios_sum - 1.0) > 1e-6:
        raise SystemExit(f"--train/--val/--test must sum to 1.0 (got {ratios_sum})")

    src = Path(args.src)
    dst = Path(args.dst)
    pairs = find_pairs(src)
    if not pairs:
        raise SystemExit(f"No labeled image+txt pairs found in {src}")

    random.seed(args.seed)
    random.shuffle(pairs)

    n = len(pairs)
    n_train = int(n * args.train)
    n_val = int(n * args.val)
    splits = {
        "train": pairs[:n_train],
        "val": pairs[n_train:n_train + n_val],
        "test": pairs[n_train + n_val:],
    }

    transfer = shutil.copy2 if args.copy else shutil.move

    for split_name, split_pairs in splits.items():
        img_dir = dst / "images" / split_name
        lbl_dir = dst / "labels" / split_name
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)
        for img_path, label_path in split_pairs:
            transfer(str(img_path), str(img_dir / img_path.name))
            transfer(str(label_path), str(lbl_dir / label_path.name))
        print(f"[{split_name}] {len(split_pairs)} images -> {img_dir}")

    print(f"\nDone. {n} labeled pairs split "
          f"{args.train:.0%}/{args.val:.0%}/{args.test:.0%} "
          f"(train={n_train}, val={n_val}, test={n - n_train - n_val}).")
    print(f"Point train.py at: {dst.parent / 'annotations.yaml'}")


if __name__ == "__main__":
    main()
