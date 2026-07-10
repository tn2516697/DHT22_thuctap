#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

#include <DHT.h>

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

// =====================
// WIFI
// =====================
const char* ssid = "Hello";
const char* password = "12345677";
// Render server
String serverURL =
"https://dht22-thuctap.onrender.com/data";

// PIN CONFIG =====================

#define DHT_PIN 2
#define RELAY_PIN 5
#define BUZZER_PIN 6

#define SDA_PIN 21
#define SCL_PIN 20

// Relay module thường kích LOW =====================

#define RELAY_ON LOW
#define RELAY_OFF HIGH

// SENSOR =====================

#define DHTTYPE DHT22

DHT dht
(
    DHT_PIN,
    DHTTYPE
);

// OLED SH1107 =====================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SH1107 display
(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    &Wire
);


// VARIABLES =====================

float temperature;
float humidity;

bool fanState=false;
bool buzzerState=false;

unsigned long lastSend=0;

// WIFI CONNECT =====================

void connectWiFi()
{
    WiFi.begin(
        ssid,
        password
    );

    Serial.print(
        "Connecting WiFi"
    );

    while
    (
        WiFi.status()!=WL_CONNECTED
    )

    {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println
    (
        "WiFi Connected"
    );
}

// OLED DISPLAY =====================

void showOLED()
{
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor
    (
        SH110X_WHITE
    );
    display.setCursor
    (
        0,
        0
    );

    display.print
    (
        "DHT22 MONITOR"
    );
    display.setCursor
    (
        0,
        15
    );

    display.print("TEMP: ");
    display.print(temperature);
    display.println(" C");
    display.setCursor
    (
        0,
        30
    );
    display.print("HUM : ");
    display.print(humidity );
    display.println(" %");

    display.setCursor(
        0,
        45
    );
    display.print("FAN:");
    display.print
    ( fanState?
        "ON":
        "OFF"
    );

    display.print(" ALM:");
    display.print
    (
        buzzerState?
        "ON":
        "OFF"
    );
    display.display();
}

// SEND SERVER =====================

void sendData()
{
    if(
        WiFi.status()
        ==
        WL_CONNECTED
    )
    {
        HTTPClient http;
        http.begin
        (
            serverURL
        );

        http.addHeader
        (
            "Content-Type",
            "application/json"
        );

        String json = "{";

        json +="\"temperature\":";
        json += temperature;

        json +=",\"humidity\":";
        json += humidity;

        json +=",\"fan\":";
        json += fanState?
        "true":
        "false";

        json +=",\"buzzer\":";
        json +=buzzerState?
        "true":
        "false";
        json += "}";

        int code = http.POST(json);

        Serial.println
        (
            json
        );

        Serial.print
        (
            "HTTP:"
        );

        Serial.println
        (
            code
        );
        http.end();
    }
}

// SETUP =====================

void setup()
{
    Serial.begin(115200);
    pinMode
    (
        RELAY_PIN,
        OUTPUT
    );

    pinMode
    (
        BUZZER_PIN,
        OUTPUT
    );

    digitalWrite
    (
        RELAY_PIN,
        RELAY_OFF
    );

    digitalWrite
    (
        BUZZER_PIN,
        LOW
    );

    Wire.begin
    (
        SDA_PIN,
        SCL_PIN
    );

    display.begin
    (
        0x3C,
        true
    );

    display.clearDisplay();
    display.display();
    dht.begin();
    connectWiFi();
}

// LOOP =====================

void loop()
{
    temperature = dht.readTemperature();
    humidity = dht.readHumidity();

    if
    (
        isnan(temperature)
        ||
        isnan(humidity)
    )
    {
        Serial.println
        (
            "DHT ERROR"
        );

        display.clearDisplay();
        display.setCursor(
            0,
            20
        );
        display.println("DHT ERROR");
        display.display();
        delay(2000);
        return;
    }

    // FAN CONTROL
    if
    (
        temperature >= 30
    )
    {
        fanState=true;
        digitalWrite
        (
            RELAY_PIN,
            RELAY_ON
        );
    }

    else
    {
        fanState=false;
        digitalWrite
        (
            RELAY_PIN,
            RELAY_OFF
        );
    }

    // BUZZER
    if(temperature >=40)
    {
        buzzerState=true;
        digitalWrite
        (
            BUZZER_PIN,
            HIGH
        );
    }

    else
    {
        buzzerState=false;
        digitalWrite(
            BUZZER_PIN,
            LOW
        );
    }

    showOLED();
    if(millis()-lastSend > 3000)
    {
        sendData();
        lastSend=millis();
    }
    delay(1000);
}