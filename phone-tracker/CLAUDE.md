# Phone Tracker (SBUHacks 2026)

A motorized stand that holds an iPhone and keeps one chosen person in the shot, even when they turn their back or hide under a blanket or box. Built by Apple and partner River for SBUHacks 2026 at Stony Brook University. Planned in claude.ai from Oct 16 to Oct 23, 2026; this folder is where every Claude Code session continues it.

## How to work with Apple

- Apple mainly writes Luau (Roblox) and is newer to C++ and Swift. Explain every code change in plain words: what changed, why, and how to test it.
- Give concrete, numbered steps Apple can follow exactly. Recommend one option instead of listing open-ended choices.
- When you need to ask something, use the multiple-choice question tool, not a plain-text question.
- When unsure what Apple means, ask before building or redesigning.
- Ask before installing anything, buying anything, or committing to git.
- For hardware, say what's verified and what's an estimate, and name the test that would confirm it.

## End of every session

1. Add a dated entry to `docs/SESSION_LOG.md`: what changed, what was decided, what's next.
2. Update the Status, Open questions and Next steps sections below.
3. When a decision changes, move it into Decisions or Ruled out, and update every file it touches.

## Event

- SBUHacks 2026, Stony Brook University. Theme: "Steel and Steam". The project is deliberately not Roblox-related, because judges may not know Roblox.
- Length unclear: Stony Brook's CS page says 24 hours and sbuhacks.org says 48. The plan assumes 36. Date not confirmed.
- Most hackathons allow hardware bought and printed beforehand but want code written at the event. Check the rules; if so, treat the code here as a reference.

## Decisions (locked)

1. River's setup: the iPhone runs the AI and the app; an Adafruit ESP32 Feather V2 moves the motors and talks to the phone over Bluetooth. No laptop in the loop.
2. The iPhone's rear camera, not the front one.
3. Lynxmotion Pan and Tilt Kit (BPT-KT) with its two Hitec HS-422 servos, as sold.
4. LD2410C radar (the C version) confirms someone is still under a cover. It's wired to the ESP32 and reported to the phone.
5. Print the phone holder and base box instead of buying a clamp and a board.
6. Plain version first. No steampunk styling until the plain version works.
7. Any steam in the build must be functional and tied to what the camera does, not decoration. See `docs/STEAM.md`.
8. Name: Phone Tracker. Bluetooth name: `PhoneTracker`.

## Ruled out (don't bring back unless Apple asks)

- The first plan: laptop + Python + YOLO + Arduino + DroidCam.
- MG996R servos, a generic metal bracket, metal servo horns, a lazy susan bearing.
- 3D-printing the pan-tilt brackets: printed brackets wobble, and wobble makes the tracking jitter.
- "360°" or "continuous rotation" servos: they can't hold an angle.
- LD2410 and LD2410B radars: 1.27 mm pins that need soldering.
- An Arduino Uno in place of the ESP32: no Bluetooth to the iPhone.
- The FotodioX clamp or tripod kit. The $5.95 clamp alone is a fallback only if the printed holder fails.
- 1-1/2" carriage bolts: too long, and nothing to grip while tightening.
- Steam used for something unrelated to the camera, such as soothing arthritic hands.

## Architecture

| Part | Job | Connection |
|---|---|---|
| iPhone, rear camera | Sees, runs the AI, decides where to point | Bluetooth to the ESP32 |
| Adafruit ESP32 Feather V2 | Moves the servos, reads the radar | USB-C to the Mac, for uploading only |
| Pan servo (HS-422) | Left and right | Signal to ESP32 pin 27 |
| Tilt servo (HS-422) | Up and down | Signal to ESP32 pin 33 |
| LD2410C radar | OUT pin goes HIGH while someone is there | OUT to ESP32 pin 32 |
| 5V 4A supply + DC jack adapter | Powers both servos and the radar through the breadboard rails | Never power the motors from the ESP32 |

- All grounds join the breadboard's – rail, including the ESP32's GND. Without a shared ground the motors twitch.
- The radar mounts on the phone holder, facing the same way as the rear camera.
- The phone sits sideways (landscape), centered over the tilt axle.

**Bluetooth protocol**
- Service UUID `6e400001-b5a3-f393-e0a9-e50e24dcca9e`.
- Move characteristic `…0002` (write): text `pan,tilt` such as `90,90`. The firmware limits pan to 10–170° and tilt to 45–135°, and eases toward each target by 15% every 20 ms.
- Radar characteristic `…0003` (notify): `1` or `0`, sent on every change and twice a second.

**App states** (in `app/PhoneTrackerApp.swift`)
- TAP A PERSON: boxes around everyone in view; tap one to pick them.
- TRACKING: follows that person's body, so it keeps working when they turn away.
- HIDDEN: the person vanished where they stood and nobody left. Follows the cover if it moves; the radar confirms someone's inside.
- LOST: the cover went still and the radar read empty for `lostAfter` seconds. Compares everyone in view with the saved look and locks back on when one matches.

Vision tools used: `VNDetectHumanRectanglesRequest`, `VNTrackObjectRequest`, `VNGenerateImageFeaturePrintRequest`.

Tuning constants at the top of the app: `panSign`/`tiltSign` 1 (flip to -1 if a motor goes the wrong way), `strength` 8, `deadZone` 0.06, `framesBeforeHidden` 10, `lostAfter` 4 s, `matchLimit` 0.6.

**Keep firmware and app in sync.** If you change a pin, a UUID, the command format or the angle limits, change both files and this section in the same session.

## Useful numbers

- Servos: 180° per axis; keep tilt to about ±45° in practice.
- Radar: rated 0.75–6 m, a cone of about ±60°, distance in 0.75 m steps. Plan on about 3 m for a still person under a blanket (an estimate). Cap its range at about 3 m in the HLKRadarTool app.
- Camera at 1080p (estimates): faces about 5 m, clothes matching about 15 m, body tracking about 20 m.

## Files

- `CLAUDE.md`: this file, loaded every session.
- `firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino`: ESP32 firmware. Arduino IDE needs the sketch folder and the .ino to share a name.
- `app/PhoneTrackerApp.swift`: the whole iPhone app in one file. When the Xcode project is created, save it inside `app/` and keep only one copy of this file.
- `print/README.md`: what to 3D-print and the requirements for each part.
- `docs/SHOPPING_LIST.md`: what to buy, where, prices, what to skip.
- `docs/BUILD_STEPS.md`: the step-by-step build, wiring, upload, test and tuning guide, plus troubleshooting.
- `docs/DEMO_AND_PITCH.md`: the 36-hour plan, demo script, judge Q&A.
- `docs/STEAM.md`: steam ideas that tie into the tracking, and the parked theme look.
- `docs/SESSION_LOG.md`: one entry per session.
- `docs/HANDOFF.md`: the original handoff from claude.ai, kept for reference.
- `docs/manuals/`: PDF build manuals, if Apple copied them in.

## Status (as of Oct 23, 2026)

- Plan: locked. Plain version first.
- Parts: carts were nearly final on Oct 17. Which orders were placed is unknown.
- Firmware: passed a syntax check against stand-in libraries. Never run on hardware.
- App: never compiled. Expect about an hour of fixes in Xcode.
- Printed parts: not designed yet.
- Steam: must be functional. Top candidate is the steam shield in `docs/STEAM.md`. Not decided.

## Open questions

1. Which iPhone model goes on the rig, and does it stay in a case? This blocks the printed holder.
2. Which orders were placed? Tick them in `docs/SHOPPING_LIST.md`.
3. Does Apple's Arduino kit include a breadboard, male/male jumper wires, and male/female jumper wires at least 30 cm long?
4. What are the event's real length, date and rules on pre-built hardware and code?
5. Which steam direction: the steam shield, steam room safety, or something else?

## Next steps

1. Finish ordering parts.
2. Answer open question 1, then design and print the phone holder and base box.
3. Decide the steam direction and add it to the firmware, app and docs.
4. When the parts arrive, follow `docs/BUILD_STEPS.md` steps 1–11.
5. Build the app in Xcode (steps 12–16), then tune (steps 17–20).
6. Rehearse the demo at least 5 times.
