import cv2

# ==========================================
# ESP32-S3 OV5640 CAMERA
# ==========================================

ESP32_IP = "YOUR_ESP32_IP"

STREAM_URL = f"http://{ESP32_IP}/stream"

print("==========================================")
print(" ESP32-S3 OV5640 + OpenCV")
print("==========================================")
print("Stream:", STREAM_URL)
print("Connecting...")

cap = cv2.VideoCapture(STREAM_URL)

if not cap.isOpened():
    print()
    print("ERROR: Cannot connect to ESP32 camera")
    print()
    print("Check:")
    print("1. ESP32-S3 is powered")
    print("2. ESP32 is connected to Wi-Fi")
    print("3. PC and ESP32 are on the same Wi-Fi")
    print("4. ESP32 IP address is correct")
    print("5. Open /stream in a browser first")
    exit()

print("Camera connected successfully!")
print("Press Q to quit")

while True:

    ret, frame = cap.read()

    if not ret:
        print("Frame capture failed")
        continue

    # Display camera frame
    cv2.imshow("ESP32-S3 OV5640 - OpenCV", frame)

    # Q = exit
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()