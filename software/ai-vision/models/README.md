# models/

`yolov8_weed.pt` isn't included in this handoff — it can only be
produced by actually running `train.py` against a real, labeled
weed/crop dataset collected from your test field/tray, which hasn't
happened yet.

## To produce it

1. Collect images into `../dataset/raw/` (see that folder's README).
2. Label them (LabelImg or similar) into YOLO format.
3. Split into `../dataset/labeled/images|labels/{train,val,test}` —
   either export directly in that layout from your labeling tool, or
   run `../scripts/prepare_dataset.py` on a flat labeled folder.
4. Run `python ../scripts/train.py`.

`train.py` automatically copies the best checkpoint here as
`yolov8_weed.pt` when training finishes, so `detect_stream.py`'s
default `--weights` path picks it up with no extra steps.

## Until then

`detect_stream.py` will refuse to start if this file doesn't exist —
that's intentional, so it fails loudly instead of silently running
inference with random/untrained weights.
