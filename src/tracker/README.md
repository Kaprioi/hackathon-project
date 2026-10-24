# Phone Tracker website (`/tracker`)

Finds people with the phone's camera, follows the one you tap, and drives the stand (pan-tilt motors and the humidifier mist) over Bluetooth. The project plan, hardware and firmware are in `phone-tracker/` (start with `phone-tracker/CLAUDE.md`).

| File | What it does |
|---|---|
| `TrackerPage.tsx` | The page: camera view, boxes, tap to pick, status, mist buttons, settings. Runs the loop once per camera frame. |
| `detector.ts` | Finds people in a frame with Google MediaPipe (EfficientDet-Lite0). Runs on the device; no video leaves it. |
| `brain.ts` | Decides what to do: TRACKING, HIDDEN, FOLLOWING, SEARCHING, LOST, and where to point. No camera or Bluetooth code, so it's testable. |
| `appearance.ts` | The "look": clothing colours of the top and bottom half, used to tell people apart and re-find the target. |
| `lump.ts` | Follows a blanket or box after someone hides under it, by matching a small grey picture of it. |
| `servoModel.ts` | Guesses where the camera is pointing, by copying how the firmware moves the motors. |
| `stand.ts` | Web Bluetooth link to the ESP32: moves, radar readings, mist on/off. |
| `config.ts` | Every setting and tuning number, plus the Bluetooth IDs (must match the firmware). |
| `events.ts` | Turns each frame's people into a few small text events for the family page (moving/still/nobody/fall, left/middle/right, posture, a heartbeat every minute). No camera code, so it's testable. |
| `cloud.ts` | Sends those events to Supabase: finds your care circle, registers this phone as a `devices` row once, then adds `movement_events` rows. Nothing else is sent. |
| `events.test.mjs` | Tests for `events.ts` with made-up people boxes. |
| `brain.test.mjs` | Tests with made-up frames, including a simulated room. Run `npm run test:tracker`. |

Each frame: camera → 640-wide copy → `detector.ts` → `brain.ts` (with a 320-wide copy for colours and the cover tracker) → `stand.ts`, and `detector.ts` → `events.ts` → `cloud.ts` for the family page.
