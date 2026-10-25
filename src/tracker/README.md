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
| `servoModel.ts` | Guesses where the camera is pointing, by copying how the firmware moves the motors (MOTION in `config.ts`). |
| `stand.ts` | Web Bluetooth link to the ESP32: moves, radar readings (someone there, how loud, how many radars), and the mist switch (unused since the humidifier was dropped). |
| `config.ts` | Every setting and tuning number, plus the Bluetooth IDs (must match the firmware). |
| `events.ts` | Turns each frame's people into a few small text events for the family page (moving/still/nobody/fall, left/middle/right, posture, a heartbeat every 30 seconds). No camera code, so it's testable. |
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
| `cameraPhone.ts` | Remembers that this phone is watching, so when iOS restarts CareNest on the Home Screen (it opens the family page) it goes back to the camera page instead, with a note to tap Start watching. |
| `cameraPhone.test.mjs` | Tests for `cameraPhone.ts`. |
| `savedSettings.ts` | The settings the page starts with: saved ones plus this phone's defaults. Face recognition starts off on iPhones (to save memory), even with older saved settings, until someone switches it in Settings. |
| `savedSettings.test.mjs` | Tests for `savedSettings.ts`. |
| `brain.test.mjs` | Tests with made-up frames, including a simulated room. Run `npm run test:tracker`. |
| `radar.test.mjs` | Tests for the radar-guided search: a simulated room with a fake radar (walk out left, double back, someone else, radar quiet, Bluetooth drop, a laptop webcam beside the stand). |
| `stand.test.mjs` | Tests how often aims are sent to the stand, with a fake Bluetooth stand and a fake clock. |
| `motion.test.mjs` | Tests how smoothly and quickly the stand follows someone walking, stopping and standing still, including with a motor slower than the page thinks. |
| `tiltCheck.ts` | Notices when the up/down motor tilts the wrong way for this stand (away from you instead of toward you), so the brain can flip up/down by itself. |
| `tilt.test.mjs` | Tests following up and down with the iPhone on the stand: standing up, sitting or crouching, coming closer, head kept in the picture, no rocking, the automatic up/down flip, the ±15° limit and going back to level. |

Each frame: camera → copy 640 on its long side → `detector.ts` → `brain.ts` (with a copy 320 on its long side for colours and the cover tracker) → `stand.ts`, and `detector.ts` → `events.ts` → `cloud.ts` for the family page. With the phone upright, the page swaps the camera's width and height angles before calling `brain.ts`.

## How it works: following you out of the picture with the radar

When you walk out of the camera's view, the phone turns the stand to look for you, using the radar to know which way. The phone is always the one moving the motor; the radar only says where to look, and the camera decides who it is.

1. **You leave the picture.** The phone knows which edge you left by, so it starts turning that way, and the screen says where it thinks you are: "Out of view - to your left" (the words follow what you see on screen, even when the picture is shown mirrored), with an arrow on that side.
2. **The radar points the way** (RADAR SEARCH), if the stand reports how loud the radar hears someone:
   - **One radar facing ahead** (the default): it can't tell left from right on its own, so the head turns about 40° toward the edge you left by, stops, waits a fifth of a second (the radar is confused by its own movement), and listens for under a third of a second. While it gets louder, it keeps going. Once it gets quieter, it goes back to the loudest spot and waits there. If that whole side was quiet, it tries the other side. The camera looks at every stop.
   - **Two radars** (left and right): it turns toward the louder one, even if that's not the edge you left by (you doubled back behind something), and stops when they hear about the same, because then you're roughly in front.
3. **The camera says who it is.** If it sees you (by your clothes or your face), it locks back on. If it sees someone else, it says so ("Someone else is there, not you") and carries on looking for you: after a moment it sweeps the room.
4. **It keeps looking while the radar hears someone**, a few times at most (`RADAR.rounds`), so a dog or a fan can't keep it searching forever. Then LOST.
5. **The radar is quiet:** nobody's in the room, so it behaves as it always did: turn the way you went, sweep once, then LOST. If the radar was quiet for a while and then hears someone again, it turns to see who it is.
6. **Only one boss.** While the page is connected over Bluetooth, the stand only moves when the page says so, and holds still otherwise (before you tap someone, or in LOST). Only when Bluetooth drops (page closed, phone out of range) does the stand's own radar steering take over (`hardware/firmware/sightline/sightline.ino`).
7. **Testing with a laptop's webcam** next to the stand: set "Camera turns with the stand" to No (it's Yes by default on every device, because the page assumes it's the iPhone on the stand). Then the motor turns toward you, and when you step out of the webcam's view it points where the radar hears you and stays there, without sweeping the room (the webcam can't see where the motor points).

Settings are in `RADAR` in `config.ts`. The switch for one or two radars is `RADAR.count`, but a stand running the SightLine firmware in this repo says how many it has, and that wins. Set the firmware's `RADAR_COUNT` to match the head.

**Firmware:** the page needs the SightLine sketch in `hardware/firmware/sightline/` (Bluetooth link plus radar). It compiles but has **never been flashed or tested on the real head**. Bench checks before trusting it:

- The serial monitor shows `radar=` numbers that go up when you stand in front of the head, and "Bluetooth: website connected" when the page connects.
- On the page, the "Radar" chip shows the loudness number change as you walk around.
- Walk out of the picture on each side and check the head turns that way. With two radars, wave on one side: the head must turn toward you. If it turns away, flip `RADAR.leftPan` in `config.ts`.
- With the page connected but nobody tapped, the head must hold still (the serial monitor says `steer=website`). Close the page while someone is in front of the head: it should start wiggling (one radar) or turning toward the louder radar (two) on its own (`steer=radar`). Opening the serial monitor resets the board, which drops Bluetooth, so check this with the page reconnected afterwards.

## How it works: who decides where the stand points

**The camera finds people and says who they are.** About 15 times a second the AI finds every person in the picture, and the page tells them apart by their clothes' colours (and their face, if that's on). That gives an exact direction: "you're 12° right of where the stand points". It's the only thing that knows *who* someone is.

**The radar only says "someone's there, this loud".** It doesn't know who, and with one radar it doesn't even know which way. It also hears through blankets and in the dark, when the camera can't see.

| Situation | Who decides where to point |
|---|---|
| **You're in the picture** | The camera, alone. The page aims at your chest, a little ahead of you if you're walking (`leadMs`), and moves the aim on smoothly between camera pictures, up to 40 times a second. The radar is ignored. |
| **You just left the picture** | The camera's last sighting: the stand turns toward the edge you left by. With radar loudness, the radar takes over the turning (RADAR SEARCH): one radar stops and listens every 40°, two radars turn toward the louder one. |
| **Out of view, but the radar hears someone** | The radar points the way; the camera checks every face that comes into view. Only the camera can say "that's you" and lock back on, or "that's someone else" and keep looking. |
| **Nobody (radar quiet, nobody in view)** | Nobody: after looking once (follow, sweep), LOST, and the stand holds still. If the radar hears someone again later, it turns to see who it is. |
| **Bluetooth is gone** | The stand itself, by radar (the firmware's backup steering). |

**Why both matter:** the camera is precise and knows who, but only sees about 65° of the room and nothing in the dark. The radar hears the whole room, through covers, but can't tell people (or a dog) apart. Together, the radar says where to look and the camera says who it is.

**How the motor moves:** every 20 ms the firmware moves each motor a quarter of the remaining way to the page's aim, at most 280°/s left-right and 200°/s up-down, and ignores aims within 0.3° (no twitching). It never swings past the aim. A "speed up, slow down" motor with momentum was tried and made the stand hunt back and forth (the camera always sees a moment late), so `motion.test.mjs` checks for that.

**Up and down** work the same way as left and right: the page aims the tilt motor at your chest (Aim height), so your face stays in the picture. If the top of your box touches the top of the picture (your head may be cut off, say after standing up or coming closer), it aims higher, up to the top of the box, until your head is back in. If the tilt motor is mounted the other way round, the stand tilts away from you; the page notices within about a second, flips "Flip up/down" in Settings by itself and says so in the log. The stand only looks a little up or down: at most 15° from level (`TILT` in `config.ts`), and stays level when you're roughly level. Whenever it isn't following someone it can see (hidden, out of the picture, searching, lost, or nobody picked), it eases back to level within about a second; left and right carry on as before. `tilt.test.mjs` checks all of this.

