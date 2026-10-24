# Phone Tracker website (`/tracker`)

Finds people with the phone's camera, follows the one you tap, and drives the stand's pan-tilt motors over Bluetooth. The project plan, hardware and firmware are in `phone-tracker/` (start with `phone-tracker/CLAUDE.md`).

| File | What it does |
|---|---|
| `TrackerPage.tsx` | The page: camera view, boxes, tap to pick, status, front/back camera switch, settings. Laid out for phones either way up (safe areas, big buttons), and works on a PC. Runs the loop once per camera frame. |
| `detector.ts` | Finds people in a frame with Google MediaPipe (EfficientDet-Lite0), each with a confidence. Runs on the device; no video leaves it. The page treats 0.35+ as people and 0.2–0.35 as "weak" shapes that only help keep the current target. |
| `brain.ts` | Decides what to do: TRACKING, HIDDEN, FOLLOWING, SEARCHING, RADAR SEARCH, LOST, and where to point. Also says where it thinks you are while you're out of view ("Out of view - to your left"). No camera or Bluetooth code, so it's testable. |
| `radarGuide.ts` | Turns the radar's loudness into "which way to turn" while you're out of the picture: left vs right with two radars, a stop-and-listen sweep with one. No camera or Bluetooth code. |
| `appearance.ts` | The "look": clothing colours of the top and bottom half, used to tell people apart and re-find the target. |
| `lump.ts` | Follows a blanket or box after someone hides under it, by matching a small grey picture of it. |
| `servoModel.ts` | Guesses where the camera is pointing, by copying how the firmware moves the motors. |
| `stand.ts` | Web Bluetooth link to the ESP32: moves, radar readings (someone there, how loud, how many radars), and the mist switch (unused since the humidifier was dropped). |
| `config.ts` | Every setting and tuning number, plus the Bluetooth IDs (must match the firmware). |
| `events.ts` | Turns each frame's people into a few small text events for the family page (moving/still/nobody/fall, left/middle/right, posture, a heartbeat every minute). No camera code, so it's testable. |
| `cloud.ts` | Sends those events to Supabase: finds your care circle, registers this phone as a `devices` row once, then adds `movement_events` rows. Nothing else is sent. |
| `events.test.mjs` | Tests for `events.ts` with made-up people boxes. |
| `orientation.ts` | Keeps people upright for the AI when the phone is sideways with auto-rotate off: reads which way is up from the motion sensor, and turns points and boxes between the camera's picture and the upright one. |
| `orientation.test.mjs` | Tests for `orientation.ts`. |
| `handheld.ts` | For testing without the stand: reads the gyroscope, so the brain knows when the phone is turned by hand instead of thinking everyone moved. |
| `handheld.test.mjs` | Tests for `handheld.ts`. |
| `faces.ts` | Face recognition: saves face fingerprints of the tapped person (face-api, loaded when the camera starts) and decides whose face to read when; a match re-finds them, a clear mismatch rules someone out. Fingerprints never leave the page's memory. |
| `faces.test.mjs` | Tests for the face-checking rules, with made-up fingerprints. |
| `emergency.ts` | Spots a likely fall or seizure of the tracked person from their box (shape and shaking), for the "Are you OK?" countdown and the pretend emergency call. Not a medical device. |
| `emergency.test.mjs` | Tests for `emergency.ts` with made-up boxes. |
| `brain.test.mjs` | Tests with made-up frames, including a simulated room. Run `npm run test:tracker`. |
| `radar.test.mjs` | Tests for the radar-guided search: a simulated room with a fake radar (walk out left, double back, someone else, radar quiet, Bluetooth drop). |

Each frame: camera → copy 640 on its long side → `detector.ts` → `brain.ts` (with a copy 320 on its long side for colours and the cover tracker) → `stand.ts`, and `detector.ts` → `events.ts` → `cloud.ts` for the family page. With the phone upright, the page swaps the camera's width and height angles before calling `brain.ts`.

## How it works: following you out of the picture with the radar

When you walk out of the camera's view, the phone turns the stand to look for you, using the radar to know which way. The phone is always the one moving the motor; the radar only says where to look, and the camera decides who it is.

1. **You leave the picture.** The phone knows which edge you left by, so it starts turning that way, and the screen says where it thinks you are: "Out of view - to your left" (the words follow what you see on screen, even when the picture is shown mirrored), with an arrow on that side.
2. **The radar points the way** (RADAR SEARCH), if the stand reports how loud the radar hears someone:
   - **One radar facing ahead** (the default): it can't tell left from right on its own, so the head turns about 30° toward the edge you left by, stops, waits a quarter of a second (the radar is confused by its own movement), and listens for a third of a second. While it gets louder, it keeps going. Once it gets quieter, it goes back to the loudest spot and waits there. If that whole side was quiet, it tries the other side. The camera looks at every stop.
   - **Two radars** (left and right): it turns toward the louder one, even if that's not the edge you left by (you doubled back behind something), and stops when they hear about the same, because then you're roughly in front.
3. **The camera says who it is.** If it sees you (by your clothes or your face), it locks back on. If it sees someone else, it says so ("Someone else is there, not you") and carries on looking for you: after a moment it sweeps the room.
4. **It keeps looking while the radar hears someone**, a few times at most (`RADAR.rounds`), so a dog or a fan can't keep it searching forever. Then LOST.
5. **The radar is quiet:** nobody's in the room, so it behaves as it always did: turn the way you went, sweep once, then LOST. If the radar was quiet for a while and then hears someone again, it turns to see who it is.
6. **Bluetooth drops:** the page can't move the motor any more, so the stand's own radar steering takes over by itself (`hardware/firmware/sightline/sightline.ino`).

Settings are in `RADAR` in `config.ts`. The switch for one or two radars is `RADAR.count`, but a stand running the SightLine firmware in this repo says how many it has, and that wins. Set the firmware's `RADAR_COUNT` to match the head.

**Firmware:** the page needs the SightLine sketch in `hardware/firmware/sightline/` (Bluetooth link plus radar). It compiles but has **never been flashed or tested on the real head**. Bench checks before trusting it:

- The serial monitor shows `radar=` numbers that go up when you stand in front of the head, and "Bluetooth: website connected" when the page connects.
- On the page, the "Radar" chip shows the loudness number change as you walk around.
- Walk out of the picture on each side and check the head turns that way. With two radars, wave on one side: the head must turn toward you. If it turns away, flip `RADAR.leftPan` in `config.ts`.
- Close the page while someone is in front of the head: after about 0.7 s the head should start wiggling (one radar) or turning toward the louder radar (two) on its own.

