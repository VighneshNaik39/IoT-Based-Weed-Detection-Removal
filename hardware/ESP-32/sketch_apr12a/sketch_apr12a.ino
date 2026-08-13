#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "meowww";
const char* password = "capital v";
const char* serverName = "http://192.168.218.135:5000/api/update";

#define LED_PIN 2

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  WiFi.begin(ssid, password);
  Serial.print("Connecting");

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }

  Serial.println("\nConnected!");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

void blinkLED(int times, int speed_ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(speed_ms);
    digitalWrite(LED_PIN, LOW);
    delay(speed_ms);
  }
}

void loop() {
  bool weedDetected = millis() % 10000 < 4000;
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
      Serial.print("❌ Error sending POST: ");
      Serial.println(httpResponseCode);
    }

    http.end();

    if (weedDetected) {
      Serial.println("⚠️ Weed detected! Blinking LED...");
      blinkLED(2, 200);
    } else {
      Serial.println("✅ No weed. LED off.");
      digitalWrite(LED_PIN, LOW);
    }

  } else {
    Serial.println("❌ WiFi Disconnected!");
  }

  delay(5000);
}