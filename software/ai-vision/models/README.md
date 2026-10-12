# YOLO model weights

The ZIP originally contained Git LFS pointer files in place of the actual `.pt` model weights. Those pointers have been removed because they cannot be loaded by Ultralytics.

## Create the weed model

1. Open a terminal in `software/ai-vision/scripts`.
2. Install dependencies: `python -m pip install -r requirements.txt`.
3. Ensure `../dataset/annotations.yaml` and the `../dataset/labeled/images/{train,val,test}` plus matching `labels` folders exist.
4. Train: `python train.py --weights yolov8n.pt --epochs 100 --batch 8 --imgsz 640`.

Ultralytics downloads the official base checkpoint `yolov8n.pt` if it is not present and internet is available. Training then writes the actual trained checkpoint to this folder as `yolov8_weed.pt`. Do not rename a generic COCO model to `yolov8_weed.pt`; it is not a weed-trained model.
