// Copy this file to secrets.h (same folder) and fill it in.
// secrets.h is ignored by git so your WiFi password never gets committed.
#pragma once

#define DEVICE_NAME "sightline-1"

// WiFi (2.4 GHz only; the ESP32 cannot join 5 GHz networks)
#define WIFI_SSID ""
#define WIFI_PASSWORD ""

// Phone alerts: install the free "ntfy" app, subscribe to a hard-to-guess topic
// name like "sightline-kris-7f3k", and put the same name here. Leave "" to skip.
#define NTFY_TOPIC ""

// Optional: the turret iPhone's FaceTime phone number or Apple ID email,
// e.g. "+15551234567". Tapping the alert on the caregiver's iPhone then
// starts a video call to it. Leave "" to skip.
#define FACETIME_TO ""

// Optional: log events to Supabase so the web app can show them.
// Project Settings > API: copy the Project URL and the anon public key.
#define SUPABASE_URL ""       // e.g. "https://abcd1234.supabase.co"
#define SUPABASE_ANON_KEY ""
