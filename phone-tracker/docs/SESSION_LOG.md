# Session log

Newest entry at the top. Add one entry at the end of every session.

## 2026-10-24 — Wall fix pushed, phone-friendly page

- **Pushed** the wall-hiding fix to PR #6 with Apple's OK (commit `be55d86`).
- **Built (Apple's request):** a phone-friendly `/tracker` page before the phone test.
  - Controls in one bottom bar: Mist (Off / On / Follow me), **Flip** (front/back camera, shown when the device has two), Connect stand, Settings, Full screen (Android and PCs only). Release sits next to the state at the top left; the log folds away behind **Show log**.
  - Camera choice on the start screen (phones). Flipping lets go of the target, because the picture changes completely.
  - The front camera (and a PC webcam) is shown mirrored, like a selfie. Boxes, taps, the FOLLOWING arrow and the Left/Right motor-test buttons follow the mirroring. The tracking brain still sees the unmirrored picture.
  - Taps: only a quick, still touch counts, so a thumb resting on the edge or a drag doesn't pick someone. A ring shows where you tapped; Android buzzes on lock-on.
  - Works either way up. Upright, the page swaps the camera's width and height angles for the brain, and shrinks the AI's copy by its long side (an upright frame used to be almost twice the pixels).
  - Notch and home-bar safe areas, no double-tap zoom, the screen stays on after switching apps, the camera wakes up again after the phone pauses it, plain-words camera errors ("blocked", "busy", "not found"), and a "camera stopped" banner with Restart.
  - The "turn the phone sideways" banner now shows only when a stand is connected (handheld upright is fine).
- **Tested:** type check, 13/13 tests, and the page in Chrome at 390×844 and 844×390 with a fake two-camera feed (a street photo): locking on through the mirrored picture, Flip, camera choice in Settings, drags ignored, Settings sheet, log, the blocked-camera message. Chrome throttled its own window to about 1 fps during the test (it does the same with the page hidden), so speed wasn't measured.
- **Not tested:** a real phone, Full screen, haptics, safe areas on a notched iPhone.
- **Pushed** the phone-friendly page to PR #6 (commit `2c60618`) and started the Cloudflare tunnel for the phone test.
- **One-radar mode** for the SightLine firmware (asked by the 3D-mockup session; the team has one LD2410C, a second is ordered). `RADAR_COUNT` = 0 detects at startup, 1 or 2 forces it. With one (left) radar it only reports presence: the head holds still while it senses the person and sweeps after 2 s without. Before, it turned toward the single radar until it hit the end stop. Build-guide note added. Pushed to PR #7 (commit `2485210`); not compiled.
- **Apple asked:** no face recognition; it goes by clothing colours (top 60%, bottom 40%). After a shirt comes off it keeps following while the box moves smoothly, but won't re-find them by colours later (tap again).
- **Blanket tracking made stronger** (Apple's OK): in HIDDEN, a person shape that stays on the moving cover for 0.5 s is taken as them, whatever its colours (walking around under a blanket). Someone walking past in front slides across the cover and isn't taken. Losing the cover for 1 s while the radar still senses someone stops the camera steering, so a two-radar stand steers by radar; finding the cover again takes it back. The page now syncs its motor model with the stand's reported angle whenever the camera isn't steering. 3 new tests (16 total).
- **Found:** Kris had merged PR #6 at 1:48 AM, before today's commits, then #8 (login, family dashboard) and #10 (movement events to Supabase, including a box-shape "Possible fall"). So today's work combined with `main` on branch `tracker-phone-friendly` in a separate worktree. Only `TrackerPage.tsx` and the tracker README clashed. Kept the phone layout and added Kris's privacy banner, sign-in, "Family sees" line, Stop watching (bar button; Full screen moved to Settings) and larger text. The start screen sizes by screen height, so it fits a sideways phone. 31 tests pass; checked at 390×844 and 844×390 with a fake camera.
- **Decided (Apple):** pitch toward elderly care. "Recognize the face in emergencies" = fall alert + face check (pose-based fall detection on the tracked person, "I'm OK" countdown, family alert, face recognition to confirm who it is). Streaming expressions are a maybe for later.
- **PR #13** opened (tracker-phone-friendly → main). The phone link now serves the combined version (port 5176).
- **First phone test (Apple's Samsung, Chrome):** with three people in view it found two, or one big box around several. Cause: the phone was sideways with auto-rotate off, so the picture reached the AI on its side. Checked on Apple's two screenshots: sideways, the current model (EfficientDet-Lite0) found 2 of 3 at about 0.5 confidence; turned upright it found all 3 (up to 0.85). The bigger Lite2 model found no more and was about 60% slower, so Lite0 stays.
- **Fixed:** `orientation.ts` reads which way is up from the motion sensor (Android; iPhones need a permission, not asked) and the page turns the picture before detection, then turns boxes and taps back. It only turns when the phone turned and the screen didn't, and never 180° on its own. Settings has "Keep people upright for the AI": Auto, or 0/90/180/270 by hand. Kris's posture and left/right zones now use the upright picture too. Checked in Chrome by feeding Apple's sideways screenshot as the camera with a fake sensor reading: three separate boxes, and a tap locked onto the person at the back. 4 new tests (35 total).
- **Hardware (from the 3D-mockup session):** no second radar arrives before the event, so SightLine demos with one. Apple chose a redesigned head with the single radar centered under the phone, facing straight ahead (`radar_phone_head_1radar.stl`, not in the repo yet). Still wired as the "left" radar on GPIO 7/8, so the firmware needs no change. The build-guide note in PR #7 still says "left holder"; reword it when the new STL is added.
- **Second phone test:** detection much better once the picture was turned. Two new problems:
  - Covering the face put a clearly visible person into HIDDEN. The detector's confidence for that pose flickers around the 0.35 cut-off; offline, the same screenshot scored 0.75. Fix: the detector now reports down to 0.2, and those "weak" shapes keep the target where it already is (overlapping its box or cover, colours within the loose limit) for up to 5 s. Weak shapes elsewhere are ignored, not drawn and not sent to the family page.
  - With the target crouched and the phone moved by hand (without a stand the page assumes the camera is still), it took a person in a black hoodie who matched 0.37, just under the 0.38 limit. When the target stood up at 0.23 it didn't switch back, because the switch rule needed a 0.15 lead and this was 0.14. Fix: also switch for a 0.07 lead held for 0.6 s, so one lucky frame can't cause a swap.
  - 4 new tests, two of them built with two-tone clothes that reproduce the 0.36 vs 0.22 case (39 total).
- Possible next step: compensate for the phone being moved by hand, using the gyroscope (the stand already reports its own movement). Not built.
- Next: Apple retests on the phone; Kris merges PR #13; then build the fall alert, and ask before installing a face-recognition library.

## 2026-10-23 (evening) — Website, mist that follows you, SightLine merge

- **Decided:** the software is a website (`/tracker` in the team app, code in `src/tracker/`), opened in Bluefy on the iPhone, because Apple builds on Windows. The Swift app stays as a backup.
- **Decided:** the steam is a humidifier whose mist follows the person (bed to chair, wheelchair users). Nozzle on the head, tank and fan beside the base, MOSFET on pin A0 (GPIO 26). Pin 14 is out (SightLine uses it).
- **Decided:** the hardware is Kris's SightLine head (two radars, iPhone screen-forward, so the website defaults to the front camera). Apple chose to merge it with this project's Bluetooth link; written as a proposal PR for Kris.
- **Built:** the website. Person detection (MediaPipe), tap to lock on, TRACKING / HIDDEN / FOLLOWING / SEARCHING / LOST, a clothing-colour look for re-finding, a cover tracker that follows a moving blanket, mist Off / On / Follow me, Bluetooth to the stand, and a settings panel with motor tests.
- **Tested:** 10 (now 12) automated tests, including a simulated room with a slow motor where the person outruns the stand (`npm run test:tracker`). The full page in Chrome on Apple's PC, with a street photo fed in as the camera: locked on from behind, followed off the edge, swept, re-found by clothes, held HIDDEN. About 8 fps on Intel laptop graphics.
- **Firmware:** the single-radar `.ino` got the mist switch (characteristic `…0004`, off after 3 s without a repeat, off on disconnect). SightLine got Bluetooth + mist in the merge PR. Neither compiled (no Arduino tools on this PC).
- **Coordinated** with the 3D-mockup session: https://claude.ai/artifact/VGajiyE2hiaV4B1B3DpeaD shows SightLine + the mist add-on, with a matching wiring table.
- **360°:** possible with a stepper or multi-turn servo, a slip ring, and mist up the hollow axis. In `docs/DEMO_AND_PITCH.md`.
- **First live test (Apple, PC webcam):** after hiding behind a wall, the box stuck on something nearby and never followed again. Cause: closeness beat looks, the saved look drifted onto the wrong thing within a second or two, and the colour fingerprint scored red, orange and brown as identical. Fixed with a permanent look from the tap, a 1.5 s limit on "sort of" matches after a jump, switching to a clearly better match, and a finer fingerprint. Calibrated on a real street video (same person within 1 s: median 0.16; strangers: median 0.54, 9% under 0.38). The match number now shows on every box. 13 tests.
- **Phone testing:** USB port forwarding to Apple's Samsung failed (Edge sees it but it stays "Pending authentication"; no "Allow USB debugging?" prompt, even with Auto Blocker off). A Cloudflare quick tunnel worked instead (https link; site served on `127.0.0.1:5175`). It was stopped later when the PC ran low on memory. Details in `docs/HANDOFF_2026-10-24.md`.
- Next: commit the wall-hiding fix (needs Apple's OK), a live-webcam retest, the phone test through the tunnel (also the Bluefy camera test on the iPhone), merging #4 and #6, Kris's review of #7, buying the humidifier parts.

## 2026-10-23 — Project moved to Claude Code

- Set up this folder from the claude.ai handoff file (`docs/HANDOFF.md`).
- Next: answer the open questions in `CLAUDE.md`, starting with the iPhone model and case.

## 2026-10-16 to 2026-10-23 — Planning in claude.ai (before this folder existed)

- **Idea:** a pan-tilt camera that tracks a chosen person through turning away and hiding under covers, for SBUHacks 2026.
- **First plan, replaced:** laptop running Python and YOLO, a phone streaming over DroidCam, an Arduino driving MG996R servos on a printed yoke, plus the radar.
- **Partner River's manual** brought the current setup: an iPhone app with Apple Vision, an ESP32 Feather V2 over Bluetooth, and the Lynxmotion kit. Apple edited it to add tap-to-pick, the Hidden and Lost states, the LD2410C radar, and the rear camera.
- **Themed version built and parked:** "Iron Owl" with a brass boiler base and a steam puff on pin 14. The team chose a plain version first.
- **Shopping list trimmed:** print the phone holder instead of buying a clamp; skip the FotodioX tripod kit; swap the carriage bolts for a 1/2" hex bolt; add the missing power supply. About $104.
- **Steam:** the team wants functional steam. The arthritis idea was rejected as tacked on. Ideas: steam shield (top pick), steam room safety, auto follow-spot. Not decided.
- **Earlier visuals** (claude.ai artifacts, private to Apple, open in a browser; Claude Code can't read them):
  - 3D rig model, themed Iron Owl version: https://claude.ai/artifact/Mr5N95FuAARQME94qA2SBg
  - Older 3D rig model (outdated MG996R plan): https://claude.ai/artifact/XCnJdYoqh1iV8dWPrWYm7t
  - App and rig mockups (outdated laptop plan; the four tracking states still apply): https://claude.ai/artifact/DmaFX8LPsGMDNH181ZbjFD
