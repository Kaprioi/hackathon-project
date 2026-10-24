// Phone Tracker stand firmware for the Adafruit ESP32 Feather V2
// Receives "pan,tilt" angles over Bluetooth, moves the two servos,
// and reports the radar's presence signal back to the phone.

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <ESP32Servo.h>

#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define MOVE_UUID    "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define RADAR_UUID   "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

const int PAN_PIN = 27, TILT_PIN = 33;
const int RADAR_PIN = 32;   // LD2410C OUT pin: HIGH while someone is there

Servo pan, tilt;
volatile float panTarget = 90, tiltTarget = 90;
float panNow = 90, tiltNow = 90;

BLECharacteristic *radar;
int lastPresence = -1;
unsigned long lastRadarSend = 0;

// Angles in, microseconds out (HS-422: about 600-2400 us for 0-180 degrees)
int toMicros(float angle) { return 600 + angle * 10.0; }

class MoveCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue();          // e.g. "95,80"
    int comma = v.indexOf(',');
    if (comma < 0) return;
    panTarget  = constrain(v.substring(0, comma).toFloat(), 10, 170);
    tiltTarget = constrain(v.substring(comma + 1).toFloat(), 45, 135);
  }
};

class ConnectionCallback : public BLEServerCallbacks {
  void onDisconnect(BLEServer *s) override { BLEDevice::startAdvertising(); }
};

void setup() {
  pan.attach(PAN_PIN, 600, 2400);
  tilt.attach(TILT_PIN, 600, 2400);
  pinMode(RADAR_PIN, INPUT);

  BLEDevice::init("PhoneTracker");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallback());
  BLEService *service = server->createService(SERVICE_UUID);

  BLECharacteristic *move = service->createCharacteristic(
      MOVE_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  move->setCallbacks(new MoveCallback());

  radar = service->createCharacteristic(
      RADAR_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  radar->addDescriptor(new BLE2902());
  radar->setValue("0");

  service->start();
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
}

void loop() {
  // Move 15% of the remaining distance every 20 ms: fast when far, gentle when close
  panNow  += (panTarget  - panNow)  * 0.15;
  tiltNow += (tiltTarget - tiltNow) * 0.15;
  pan.writeMicroseconds(toMicros(panNow));
  tilt.writeMicroseconds(toMicros(tiltNow));

  // Tell the phone whether the radar senses someone: on every change, and twice a second
  int present = digitalRead(RADAR_PIN);
  if (present != lastPresence || millis() - lastRadarSend > 500) {
    radar->setValue(present ? "1" : "0");
    radar->notify();
    lastPresence = present;
    lastRadarSend = millis();
  }

  delay(20);
}
