#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "meowww";
const char* password = "capital v";
const char* serverName = "http://192.168.99.135:5000/api/update";

// LED pin - GPIO2 is the built-in LED on most ESP32 boards
#define LED_PIN 2

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW); // Start with LED off

  WiFi.begin(ssid, password);
  Serial.print("Connecting");

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }

  Serial.println("\nConnected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

// 🔁 Blink function — blinks the LED 'times' number of times
void blinkLED(int times, int speed_ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(speed_ms);
    digitalWrite(LED_PIN, LOW);
    delay(speed_ms);
  }
}

void loop() {
  // ✅ Change this variable to control weed detection (replace with real sensor later)
  bool weedDetected = true;
  int moisture = 45;

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/json");

    String jsonData = "{\"weed\":" + String(weedDetected ? "true" : "false") + 
                      ",\"moisture\":" + String(moisture) + "}";

    int httpResponseCode = http.POST(jsonData);

    if (httpResponseCode > 0) {
      Serial.print("POST Response: ");
      Serial.println(httpResponseCode);
      Serial.println("Server says: " + http.getString());
    } else {
      Serial.print("Error sending POST: ");
      Serial.println(httpResponseCode);
    }

    http.end();

    // 💡 Blink LED if weed detected
    if (weedDetected) {
      Serial.println("⚠️ Weed detected! Blinking LED...");
      blinkLED(2, 200); // blink 5 times, 200ms speed
    } else {
      Serial.println("✅ No weed. LED off.");
      digitalWrite(LED_PIN, LOW);
    }

  } else {
    Serial.println("WiFi Disconnected!");
  }

  delay(5000);
}