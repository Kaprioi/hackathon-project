// SightLine: a pan-tilt head with an LD2410C radar that keeps a person in
// view and sends an alert when they have been out of sight for too long.
// One radar facing straight ahead (the default, see RADAR_COUNT) finds direction
// by wiggling the head and listening for which side hears the person better;
// two radars (left + right) compare left and right.
//
// UNTESTED ON HARDWARE: this sketch compiles (arduino-cli, esp32 core 3.3.12,
// Adafruit Feather ESP32 V2) but has never been flashed or run. It is the
// Bluetooth version from the sightline-bluetooth-mist branch with main's
// one-radar wiggle added, and the radar count added to the Bluetooth report.
// Check the serial monitor and the bench checks in src/tracker/README.md
// before trusting it.
//
// Also talks Bluetooth to the Phone Tracker website (the /tracker page in this
// repo, running on the iPhone in the Bluefy browser):
//   - The website is the boss of the motors while it sends "pan,tilt" aims: when
//     it can see the person, and also when it turns toward where the radar hears
//     them (it reads the radar loudness below). When the aims stop for
//     CAMERA_HOLD_MS (person lost, page closed) or Bluetooth drops, the radars
//     steer again on their own, exactly as before.
//   - The website switches the humidifier mist on and off (pin A0; the
//     humidifier was dropped, so the website keeps it off).
//   - The head reports radar readings and its angle back to the website.
// Bluetooth IDs and angle limits must match src/tracker/config.ts.
//
// Board:  Adafruit ESP32 Feather V2 (Tools > Board > "Adafruit Feather ESP32 V2")
// Libs:   "ESP32Servo" by Kevin Harrington, "ld2410" by ncmreynolds
//         (Bluetooth is built into the ESP32 board package)
// Setup:  copy secrets.example.h to secrets.h and fill it in.
// If upload says "Sketch too big": Tools > Partition Scheme > one with a bigger
// app (Bluetooth + WiFi together are large).

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <ld2410.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
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
const int MIST_PIN = 26;    // Feather "A0"      -> MOSFET module signal: HIGH = mist maker + fan on
                            // (not 14: the right radar uses it, and it can pulse during boot)

// ---------- Radars fitted ----------
// 1 = one radar facing straight ahead, wired to the "left" pins (pins 32 and 14
//     stay free). The default: the SightLine head on main has one.
// 2 = left + right radars, always.
// 0 = decide at startup: two if the right radar answers, otherwise one.
// The website learns the count from the Bluetooth report, so it needs no change.
const int RADAR_COUNT = 1;

// ---------- Tuning ----------
// Widened from 20-160 to 10-170 to match the website (160 degrees of pan).
// If the cables or the radar mount can't take it, change both this line and
// LIMITS in src/tracker/config.ts.
const int PAN_MIN = 10, PAN_MAX = 170, PAN_CENTER = 90;  // degrees
const int TILT_MIN = 45, TILT_MAX = 135;                  // degrees, camera steering only
const int TILT_LEVEL = 90;          // straight ahead; lower = look down
const int PAN_DIRECTION = 1;        // set to -1 if the head turns the wrong way
const int MIN_ENERGY = 15;          // 0-100; below this a radar "sees nobody"
const int DEADBAND = 8;             // ignore left/right differences smaller than this
const float GAIN = 0.08;            // degrees of turn per point of energy difference
const float MAX_STEP = 3.0;         // fastest turn per control tick (degrees)
const float SWEEP_STEP = 1.2;       // search speed per control tick (degrees)
// One radar: wiggle the head to either side, listen, step toward the louder side.
const float WIGGLE_DEG = 8;         // how far each wiggle turns from center (degrees)
const uint32_t WIGGLE_SETTLE_MS = 250;   // wait for the head to stop before listening
const uint32_t WIGGLE_LISTEN_MS = 350;   // how long to listen on each side
const float WIGGLE_GAIN = 0.2;      // degrees of turn per point of energy difference
const float WIGGLE_MAX_STEP = 6;    // biggest step toward the person per wiggle (degrees)
const uint32_t TICK_MS = 50;        // control loop period (20 Hz)
const uint32_t LOST_GRACE_MS = 2000;     // start searching after this long unseen
const uint32_t ALERT_AFTER_MS = 20000;   // alert after this long unseen
const uint32_t FOUND_CONFIRM_MS = 1000;  // must be seen this long to count as "back"

// ---------- Bluetooth link to the Phone Tracker website ----------
#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define MOVE_UUID    "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // website writes "pan,tilt"
#define RADAR_UUID   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // we notify "presence,left,right,pan,tilt"
#define MIST_UUID    "6e400004-b5a3-f393-e0a9-e50e24dcca9e"  // website writes "1" (on) or "0" (off)
const uint32_t CAMERA_HOLD_MS = 700;     // camera steers while its aims keep arriving this often
const uint32_t CAMERA_TICK_MS = 20;      // camera steering: move 15% of the way every 20 ms
const float CAMERA_EASE = 0.15;          // (the website's motor model assumes exactly this)
const uint32_t MIST_TIMEOUT_MS = 3000;   // no "1" from the website for this long: mist off (safety)
const uint32_t REPORT_MS = 100;          // send radar readings and the head angle 10 times a second

ld2410 radarL, radarR;
int radarCount = 2;  // how many radars are in use; decided in setup()
Servo panServo, tiltServo;

enum State { TRACKING, SEARCHING, ALERTED };
State state = TRACKING;
float pan = PAN_CENTER;
float tilt = TILT_LEVEL;
float sweepDir = 1;
uint32_t lastSeenAt = 0, seenSince = 0, lastTick = 0, lastLog = 0;
uint32_t lastCameraTick = 0, lastReport = 0;

// Written by the Bluetooth callbacks, read by loop().
volatile float cameraPan = PAN_CENTER, cameraTilt = TILT_LEVEL;
volatile uint32_t lastCameraMove = 0;    // 0 = the website hasn't steered yet
volatile bool mistWanted = false;
volatile uint32_t lastMistCommand = 0;
BLECharacteristic *radarReport = nullptr;

// Angles in, microseconds out (HS-422: about 600-2400 us for 0-180 degrees).
int toMicros(float angle) { return 600 + angle * 10.0; }

// One-radar tracking (from main): look a little to one side, then the other, and
// move the center toward whichever side heard the person more strongly.
struct {
  bool active = false;
  int side = 1;        // +1 or -1: which side of center we're looking at
  uint32_t start = 0;
  float sum = 0;
  int count = 0;
  float firstSide = 0; // average energy heard on the +1 side
  float center = PAN_CENTER;
} wig;

void wiggleTo(int side, uint32_t now) {
  wig.side = side;
  wig.start = now;
  wig.sum = 0;
  wig.count = 0;
  pan = constrain(wig.center + side * WIGGLE_DEG, PAN_MIN, PAN_MAX);
  panServo.writeMicroseconds(toMicros(pan));
}

void wiggleStep(uint32_t now, int energy) {
  if (!wig.active) {
    wig.active = true;
    wig.center = pan;
    wiggleTo(1, now);
    return;
  }
  uint32_t t = now - wig.start;
  if (t < WIGGLE_SETTLE_MS) return;  // the radar sees its own motion while turning
  wig.sum += energy;
  wig.count++;
  if (t < WIGGLE_SETTLE_MS + WIGGLE_LISTEN_MS) return;
  float avg = wig.sum / wig.count;
  if (wig.side == 1) {
    wig.firstSide = avg;
    wiggleTo(-1, now);
    return;
  }
  float diff = wig.firstSide - avg;  // positive: the +1 side heard them better
  if (fabs(diff) > DEADBAND) {
    float step = constrain(diff * WIGGLE_GAIN, -WIGGLE_MAX_STEP, WIGGLE_MAX_STEP);
    wig.center = constrain(wig.center + step, PAN_MIN, PAN_MAX);
  }
  wiggleTo(1, now);
}

// Strongest signal one radar reports (0 when it sees nobody).
int radarScore(ld2410 &r) {
  if (!r.presenceDetected()) return 0;
  int moving = r.movingTargetDetected() ? r.movingTargetEnergy() : 0;
  int still = r.stationaryTargetDetected() ? r.stationaryTargetEnergy() : 0;
  return max(moving, still);
}

void movePan(float delta) {
  pan = constrain(pan + delta * PAN_DIRECTION, PAN_MIN, PAN_MAX);
  panServo.writeMicroseconds(toMicros(pan));
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

// ---------- Bluetooth: the Phone Tracker website ----------

class MoveCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue();          // e.g. "95.0,80.0"
    int comma = v.indexOf(',');
    if (comma < 0) return;
    cameraPan = constrain(v.substring(0, comma).toFloat(), PAN_MIN, PAN_MAX);
    cameraTilt = constrain(v.substring(comma + 1).toFloat(), TILT_MIN, TILT_MAX);
    lastCameraMove = millis() | 1;     // never 0, which means "not steering"
  }
};

class MistCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue();          // "1" = on, "0" = off
    mistWanted = v.length() > 0 && v.charAt(0) == '1';
    lastMistCommand = millis();
  }
};

class ConnectionCallback : public BLEServerCallbacks {
  void onConnect(BLEServer *s) override { Serial.println("Bluetooth: website connected"); }
  void onDisconnect(BLEServer *s) override {
    Serial.println("Bluetooth: website disconnected");
    mistWanted = false;                // phone gone: no mist
    lastCameraMove = 0;                // and the radars steer again right away
    BLEDevice::startAdvertising();
  }
};

void setupBluetooth() {
  BLEDevice::init("PhoneTracker");     // the name the website and LightBlue look for
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallback());
  BLEService *service = server->createService(SERVICE_UUID);

  BLECharacteristic *move = service->createCharacteristic(
      MOVE_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  move->setCallbacks(new MoveCallback());

  radarReport = service->createCharacteristic(
      RADAR_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  radarReport->addDescriptor(new BLE2902());
  radarReport->setValue("0,0,0,90.0,90.0,1");

  BLECharacteristic *mist = service->createCharacteristic(
      MIST_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  mist->setCallbacks(new MistCallback());

  service->start();
  BLEAdvertising *ad = BLEDevice::getAdvertising();
  ad->addServiceUUID(SERVICE_UUID);
  ad->setScanResponse(true);           // the name goes in the scan response, so the long UUID fits
  BLEDevice::startAdvertising();
  Serial.println("Bluetooth: advertising as PhoneTracker");
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
  tilt = TILT_LEVEL;
}

void setup() {
  // Mist off before anything else, so it never sprays during startup.
  pinMode(MIST_PIN, OUTPUT);
  digitalWrite(MIST_PIN, LOW);

  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  Serial1.begin(256000, SERIAL_8N1, RADAR_L_RX, RADAR_L_TX);
  if (RADAR_COUNT != 1) Serial2.begin(256000, SERIAL_8N1, RADAR_R_RX, RADAR_R_TX);
  delay(500);
  Serial.println(radarL.begin(Serial1) ? "Left radar OK" : "Left radar NOT found - check wiring");
  bool rightOk = false;
  if (RADAR_COUNT != 1) {
    rightOk = radarR.begin(Serial2);
    if (rightOk) Serial.println("Right radar OK");
    else if (RADAR_COUNT == 2) Serial.println("Right radar NOT found - check wiring");
    else Serial.println("Right radar not found");
  }
  radarCount = (RADAR_COUNT == 1 || RADAR_COUNT == 2) ? RADAR_COUNT : (rightOk ? 2 : 1);
  if (radarCount == 1 && RADAR_COUNT != 1) Serial2.end();  // leave pins 32 and 14 free
  Serial.printf("Radar mode: %d radar%s (%s)\n", radarCount, radarCount == 1 ? "" : "s",
                RADAR_COUNT == 0 ? "detected at startup" : "set by RADAR_COUNT");
  if (radarCount == 1) {
    Serial.println("  One radar: when the website isn't steering, the head wiggles and listens");
    Serial.println("  to find which side hears them better, and sweeps after 2 s without.");
    if (RADAR_COUNT == 0) Serial.println("  Have two radars? Check the right radar's wiring, or set RADAR_COUNT to 2.");
  }

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  panServo.setPeriodHertz(50);
  tiltServo.setPeriodHertz(50);
  panServo.attach(PAN_PIN, 600, 2400);   // HS-422 pulse range
  tiltServo.attach(TILT_PIN, 600, 2400);
  selfTest();

  setupBluetooth();
  connectWifi();
  lastSeenAt = millis();
}

void loop() {
  // The radars stream data constantly; read() must run every loop.
  radarL.read();
  if (radarCount == 2) radarR.read();

  uint32_t now = millis();

  // Mist: on only while the website keeps asking for it.
  bool mistOn = mistWanted && (int32_t)(now - lastMistCommand) < (int32_t)MIST_TIMEOUT_MS;
  digitalWrite(MIST_PIN, mistOn ? HIGH : LOW);

  // Camera steering: while the website's aims keep arriving, follow them smoothly.
  uint32_t cameraAt = lastCameraMove;
  bool cameraSteering = cameraAt != 0 && (int32_t)(now - cameraAt) < (int32_t)CAMERA_HOLD_MS;
  if (cameraSteering && now - lastCameraTick >= CAMERA_TICK_MS) {
    lastCameraTick = now;
    pan += (cameraPan - pan) * CAMERA_EASE;
    tilt += (cameraTilt - tilt) * CAMERA_EASE;
    panServo.writeMicroseconds(toMicros(pan));
    tiltServo.writeMicroseconds(toMicros(tilt));
  }

  if (now - lastTick < TICK_MS) return;
  lastTick = now;

  if (pendingType && WiFi.status() == WL_CONNECTED) sendAlert(pendingType, pendingMessage);

  int l = radarScore(radarL);
  int r = radarCount == 2 ? radarScore(radarR) : 0;  // one radar: the website always gets right = 0
  bool seenL = l >= MIN_ENERGY, seenR = r >= MIN_ENERGY;
  // The website's camera steering counts as "in view" too, for the alerts.
  bool seen = seenL || seenR || cameraSteering;

  // Tell the website what the radars sense, where the head points, and how many
  // radars there are: "presence,left,right,pan,tilt,radars".
  if (radarReport && now - lastReport >= REPORT_MS) {
    lastReport = now;
    char text[48];
    snprintf(text, sizeof(text), "%d,%d,%d,%.1f,%.1f,%d", (seenL || seenR) ? 1 : 0, l, r, pan, tilt, radarCount);
    radarReport->setValue(text);
    radarReport->notify();
  }

  if (seen) {
    lastSeenAt = now;
    if (seenSince == 0) seenSince = now;
    // Two radars: turn toward the one that hears the person better. Radar L
    // points left of center, so a stronger left signal means "turn left".
    // (Skipped while the website is steering: it's the boss then.)
    // One radar: the wiggle below.
    if (!cameraSteering && radarCount == 2) {
      if (seenL && seenR) {
        int diff = l - r;
        if (abs(diff) > DEADBAND) movePan(constrain(diff * GAIN, -MAX_STEP, MAX_STEP));
      } else {
        movePan(seenL ? MAX_STEP : -MAX_STEP);
      }
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
      wig.active = false;
      Serial.println("-> SEARCHING");
    }
    if (state != TRACKING) {
      // Sweep side to side looking for them.
      if (pan >= PAN_MAX) sweepDir = -1;
      if (pan <= PAN_MIN) sweepDir = 1;
      pan = constrain(pan + sweepDir * SWEEP_STEP, PAN_MIN, PAN_MAX);
      panServo.writeMicroseconds(toMicros(pan));
    }
    if (state == SEARCHING && unseen >= ALERT_AFTER_MS) {
      state = ALERTED;
      sendAlert("out_of_sight", "Person has been out of sight for a while. Please check on them.");
    }
  }

  // One radar: keep wiggling while tracking by radar, including the short grace
  // period after a brief miss, so the head keeps homing in on the person. While
  // the website steers, stop, and start afresh from wherever it left the head.
  if (cameraSteering) wig.active = false;
  else if (radarCount == 1 && state == TRACKING) wiggleStep(now, l);

  // LED: solid = tracking, slow blink = searching, fast blink = alert sent.
  if (state == TRACKING) digitalWrite(LED_PIN, HIGH);
  else digitalWrite(LED_PIN, (now / (state == ALERTED ? 150 : 500)) % 2);

  if (now - lastLog >= 500) {
    lastLog = now;
    const char *names[] = {"TRACKING", "SEARCHING", "ALERTED"};
    Serial.printf("L=%3d R=%3d pan=%3d dist=%3dcm %s WiFi=%s steer=%s mist=%s\n", l, r, (int)pan,
                  (radarCount == 1 || radarL.presenceDetected()) ? radarL.detectionDistance() : radarR.detectionDistance(),
                  names[state], WiFi.status() == WL_CONNECTED ? "on" : "off",
                  cameraSteering ? "camera" : "radar", mistOn ? "on" : "off");
  }
}
