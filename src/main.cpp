
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Adafruit_AHTX0.h>

// =====================
// WIFI
// =====================
const char* ssid = "Hello";
const char* password = "12345677";

// Render server
String serverURL =
    "https://dht22-thuctap.onrender.com/data";


// =====================
// PIN CONFIG
// =====================

// ESP32-C3 Super Mini
#define RELAY_PIN   5
#define BUZZER_PIN  6

// I2C
#define SDA_PIN     8
#define SCL_PIN     9


// =====================
// RELAY CONFIG
// =====================

// Theo schematic hiện tại:
// GPIO5 HIGH -> transistor kích relay -> Relay ON
#define RELAY_ON  HIGH
#define RELAY_OFF LOW


// =====================
// AHT30 SENSOR
// =====================

Adafruit_AHTX0 aht;

sensors_event_t humidityEvent;
sensors_event_t temperatureEvent;


// =====================
// OLED SH1107
// =====================

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64

Adafruit_SH1107 display(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    &Wire
);


// =====================
// VARIABLES
// =====================

float temperature = 0;
float humidity = 0;

bool fanState = false;
bool buzzerState = false;

unsigned long lastSend = 0;


// =====================
// WIFI CONNECT
// =====================

void connectWiFi()
{
    WiFi.begin(
        ssid,
        password
    );

    Serial.print("Connecting WiFi");

    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println("WiFi Connected");

    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
}


// =====================
// OLED DISPLAY
// =====================

void showOLED()
{
    display.clearDisplay();

    display.setTextSize(1);
    display.setTextColor(SH110X_WHITE);

    // Title
    display.setCursor(0, 0);
    display.print("AHT30 MONITOR");

    // Temperature
    display.setCursor(0, 15);
    display.print("TEMP: ");
    display.print(temperature, 2);
    display.println(" C");

    // Humidity
    display.setCursor(0, 30);
    display.print("HUM : ");
    display.print(humidity, 2);
    display.println(" %");

    // Fan
    display.setCursor(0, 45);
    display.print("FAN:");
    display.print(
        fanState ? "ON" : "OFF"
    );

    // Buzzer
    display.print(" ALM:");
    display.print(
        buzzerState ? "ON" : "OFF"
    );

    display.display();
}


// =====================
// SEND DATA TO SERVER
// =====================

void sendData()
{
    if (WiFi.status() == WL_CONNECTED)
    {
        HTTPClient http;

        http.begin(serverURL);

        http.addHeader(
            "Content-Type",
            "application/json"
        );

        String json = "{";

        json += "\"temperature\":";
        json += String(temperature, 2);

        json += ",\"humidity\":";
        json += String(humidity, 2);

        json += ",\"fan\":";
        json += fanState ? "true" : "false";

        json += ",\"buzzer\":";
        json += buzzerState ? "true" : "false";

        json += "}";

        int code = http.POST(json);

        Serial.println();
        Serial.println("SEND DATA:");
        Serial.println(json);

        Serial.print("HTTP: ");
        Serial.println(code);

        http.end();
    }
    else
    {
        Serial.println("WiFi disconnected");
    }
}


// =====================
// SETUP
// =====================

void setup()
{
    Serial.begin(115200);

    // ---------------------
    // GPIO
    // ---------------------

    pinMode(
        RELAY_PIN,
        OUTPUT
    );

    pinMode(
        BUZZER_PIN,
        OUTPUT
    );

    // Tắt relay lúc khởi động
    digitalWrite(
        RELAY_PIN,
        RELAY_OFF
    );

    // Tắt buzzer lúc khởi động
    digitalWrite(
        BUZZER_PIN,
        LOW
    );


    // ---------------------
    // I2C
    // ---------------------

    Wire.begin(
        SDA_PIN,
        SCL_PIN
    );


    // ---------------------
    // OLED
    // ---------------------

    if (!display.begin(0x3C, true))
    {
        Serial.println("OLED ERROR");
    }
    else
    {
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SH110X_WHITE);
        display.setCursor(0, 20);
        display.println("Starting...");
        display.display();
    }


    // ---------------------
    // AHT30
    // ---------------------

    if (!aht.begin())
    {
        Serial.println("AHT30 ERROR");

        display.clearDisplay();
        display.setCursor(0, 20);
        display.println("AHT30 ERROR");
        display.display();

        while (1)
        {
            delay(1000);
        }
    }

    Serial.println("AHT30 OK");


    // ---------------------
    // WIFI
    // ---------------------

    connectWiFi();
}


// =====================
// LOOP
// =====================

void loop()
{
    // =====================
    // READ AHT30
    // =====================

    aht.getEvent(
        &humidityEvent,
        &temperatureEvent
    );

    temperature = temperatureEvent.temperature;
    humidity = humidityEvent.relative_humidity;


    // =====================
    // CHECK SENSOR
    // =====================

    if (
        isnan(temperature) ||
        isnan(humidity)
    )
    {
        Serial.println("AHT30 ERROR");

        display.clearDisplay();

        display.setCursor(
            0,
            20
        );

        display.println(
            "AHT30 ERROR"
        );

        display.display();

        delay(2000);

        return;
    }


    // =====================
    // FAN CONTROL
    // =====================

    if (temperature >= 30.0)
    {
        fanState = true;

        digitalWrite(
            RELAY_PIN,
            RELAY_ON
        );
    }
    else
    {
        fanState = false;

        digitalWrite(
            RELAY_PIN,
            RELAY_OFF
        );
    }


    // =====================
    // BUZZER
    // =====================

    if (temperature >= 40.0)
    {
        buzzerState = true;

        digitalWrite(
            BUZZER_PIN,
            HIGH
        );
    }
    else
    {
        buzzerState = false;

        digitalWrite(
            BUZZER_PIN,
            LOW
        );
    }


    // =====================
    // OLED
    // =====================

    showOLED();


    // =====================
    // SEND SERVER
    // =====================

    if (millis() - lastSend > 3000)
    {
        sendData();

        lastSend = millis();
    }


    delay(1000);
}

