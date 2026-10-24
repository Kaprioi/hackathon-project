# Phone Tracker website (`/tracker`)

Finds people with the phone's camera, follows the one you tap, and drives the stand (pan-tilt motors and the humidifier mist) over Bluetooth. The project plan, hardware and firmware are in `phone-tracker/` (start with `phone-tracker/CLAUDE.md`).

| File | What it does |
|---|---|
| `TrackerPage.tsx` | The page: camera view, boxes, tap to pick, status, mist buttons, front/back camera switch, settings. Laid out for phones either way up (safe areas, big buttons), and works on a PC. Runs the loop once per camera frame. |
| `detector.ts` | Finds people in a frame with Google MediaPipe (EfficientDet-Lite0), each with a confidence. Runs on the device; no video leaves it. The page treats 0.35+ as people and 0.2–0.35 as "weak" shapes that only help keep the current target. |
| `brain.ts` | Decides what to do: TRACKING, HIDDEN, FOLLOWING, SEARCHING, LOST, and where to point. No camera or Bluetooth code, so it's testable. |
| `appearance.ts` | The "look": clothing colours of the top and bottom half, used to tell people apart and re-find the target. |
| `lump.ts` | Follows a blanket or box after someone hides under it, by matching a small grey picture of it. |
| `servoModel.ts` | Guesses where the camera is pointing, by copying how the firmware moves the motors. |
| `stand.ts` | Web Bluetooth link to the ESP32: moves, radar readings, mist on/off. |
| `config.ts` | Every setting and tuning number, plus the Bluetooth IDs (must match the firmware). |
| `events.ts` | Turns each frame's people into a few small text events for the family page (moving/still/nobody/fall, left/middle/right, posture, a heartbeat every minute). No camera code, so it's testable. |
| `cloud.ts` | Sends those events to Supabase: finds your care circle, registers this phone as a `devices` row once, then adds `movement_events` rows. Nothing else is sent. |
| `events.test.mjs` | Tests for `events.ts` with made-up people boxes. |
| `orientation.ts` | Keeps people upright for the AI when the phone is sideways with auto-rotate off: reads which way is up from the motion sensor, and turns points and boxes between the camera's picture and the upright one. |
| `orientation.test.mjs` | Tests for `orientation.ts`. |
| `brain.test.mjs` | Tests with made-up frames, including a simulated room. Run `npm run test:tracker`. |

Each frame: camera → copy 640 on its long side → `detector.ts` → `brain.ts` (with a copy 320 on its long side for colours and the cover tracker) → `stand.ts`, and `detector.ts` → `events.ts` → `cloud.ts` for the family page. With the phone upright, the page swaps the camera's width and height angles before calling `brain.ts`.
