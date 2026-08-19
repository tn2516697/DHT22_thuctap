#include <Arduino.h>

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include <Wire.h>

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_AHTX0.h>

#include <LittleFS.h>
#include <time.h>


// =====================================================
// WIFI
// =====================================================

const char* ssid = "Hello";
const char* password = "12345677";

String serverURL =
    "https://dht22-thuctap.onrender.com/data";


// =====================================================
// TIME / NTP
// =====================================================

// Việt Nam: UTC+7
const long GMT_OFFSET_SEC = 7 * 3600;
const int DAYLIGHT_OFFSET_SEC = 0;


// =====================================================
// PIN CONFIG
// ESP32-WROOM-32U
// =====================================================

// Relay
#define RELAY_PIN   19

// Buzzer
#define BUZZER_PIN  14

// I2C
#define SDA_PIN     21
#define SCL_PIN     22


// =====================================================
// RELAY
// =====================================================

#define RELAY_ON  HIGH
#define RELAY_OFF LOW


// =====================================================
// AHT30
// =====================================================

Adafruit_AHTX0 aht;

sensors_event_t humidityEvent;
sensors_event_t temperatureEvent;


// =====================================================
// OLED SSD1306
// =====================================================

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1

Adafruit_SSD1306 display(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    &Wire,
    OLED_RESET
);


// =====================================================
// LITTLEFS
// =====================================================

const char* QUEUE_FILE = "/sensor_queue.txt";


// =====================================================
// VARIABLES
// =====================================================

float temperature = 0;
float humidity = 0;

bool fanState = false;
bool buzzerState = false;


// =====================================================
// TIMERS
// =====================================================

unsigned long lastSensorRead = 0;
unsigned long lastWiFiReconnect = 0;

const unsigned long SENSOR_INTERVAL = 3000;
const unsigned long WIFI_RECONNECT_INTERVAL = 10000;


// =====================================================
// WIFI ICON
// =====================================================

const unsigned char wifi_connected_icon[] PROGMEM =
{
    0b00000000, 0b00000000,
    0b00000111, 0b11100000,
    0b00011111, 0b11111000,
    0b00111000, 0b00011100,
    0b01100000, 0b00000110,
    0b00000000, 0b00000000,
    0b00000111, 0b11100000,
    0b00011111, 0b11111000,
    0b00111000, 0b00011100,
    0b00000000, 0b00000000,
    0b00000111, 0b11100000,
    0b00001111, 0b11110000,
    0b00000111, 0b11100000,
    0b00000001, 0b10000000,
    0b00000011, 0b11000000,
    0b00000001, 0b10000000
};


const unsigned char wifi_disconnected_icon[] PROGMEM =
{
    0b00000000, 0b00000000,
    0b00000111, 0b11100000,
    0b00011111, 0b11111000,
    0b00111000, 0b00011100,
    0b01100000, 0b00000110,
    0b00000000, 0b00000000,
    0b00000111, 0b11100000,
    0b00011111, 0b11111000,
    0b00111000, 0b00011100,
    0b00000000, 0b00000000,
    0b00000111, 0b11100000,
    0b00001111, 0b11110000,
    0b00011000, 0b00011000,
    0b00111100, 0b00111100,
    0b01100110, 0b01100110,
    0b11000011, 0b11000011
};


// =====================================================
// THERMOMETER ICON
// =====================================================

const unsigned char thermometer_icon[] PROGMEM =
{
    0b00000110, 0b00000000,
    0b00000110, 0b00000000,
    0b00000110, 0b00000000,
    0b00000110, 0b00000000,
    0b00000110, 0b00000000,
    0b00000110, 0b00000000,
    0b00000110, 0b00000000,
    0b00000110, 0b00000000,
    0b00000110, 0b00000000,
    0b00001111, 0b00000000,
    0b00011111, 0b10000000,
    0b00011111, 0b10000000,
    0b00011111, 0b10000000,
    0b00001111, 0b00000000,
    0b00000110, 0b00000000,
    0b00000000, 0b00000000
};


// =====================================================
// WATER DROP ICON
// =====================================================

const unsigned char water_icon[] PROGMEM =
{
    0b00000110, 0b00000000,
    0b00001111, 0b00000000,
    0b00011111, 0b10000000,
    0b00111111, 0b11000000,
    0b00111111, 0b11000000,
    0b01111111, 0b11100000,
    0b01111111, 0b11100000,
    0b01111111, 0b11100000,
    0b00111111, 0b11000000,
    0b00111111, 0b11000000,
    0b00011111, 0b10000000,
    0b00001111, 0b00000000,
    0b00000110, 0b00000000,
    0b00000000, 0b00000000,
    0b00000000, 0b00000000,
    0b00000000, 0b00000000
};


// =====================================================
// FORMAT TIMESTAMP
// =====================================================

String getTimestamp()
{
    struct tm timeinfo;

    if (!getLocalTime(&timeinfo, 1000))
    {
        return "";
    }

    char buffer[25];

    strftime(
        buffer,
        sizeof(buffer),
        "%Y-%m-%dT%H:%M:%S",
        &timeinfo
    );

    return String(buffer);
}


// =====================================================
// CHECK TIME
// =====================================================

bool timeIsValid()
{
    time_t now;
    time(&now);

    return now > 1577836800;
}


// =====================================================
// SYNC NTP
// =====================================================

void syncTime()
{
    Serial.println();
    Serial.println("Synchronizing time...");

    configTime(
        GMT_OFFSET_SEC,
        DAYLIGHT_OFFSET_SEC,
        "pool.ntp.org",
        "time.nist.gov",
        "time.google.com"
    );

    struct tm timeinfo;

    if (getLocalTime(&timeinfo, 10000))
    {
        Serial.println("Time synchronized");

        Serial.print("Local time: ");
        Serial.println(getTimestamp());
    }
    else
    {
        Serial.println("Time synchronization failed");
    }
}


// =====================================================
// WIFI CONNECT
// =====================================================

void connectWiFi()
{
    if (WiFi.status() == WL_CONNECTED)
    {
        return;
    }

    Serial.println();
    Serial.println("================================");
    Serial.println("Connecting WiFi...");
    Serial.println("SSID: " + String(ssid));
    Serial.println("================================");

    WiFi.disconnect(true);
    delay(500);

    WiFi.mode(WIFI_STA);

    WiFi.begin(
        ssid,
        password
    );

    unsigned long startTime = millis();

    while (
        WiFi.status() != WL_CONNECTED &&
        millis() - startTime < 15000
    )
    {
        delay(500);

        Serial.print(".");
    }

    Serial.println();

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.println("================================");
        Serial.println("WIFI CONNECTED!");
        Serial.println("================================");

        Serial.print("SSID: ");
        Serial.println(WiFi.SSID());

        Serial.print("IP: ");
        Serial.println(WiFi.localIP());

        Serial.print("Gateway: ");
        Serial.println(WiFi.gatewayIP());

        Serial.print("RSSI: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");

        syncTime();
    }
    else
    {
        Serial.println("================================");
        Serial.println("WIFI CONNECTION FAILED");
        Serial.print("Status: ");
        Serial.println(WiFi.status());
        Serial.println("================================");
    }
}


// =====================================================
// WIFI AUTO RECONNECT
// =====================================================

void checkWiFi()
{
    if (WiFi.status() == WL_CONNECTED)
    {
        return;
    }

    if (
        millis() -
        lastWiFiReconnect <
        WIFI_RECONNECT_INTERVAL
    )
    {
        return;
    }

    lastWiFiReconnect = millis();

    Serial.println();
    Serial.println("WiFi lost - reconnecting...");

    WiFi.disconnect();
    delay(200);

    WiFi.begin(
        ssid,
        password
    );
}


// =====================================================
// OLED
// =====================================================

void showOLED()
{
    display.clearDisplay();

    display.setTextColor(SSD1306_WHITE);

    // TITLE
    display.setTextSize(2);

    String title = "AHT30";

    int16_t x1;
    int16_t y1;

    uint16_t w;
    uint16_t h;

    display.getTextBounds(
        title,
        0,
        0,
        &x1,
        &y1,
        &w,
        &h
    );

    int titleX = (SCREEN_WIDTH - w) / 2;

    display.setCursor(
        titleX,
        0
    );

    display.print(title);

    // WIFI ICON
    if (WiFi.status() == WL_CONNECTED)
    {
        display.drawBitmap(
            110,
            0,
            wifi_connected_icon,
            16,
            16,
            SSD1306_WHITE
        );
    }
    else
    {
        display.drawBitmap(
            110,
            0,
            wifi_disconnected_icon,
            16,
            16,
            SSD1306_WHITE
        );
    }

    // TEMPERATURE
    display.setTextSize(2);

    String tempText =
        String(temperature, 2) + " C";

    display.getTextBounds(
        tempText,
        0,
        0,
        &x1,
        &y1,
        &w,
        &h
    );

    int tempGroupWidth = 12 + 5 + w;

    int tempStartX =
        (SCREEN_WIDTH - tempGroupWidth) / 2;

    display.drawBitmap(
        tempStartX,
        20,
        thermometer_icon,
        12,
        16,
        SSD1306_WHITE
    );

    display.setCursor(
        tempStartX + 17,
        20
    );

    display.print(tempText);

    // HUMIDITY
    String humText =
        String(humidity, 2) + " %";

    display.getTextBounds(
        humText,
        0,
        0,
        &x1,
        &y1,
        &w,
        &h
    );

    int humGroupWidth = 12 + 5 + w;

    int humStartX =
        (SCREEN_WIDTH - humGroupWidth) / 2;

    display.drawBitmap(
        humStartX,
        37,
        water_icon,
        12,
        16,
        SSD1306_WHITE
    );

    display.setCursor(
        humStartX + 17,
        37
    );

    display.print(humText);

    // FAN
    display.setTextSize(1);

    String fanText =
        fanState
        ? "FAN: ON"
        : "FAN: OFF";

    display.setCursor(4, 55);
    display.print(fanText);

    // ALARM
    String alarmText =
        buzzerState
        ? "ALM: ON"
        : "ALM: OFF";

    display.getTextBounds(
        alarmText,
        0,
        0,
        &x1,
        &y1,
        &w,
        &h
    );

    int alarmX =
        SCREEN_WIDTH - w - 4;

    display.setCursor(
        alarmX,
        55
    );

    display.print(alarmText);

    display.display();
}


// =====================================================
// CREATE SENSOR JSON
// =====================================================

String createSensorJSON(
    const String& timestamp
)
{
    String json = "{";

    json += "\"temperature\":";
    json += String(temperature, 2);

    json += ",\"humidity\":";
    json += String(humidity, 2);

    json += ",\"fan\":";
    json += fanState ? "true" : "false";

    json += ",\"buzzer\":";
    json += buzzerState ? "true" : "false";

    json += ",\"timestamp\":\"";
    json += timestamp;
    json += "\"";

    json += "}";

    return json;
}


// =====================================================
// SAVE OFFLINE DATA
// =====================================================

bool saveOfflineData(
    const String& json
)
{
    File file =
        LittleFS.open(
            QUEUE_FILE,
            FILE_APPEND
        );

    if (!file)
    {
        Serial.println(
            "ERROR: Cannot open queue file"
        );

        return false;
    }

    file.println(json);
    file.close();

    Serial.println("Data saved to Flash");

    return true;
}


// =====================================================
// COUNT OFFLINE RECORDS
// =====================================================

int countOfflineRecords()
{
    if (!LittleFS.exists(QUEUE_FILE))
    {
        return 0;
    }

    File file =
        LittleFS.open(
            QUEUE_FILE,
            FILE_READ
        );

    if (!file)
    {
        return 0;
    }

    int count = 0;

    while (file.available())
    {
        String line =
            file.readStringUntil('\n');

        line.trim();

        if (line.length() > 0)
        {
            count++;
        }
    }

    file.close();

    return count;
}


// =====================================================
// SEND CURRENT DATA
// =====================================================

bool sendCurrentData()
{
    if (WiFi.status() != WL_CONNECTED)
    {
        return false;
    }

    if (!timeIsValid())
    {
        Serial.println(
            "Time invalid - cannot send data"
        );

        return false;
    }

    String timestamp =
        getTimestamp();

    if (timestamp.length() == 0)
    {
        return false;
    }

    String json =
        createSensorJSON(timestamp);

    Serial.println();
    Serial.println("Sending realtime data:");
    Serial.println(json);

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;

    if (!http.begin(client, serverURL))
    {
        Serial.println(
            "HTTP BEGIN FAILED"
        );

        return false;
    }

    http.addHeader(
        "Content-Type",
        "application/json"
    );

    int code =
        http.POST(json);

    Serial.print(
        "HTTP Response: "
    );

    Serial.println(code);

    bool success = false;

    if (code >= 200 && code < 300)
    {
        success = true;

        String response =
            http.getString();

        Serial.println("Server:");
        Serial.println(response);
    }
    else
    {
        Serial.print("HTTP ERROR: ");
        Serial.println(
            http.errorToString(code)
        );
    }

    http.end();

    return success;
}


// =====================================================
// SEND OFFLINE DATA
// =====================================================

bool sendOfflineData()
{
    if (WiFi.status() != WL_CONNECTED)
    {
        return false;
    }

    if (!LittleFS.exists(QUEUE_FILE))
    {
        return true;
    }

    int count =
        countOfflineRecords();

    if (count == 0)
    {
        LittleFS.remove(QUEUE_FILE);
        return true;
    }

    Serial.println();
    Serial.println("================================");

    Serial.print(
        "Offline records waiting: "
    );

    Serial.println(count);

    Serial.println(
        "Sending offline data..."
    );

    File file =
        LittleFS.open(
            QUEUE_FILE,
            FILE_READ
        );

    if (!file)
    {
        Serial.println(
            "Cannot open queue"
        );

        return false;
    }

    String batch = "[";
    bool first = true;

    while (file.available())
    {
        String line =
            file.readStringUntil('\n');

        line.trim();

        if (line.length() == 0)
        {
            continue;
        }

        if (!first)
        {
            batch += ",";
        }

        batch += line;

        first = false;
    }

    file.close();

    batch += "]";

    Serial.print("Batch size: ");
    Serial.print(batch.length());
    Serial.println(" bytes");

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;

    if (!http.begin(client, serverURL))
    {
        Serial.println(
            "HTTP BEGIN FAILED"
        );

        return false;
    }

    http.addHeader(
        "Content-Type",
        "application/json"
    );

    int code =
        http.POST(batch);

    Serial.print(
        "Offline batch HTTP: "
    );

    Serial.println(code);

    bool success = false;

    if (code >= 200 && code < 300)
    {
        String response =
            http.getString();

        Serial.println(
            "Server response:"
        );

        Serial.println(response);

        success = true;
    }
    else
    {
        Serial.print(
            "Batch send error: "
        );

        Serial.println(
            http.errorToString(code)
        );
    }

    http.end();

    if (success)
    {
        LittleFS.remove(QUEUE_FILE);

        Serial.println(
            "Offline data sent successfully"
        );

        Serial.println(
            "Flash queue cleared"
        );
    }

    Serial.println(
        "================================"
    );

    return success;
}


// =====================================================
// READ SENSOR
// =====================================================

bool readSensor()
{
    aht.getEvent(
        &humidityEvent,
        &temperatureEvent
    );

    temperature =
        temperatureEvent.temperature;

    humidity =
        humidityEvent.relative_humidity;

    if (
        isnan(temperature) ||
        isnan(humidity)
    )
    {
        Serial.println(
            "AHT30 ERROR"
        );

        return false;
    }

    Serial.print(
        "Temperature: "
    );

    Serial.print(
        temperature,
        2
    );

    Serial.println(" C");

    Serial.print(
        "Humidity: "
    );

    Serial.print(
        humidity,
        2
    );

    Serial.println(" %");

    return true;
}


// =====================================================
// CONTROL FAN / RELAY
// =====================================================

void controlFan()
{
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
}


// =====================================================
// CONTROL BUZZER
// =====================================================

void controlBuzzer()
{
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
}


// =====================================================
// SETUP
// =====================================================

void setup()
{
    Serial.begin(115200);

    delay(1000);

    Serial.println();
    Serial.println(
        "================================"
    );

    Serial.println(
        "ESP32-WROOM SMART ENVIRONMENT"
    );

    Serial.println(
        "================================"
    );

    Serial.print("Chip: ");
    Serial.println(ESP.getChipModel());

    Serial.print("MAC: ");
    Serial.println(WiFi.macAddress());

    // =================================================
    // GPIO
    // =================================================

    pinMode(
        RELAY_PIN,
        OUTPUT
    );

    pinMode(
        BUZZER_PIN,
        OUTPUT
    );

    digitalWrite(
        RELAY_PIN,
        RELAY_OFF
    );

    digitalWrite(
        BUZZER_PIN,
        LOW
    );

    // =================================================
    // I2C
    // =================================================

    Wire.begin(
        SDA_PIN,
        SCL_PIN
    );

    Serial.println(
        "I2C: SDA=GPIO21, SCL=GPIO22"
    );

    // =================================================
    // LITTLEFS
    // =================================================

    if (!LittleFS.begin(true))
    {
        Serial.println(
            "LittleFS ERROR"
        );
    }
    else
    {
        Serial.println(
            "LittleFS OK"
        );

        int count =
            countOfflineRecords();

        Serial.print(
            "Offline records: "
        );

        Serial.println(count);
    }

    // =================================================
    // OLED
    // =================================================

    if (
        !display.begin(
            SSD1306_SWITCHCAPVCC,
            0x3C
        )
    )
    {
        Serial.println(
            "OLED ERROR"
        );
    }
    else
    {
        Serial.println(
            "OLED OK"
        );

        display.clearDisplay();

        display.setTextColor(
            SSD1306_WHITE
        );

        display.setTextSize(2);

        display.setCursor(
            34,
            25
        );

        display.print("AHT30");

        display.display();

        delay(1000);
    }

    // =================================================
    // AHT30
    // =================================================

    if (!aht.begin())
    {
        Serial.println(
            "AHT30 ERROR"
        );

        display.clearDisplay();

        display.setTextSize(1);

        display.setCursor(
            20,
            28
        );

        display.print(
            "AHT30 ERROR"
        );

        display.display();

        while (true)
        {
            delay(1000);
        }
    }

    Serial.println(
        "AHT30 OK"
    );

    // =================================================
    // WIFI
    // =================================================

    WiFi.mode(WIFI_STA);

    connectWiFi();

    // =================================================
    // SEND OLD DATA
    // =================================================

    if (
        WiFi.status() ==
        WL_CONNECTED
    )
    {
        sendOfflineData();
    }

    showOLED();
}


// =====================================================
// LOOP
// =====================================================

void loop()
{
    checkWiFi();

    // =================================================
    // SENSOR
    // =================================================

    if (
        millis() -
        lastSensorRead >=
        SENSOR_INTERVAL
    )
    {
        lastSensorRead =
            millis();

        if (!readSensor())
        {
            delay(1000);
            return;
        }

        controlFan();

        controlBuzzer();

        showOLED();

        // =================================================
        // SEND / SAVE
        // =================================================

        if (
            WiFi.status() ==
            WL_CONNECTED
        )
        {
            bool sent =
                sendCurrentData();

            // Nếu POST thất bại, lưu lại Flash
            if (!sent)
            {
                String timestamp =
                    getTimestamp();

                if (timestamp.length() > 0)
                {
                    String json =
                        createSensorJSON(
                            timestamp
                        );

                    Serial.println(
                        "HTTP failed - saving locally"
                    );

                    saveOfflineData(json);
                }
            }
        }
        else
        {
            String timestamp =
                getTimestamp();

            if (timestamp.length() > 0)
            {
                String json =
                    createSensorJSON(
                        timestamp
                    );

                Serial.println();
                Serial.println(
                    "WiFi OFFLINE"
                );

                Serial.println(
                    "Saving local data:"
                );

                Serial.println(json);

                saveOfflineData(json);
            }
            else
            {
                Serial.println(
                    "Cannot create timestamp"
                );
            }
        }
    }

    // =================================================
    // WIFI JUST CAME BACK
    // =================================================

    static bool previousWiFiState = false;

    bool currentWiFiState =
        (
            WiFi.status() ==
            WL_CONNECTED
        );

    if (
        currentWiFiState &&
        !previousWiFiState
    )
    {
        Serial.println();
        Serial.println(
            "WiFi restored!"
        );

        syncTime();

        sendOfflineData();
    }

    previousWiFiState =
        currentWiFiState;

    delay(50);
}