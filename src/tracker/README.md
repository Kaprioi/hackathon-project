# Phone Tracker website (`/tracker`)

Finds people with the phone's camera, follows the one you tap, and drives the stand (pan-tilt motors and the humidifier mist) over Bluetooth. The project plan, hardware and firmware are in `phone-tracker/` (start with `phone-tracker/CLAUDE.md`).

| File | What it does |
|---|---|
| `TrackerPage.tsx` | The page: camera view, boxes, tap to pick, status, mist buttons, front/back camera switch, settings. Laid out for phones either way up (safe areas, big buttons), and works on a PC. Runs the loop once per camera frame. |
| `detector.ts` | Finds people in a frame with Google MediaPipe (EfficientDet-Lite0). Runs on the device; no video leaves it. |
| `brain.ts` | Decides what to do: TRACKING, HIDDEN, FOLLOWING, SEARCHING, LOST, and where to point. No camera or Bluetooth code, so it's testable. |
| `appearance.ts` | The "look": clothing colours of the top and bottom half, used to tell people apart and re-find the target. |
| `lump.ts` | Follows a blanket or box after someone hides under it, by matching a small grey picture of it. |
| `servoModel.ts` | Guesses where the camera is pointing, by copying how the firmware moves the motors. |
| `stand.ts` | Web Bluetooth link to the ESP32: moves, radar readings, mist on/off. |
| `config.ts` | Every setting and tuning number, plus the Bluetooth IDs (must match the firmware). |
| `brain.test.mjs` | Tests with made-up frames, including a simulated room. Run `npm run test:tracker`. |

Each frame: camera → copy 640 on its long side → `detector.ts` → `brain.ts` (with a copy 320 on its long side for colours and the cover tracker) → `stand.ts`. With the phone upright, the page swaps the camera's width and height angles before calling `brain.ts`.
