// SightLine: a pan-tilt head with two LD2410C radars that keeps a person in
// view and sends an alert when they have been out of sight for too long.
//
// Board:  Adafruit ESP32 Feather V2 (Tools > Board > "Adafruit Feather ESP32 V2")
// Libs:   "ESP32Servo" by Kevin Harrington, "ld2410" by ncmreynolds
// Setup:  copy secrets.example.h to secrets.h and fill it in.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <ld2410.h>
#include "secrets.h"
#ifndef FACETIME_TO   // older secrets.h files don't have this setting
#define FACETIME_TO ""
#endif

// ---------- Pins (see the wiring table in the build guide) ----------
const int RADAR_L_RX = 7;   // Feather "RX" pin  <- left radar TX
const int RADAR_L_TX = 8;   // Feather "TX" pin  -> left radar RX
const int RADAR_R_RX = 32;  // Feather "32"      <- right radar TX
const int RADAR_R_TX = 14;  // Feather "14"      -> right radar RX
const int PAN_PIN = 27;     // Feather "27"      -> pan servo signal (yellow)
const int TILT_PIN = 33;    // Feather "33"      -> tilt servo signal (yellow)
const int LED_PIN = 13;     // red LED on the Feather

// ---------- Tuning ----------
const int PAN_MIN = 20, PAN_MAX = 160, PAN_CENTER = 90;  // degrees
const int TILT_LEVEL = 90;          // straight ahead; lower = look down
const int PAN_DIRECTION = 1;        // set to -1 if the head turns the wrong way
const int MIN_ENERGY = 15;          // 0-100; below this a radar "sees nobody"
const int DEADBAND = 8;             // ignore left/right differences smaller than this
const float GAIN = 0.08;            // degrees of turn per point of energy difference
const float MAX_STEP = 3.0;         // fastest turn per control tick (degrees)
const float SWEEP_STEP = 1.2;       // search speed per control tick (degrees)
const uint32_t TICK_MS = 50;        // control loop period (20 Hz)
const uint32_t LOST_GRACE_MS = 2000;     // start searching after this long unseen
const uint32_t ALERT_AFTER_MS = 20000;   // alert after this long unseen
const uint32_t FOUND_CONFIRM_MS = 1000;  // must be seen this long to count as "back"

ld2410 radarL, radarR;
Servo panServo, tiltServo;

enum State { TRACKING, SEARCHING, ALERTED };
State state = TRACKING;
float pan = PAN_CENTER;
float sweepDir = 1;
uint32_t lastSeenAt = 0, seenSince = 0, lastTick = 0, lastLog = 0;

// Strongest signal one radar reports (0 when it sees nobody).
int radarScore(ld2410 &r) {
  if (!r.presenceDetected()) return 0;
  int moving = r.movingTargetDetected() ? r.movingTargetEnergy() : 0;
  int still = r.stationaryTargetDetected() ? r.stationaryTargetEnergy() : 0;
  return max(moving, still);
}

void movePan(float delta) {
  pan = constrain(pan + delta * PAN_DIRECTION, PAN_MIN, PAN_MAX);
  panServo.write((int)pan);
}

const char *wifiReasonText(uint8_t r) {
  switch (r) {
    case WIFI_REASON_NO_AP_FOUND: return "network not found - is it on, and 2.4 GHz?";
    case WIFI_REASON_AUTH_FAIL:
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_HANDSHAKE_TIMEOUT: return "wrong password?";
    case WIFI_REASON_ASSOC_FAIL: return "network refused the connection";
    default: return "see ESP32 wifi_err_reason_t";
  }
}

void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  static uint8_t lastReason = 0;
  static uint32_t lastPrint = 0;
  if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    Serial.printf("WiFi: connected, IP %s\n", WiFi.localIP().toString().c_str());
    lastReason = 0;
  } else if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    uint8_t r = info.wifi_sta_disconnected.reason;
    if (r != lastReason || millis() - lastPrint > 10000) {  // it retries constantly; don't flood
      Serial.printf("WiFi: couldn't connect (reason %d: %s)\n", r, wifiReasonText(r));
      lastReason = r;
      lastPrint = millis();
    }
  }
}

void connectWifi() {
  if (strlen(WIFI_SSID) == 0) return;
  WiFi.mode(WIFI_STA);
  WiFi.onEvent(onWifiEvent);

  // Check the network is visible first; the ESP32 only sees 2.4 GHz networks.
  int n = WiFi.scanNetworks();
  bool found = false;
  for (int i = 0; i < n; i++) {
    if (WiFi.SSID(i) == WIFI_SSID) {
      Serial.printf("WiFi: found \"%s\" (channel %d, signal %d dBm)\n", WIFI_SSID, WiFi.channel(i), WiFi.RSSI(i));
      found = true;
    }
  }
  if (!found) {
    Serial.printf("WiFi: \"%s\" is not visible. The ESP32 only sees 2.4 GHz networks. Visible ones:\n", WIFI_SSID);
    for (int i = 0; i < n && i < 8; i++) Serial.printf("  \"%s\"\n", WiFi.SSID(i).c_str());
  }
  WiFi.scanDelete();

  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("WiFi: connecting to \"%s\"\n", WIFI_SSID);
}

// An alert raised while WiFi is down is held here and sent once it connects.
const char *pendingType = nullptr;
const char *pendingMessage = nullptr;

// Sends a phone push via ntfy.sh and/or a row to Supabase, whichever is configured.
void sendAlert(const char *type, const char *message) {
  Serial.printf("ALERT [%s] %s\n", type, message);
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("  (WiFi not connected yet: will send as soon as it connects)");
    pendingType = type;
    pendingMessage = message;
    return;
  }
  pendingType = nullptr;
  WiFiClientSecure client;
  client.setInsecure();  // fine for a hackathon demo; pin certificates for real use
  HTTPClient http;

  if (strlen(NTFY_TOPIC) > 0) {
    http.begin(client, String("https://ntfy.sh/") + NTFY_TOPIC);
    http.addHeader("Title", "SightLine");
    bool outOfSight = strcmp(type, "out_of_sight") == 0;
    http.addHeader("Priority", outOfSight ? "urgent" : "default");
    // Tapping the alert starts a FaceTime video call to the turret's iPhone.
    if (outOfSight && strlen(FACETIME_TO) > 0) http.addHeader("Click", String("facetime://") + FACETIME_TO);
    int code = http.POST(message);
    Serial.printf("  ntfy -> %d\n", code);
    http.end();
  }

  if (strlen(SUPABASE_URL) > 0) {
    http.begin(client, String(SUPABASE_URL) + "/rest/v1/events");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    http.addHeader("Prefer", "return=minimal");
    String body = String("{\"device\":\"") + DEVICE_NAME + "\",\"type\":\"" + type +
                  "\",\"message\":\"" + message + "\",\"pan_angle\":" + (int)pan + "}";
    int code = http.POST(body);
    Serial.printf("  supabase -> %d\n", code);
    http.end();
  }
}

// On boot: look left, right, up, down so you can see the head works.
void selfTest() {
  int poses[][2] = {{PAN_CENTER, TILT_LEVEL}, {PAN_MIN, TILT_LEVEL}, {PAN_MAX, TILT_LEVEL},
                    {PAN_CENTER, TILT_LEVEL - 20}, {PAN_CENTER, TILT_LEVEL}};
  for (auto &p : poses) {
    panServo.write(p[0]);
    tiltServo.write(p[1]);
    delay(600);
  }
  pan = PAN_CENTER;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  Serial1.begin(256000, SERIAL_8N1, RADAR_L_RX, RADAR_L_TX);
  Serial2.begin(256000, SERIAL_8N1, RADAR_R_RX, RADAR_R_TX);
  delay(500);
  Serial.println(radarL.begin(Serial1) ? "Left radar OK" : "Left radar NOT found - check wiring");
  Serial.println(radarR.begin(Serial2) ? "Right radar OK" : "Right radar NOT found - check wiring");

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  panServo.setPeriodHertz(50);
  tiltServo.setPeriodHertz(50);
  panServo.attach(PAN_PIN, 600, 2400);   // HS-422 pulse range
  tiltServo.attach(TILT_PIN, 600, 2400);
  selfTest();

  connectWifi();
  lastSeenAt = millis();
}

void loop() {
  // The radars stream data constantly; read() must run every loop.
  radarL.read();
  radarR.read();

  uint32_t now = millis();
  if (now - lastTick < TICK_MS) return;
  lastTick = now;

  if (pendingType && WiFi.status() == WL_CONNECTED) sendAlert(pendingType, pendingMessage);

  int l = radarScore(radarL);
  int r = radarScore(radarR);
  bool seenL = l >= MIN_ENERGY, seenR = r >= MIN_ENERGY;
  bool seen = seenL || seenR;

  if (seen) {
    lastSeenAt = now;
    if (seenSince == 0) seenSince = now;
    // Turn toward the radar that hears the person better. Radar L points
    // left of center, so a stronger left signal means "turn left".
    if (seenL && seenR) {
      int diff = l - r;
      if (abs(diff) > DEADBAND) movePan(constrain(diff * GAIN, -MAX_STEP, MAX_STEP));
    } else {
      movePan(seenL ? MAX_STEP : -MAX_STEP);
    }
    if (state != TRACKING && now - seenSince >= FOUND_CONFIRM_MS) {
      if (state == ALERTED) sendAlert("back_in_view", "Person is back in view.");
      state = TRACKING;
      Serial.println("-> TRACKING");
    }
  } else {
    seenSince = 0;
    uint32_t unseen = now - lastSeenAt;
    if (state == TRACKING && unseen >= LOST_GRACE_MS) {
      state = SEARCHING;
      Serial.println("-> SEARCHING");
    }
    if (state != TRACKING) {
      // Sweep side to side looking for them.
      if (pan >= PAN_MAX) sweepDir = -1;
      if (pan <= PAN_MIN) sweepDir = 1;
      pan = constrain(pan + sweepDir * SWEEP_STEP, PAN_MIN, PAN_MAX);
      panServo.write((int)pan);
    }
    if (state == SEARCHING && unseen >= ALERT_AFTER_MS) {
      state = ALERTED;
      sendAlert("out_of_sight", "Person has been out of sight for a while. Please check on them.");
    }
  }

  // LED: solid = tracking, slow blink = searching, fast blink = alert sent.
  if (state == TRACKING) digitalWrite(LED_PIN, HIGH);
  else digitalWrite(LED_PIN, (now / (state == ALERTED ? 150 : 500)) % 2);

  if (now - lastLog >= 500) {
    lastLog = now;
    const char *names[] = {"TRACKING", "SEARCHING", "ALERTED"};
    Serial.printf("L=%3d R=%3d pan=%3d dist=%3dcm %s WiFi=%s\n", l, r, (int)pan,
                  radarL.presenceDetected() ? radarL.detectionDistance() : radarR.detectionDistance(),
                  names[state], WiFi.status() == WL_CONNECTED ? "on" : "off");
  }
}
