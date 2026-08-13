# dataset/raw/

Drop unlabeled images collected from the T-SIMCAM (or a phone camera,
if that's faster for initial collection) straight into this folder.
Flat structure is fine -- no subfolders needed here.

## Collection tips

- Shoot at roughly the same height/angle the robot's camera will
  actually see in the field -- top-down or slight angle, not eye-level.
- Capture a mix of: weeds alone, crop alone, weeds + crop together,
  and a few "hard" frames (partial occlusion, shadows, motion blur)
  so the model doesn't only learn clean, ideal shots.
- Vary lighting (morning/midday/overcast) if you can -- outdoor light
  changes a lot and the model needs to generalize across it.
- Aim for a few hundred images minimum before training a first
  checkpoint; more (1000+) will meaningfully help precision/recall
  toward the ≥85% target in the Phase 5 task doc.
- Use `.jpg` (or `.png`, but `.jpg` keeps file sizes down).

## Next step

Once you've got a batch collected here, label them (LabelImg or
similar, YOLO-format `.txt` output) and move the labeled image +
`.txt` pairs into `dataset/labeled/` following the `images/` +
`labels/` split structure described in `dataset/annotations.yaml`.
`scripts/prepare_dataset.py` can do the 80/10/10 split for you once
everything is labeled.
