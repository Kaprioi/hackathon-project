# Phone Tracker (SBUHacks 2026)

A motorized stand that holds an iPhone and keeps one chosen person in view as they move around the room, pitched for elderly care (the family sees short updates; a fall alert is planned). It keeps working when they turn their back, hide under a blanket or box, or walk out of the picture. Built by Apple and partner River for SBUHacks 2026 at Stony Brook University, with teammate Kris's SightLine radar head as the hardware. Planned in claude.ai from Oct 16 to Oct 23, 2026; this folder is where every Claude Code session continues it.

## How to work with Apple

- Apple mainly writes Luau (Roblox) and is newer to C++, Swift and TypeScript. Explain every code change in plain words: what changed, why, and how to test it.
- Apple builds the software on a Windows PC. The team has a Mac, but Apple doesn't use it day to day.
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

- SBUHacks 2026, Stony Brook University. Theme: "Steel and Steam". The project is deliberately not Roblox-related, because judges may not know Roblox. The mist that followed the person was the "steam" part; it was dropped on Oct 24, so the theme fit needs a new answer (open question 7).
- Length unclear: Stony Brook's CS page says 24 hours and sbuhacks.org says 48. The plan assumes 36. Date not confirmed.
- Most hackathons allow hardware bought and printed beforehand but want code written at the event. Check the rules; if so, treat the code here as a reference.

## Decisions (locked)

1. **The software is a website**, the `/tracker` page of the team web app (code in `../src/tracker/`). The iPhone runs the AI in the page and talks to the ESP32 over Bluetooth. No laptop in the loop. On the iPhone it runs in the free **Bluefy** browser, because Safari can't use Bluetooth from a website. On a PC it runs in Chrome or Edge. Chosen Oct 23 because Apple builds on Windows. The Swift app in `app/` is a backup only.
2. Which phone camera faces the person is a setting on the page (start screen, Settings, or the **Flip** button). The default is the **front** camera, because SightLine mounts the phone screen-forward (it was the rear camera in the first plan). The front camera is shown mirrored, like a selfie; the tracking brain always works on the unmirrored picture.
3. Lynxmotion Pan and Tilt Kit (BPT-KT) with its two Hitec HS-422 servos, as sold.
4. **Hardware: Kris's SightLine head** (branch `hardware-build-guide`, `hardware/` in the repo): two LD2410C radars angled 25° left and right, the iPhone on a backplate above them, WiFi alerts. Chosen Oct 23. Merging it with this project's Bluetooth link is proposed in a pull request for Kris to review. The single-radar Phone Tracker stand (`firmware/PhoneTracker_ESP32`) still works with the website as a fallback.
5. Print the phone holder and base box instead of buying a clamp and a board.
6. Plain version first. No steampunk styling until the plain version works.
7. **No humidifier** (Oct 24): the parts can't be obtained. The page has no mist controls. The firmware keeps its mist switch (Bluetooth `…0004`, pin A0) so website and firmware still match, but nothing turns it on.
8. **Elderly-care pitch** (Oct 24). For emergencies, Apple chose "fall alert + face check". Both are built (Oct 24). Face recognition uses `@vladmandic/face-api` 1.7.15 (Apple approved the install). The emergency alert (`emergency.ts`): a fall (standing, then lying, i.e. a clearly flat box under 0.6 high/wide, within 4 s, still lying 3 s later) or a possible seizure (lying, with the box's width or height swinging by at least 10% of the person's size 5 times within 3 s; position changes don't count, so a shaking camera doesn't) shows "Are you OK?" with a 15 s countdown and an "I'm OK" button. Then a pretend "Calling emergency services…" screen with a ringing sound; it never dials a real number. The family page gets a "fall" event (its database has no "seizure" kind yet: Kris's area). Settings → Test the alert, for rehearsals. A rough guess from the box shape, not a medical device.
9. **The phone on the stand is Apple's Samsung Galaxy S22** in Chrome (Oct 24, relayed by the 3D-mockup session): out of its case, sideways, screen and front camera facing the person, in a printed clip-in holder (`radar_phone_head_s22.stl`). No Bluefy, no FaceTime. The page needs no changes for it: set Front camera and run the motor test once.
9. Name: Phone Tracker. Bluetooth name: `PhoneTracker`.
10. Pan range 10–170° (160°, enough for this build). The pitch says 360° is possible with better hardware (see `docs/DEMO_AND_PITCH.md`).

## Ruled out (don't bring back unless Apple asks)

- The first plan: laptop + Python + YOLO + Arduino + DroidCam.
- A native-app-only plan: it can only be built on the Mac, and Apple works on Windows. (The Swift file stays as a backup.)
- A plain website in Safari: no Web Bluetooth on iPhone.
- MG996R servos, a generic metal bracket, metal servo horns, a lazy susan bearing.
- 3D-printing the pan-tilt brackets: printed brackets wobble, and wobble makes the tracking jitter.
- "360°" or "continuous rotation" hobby servos for this build: they can't report or hold an angle. A real 360° version needs position feedback (see the pitch notes).
- LD2410 and LD2410B radars: 1.27 mm pins that need soldering.
- An Arduino Uno in place of the ESP32: no Bluetooth to the iPhone.
- The FotodioX clamp or tripod kit. The $5.95 clamp alone is a fallback only if the printed holder fails.
- 1-1/2" carriage bolts: too long, and nothing to grip while tightening.
- Steam used for something unrelated to the camera, such as soothing arthritic hands.
- The steam shield (fogging a tote around a valuable) and the steam-room alarm: replaced by the mist that follows you.
- Pin 14 for the mist switch.
- The humidifier whose mist follows the person (Oct 24: parts not obtainable), with its MOSFET on pin A0, the tank and fan beside the base, and the nozzle arm. `docs/STEAM.md` is kept for history.
- The water tank on the moving head: too heavy for the tilt servo.

## Architecture

| Part | Job | Connection |
|---|---|---|
| iPhone running the `/tracker` website in Bluefy | Sees, runs the AI, decides where to point | Bluetooth to the ESP32 |
| Adafruit ESP32 Feather V2 | Moves the servos, reads the radar(s) | USB-C to a PC for uploading; a phone charger for the demo |
| Pan servo (HS-422) | Left and right | Signal to pin 27 |
| Tilt servo (HS-422) | Up and down | Signal to pin 33 |
| Radar, SightLine: 2 × LD2410C over serial | Presence and which side is stronger | Left on RX/TX (GPIO 7/8), right on 32/14. **The event build has one radar** (no second one arrives in time): wired as the "left" radar on GPIO 7/8, but mounted centered under the phone, facing straight ahead, in a one-radar head (`radar_phone_head_1radar.stl`, from the 3D-mockup session; not in the repo yet). The firmware sees one radar at startup (`RADAR_COUNT` = auto) and then only reports presence |
| Radar, single-radar fallback: 1 × LD2410C | OUT pin HIGH while someone is there | OUT to pin 32 |
| 5V 4A supply + DC jack adapter | Powers servos and radars through the breadboard rails | Never from the ESP32. Worst case about 2.2 A (estimate) |

- All grounds join the breadboard's – rail, including the ESP32's GND. Without a shared ground the motors twitch.
- The radars face the same way as the camera that faces the person.
- The phone sits sideways (landscape), centered over the tilt axle.

**Bluetooth protocol** (website `../src/tracker/stand.ts` and `config.ts`; firmware `.ino`)
- Service UUID `6e400001-b5a3-f393-e0a9-e50e24dcca9e`.
- Move `…0002` (write): text `pan,tilt` such as `90,90`. Pan is limited to 10–170° and tilt to 45–135°, and the firmware eases toward each target by 15% every 20 ms. While the camera is steering, the website repeats the aim every 250 ms even if it hasn't changed. On a SightLine stand, the radars steer again once moves stop for about 0.7 s.
- Radar `…0003` (notify): `1` or `0` from the single-radar stand. SightLine sends `presence,left,right,pan,tilt` such as `1,42,13,95.0,90.0`, so the website knows where the radars have turned the head. With one radar, right is always 0; the website only reads presence, pan and tilt.
- Mist `…0004` (write): `1` = on, `0` = off. Unused since the humidifier was dropped; still in the firmware, which turns the pin off after 3 s without a `1`.

**Website states** (`../src/tracker/brain.ts`)
- TAP A PERSON: boxes around everyone in view; tap one to pick them.
- TRACKING: follows that person's body, so it keeps working when they turn away. It learns up to 3 extra looks of them (their back, say) while following cleanly (after a strong match, nobody overlapping), and a box that clearly continues theirs wins over colours. Someone lying down (a box flatter than 0.75) has their colours read side by side, both ways round, so they still match after a fall. A missed frame or a quick pass behind something is bridged by predicting their motion for 0.6 s. A shape the detector is unsure about (confidence 0.2–0.35, like someone covering their face) still counts right where the target is, for up to 5 s, if the colours roughly match. If it ends up on the wrong person, it switches to someone who matches clearly better (by 0.15 at once, or by 0.07 held for 0.6 s).
- Anyone seen at the same time as the target (while the tracker was sure of the target) can't be the target: the brain follows those people box to box, and while the target is out of sight they can't be picked up by their colours (only by a face match). A person stepping back out counts as "near" within 12° of where the target vanished.
- HIDDEN: they vanished in the middle of the picture. Holds on the cover and follows it if it moves (it matches a small grey picture of the lump each frame); the radar confirms someone's inside. A person shape that stays on the moving cover for 0.5 s (walking around under a blanket, legs showing) is taken as them, whatever its colours. If it loses the cover for 1 s while the radar still senses someone, it stops sending moves so a two-radar stand steers by radar.
- FOLLOWING: they left through the edge of the picture. Keeps turning that way at their speed (25–90°/s).
- SEARCHING: not found there. Sweeps across the whole range once.
- LOST: the cover went still and the radar read empty for 4 s, or the sweep found nothing. Compares everyone in view with the saved look (clothing colours) and locks back on when one matches.
- Hand-held (no stand): the phone's gyroscope tells the brain how the phone was turned (`handheld.ts`), so turning it doesn't look like everyone moving. Android; iPhones need a permission first. `rotationRate` alpha/beta/gamma = turning around the phone's x/y/z axes (browsers' order; the first version had it wrong). A tap restarts the pretend camera angle at straight ahead.
- Face verdicts and "seen with the target" notes only follow a person from one frame to the next (a face verdict not even one missed frame; the others note up to 0.25 s). A verdict is dropped if it's no longer clear whose face was read. Someone marked "face ✓" whose clothes don't match is re-checked every couple of seconds.
- The camera steers in TRACKING, HIDDEN, FOLLOWING and SEARCHING. In TAP A PERSON and LOST it stops sending moves, so a SightLine stand steers by radar (also in the dark, and during a FaceTime call, when iOS gives the camera to FaceTime).

Vision: Google MediaPipe's EfficientDet-Lite0 person detector (`@mediapipe/tasks-vision` 1.1.1; on the graphics chip, except on iPhones where it uses the CPU; `?gpu` / `?cpu` in the address overrides), at most 15 times a second, plus the clothing-colour look and the cover tracker, both written in this repo.

Faces (`faces.ts`, `@vladmandic/face-api` 1.7.15, models from jsDelivr, about 7 MB, loaded and warmed up when the camera starts): right after a tap, while the tracker is sure by colours, it saves face fingerprints of the target (up to 5). About twice a second at most it reads one face: the target's when unsure, others' when the target is lost. Distance under 0.5 = the same person (re-finds them, whatever their clothes; colours can't switch away from them); over 0.7 = someone else (ruled out). Measured once on Apple's screenshots: same person in two shots 0.33, different people 0.75–0.77. Off by default on iPhones (see open question 8). Fingerprints stay in memory only and are forgotten on a new tap, Release, Stop or a camera flip.

Tuning: constants in `../src/tracker/config.ts`; the most-tuned ones are also on the page's Settings panel (saved in the browser): camera side, flip left/right and up/down, match strictness (0.38), aim height (0.35 = chest), camera width (65°), dead zone (2.5°), and "Keep people upright for the AI" (Auto by default: with the phone sideways and auto-rotate off, the motion sensor says which way is up and the picture is turned before detection; `orientation.ts`).

**Keep firmware and website in sync.** If you change a pin, a UUID, the command format or the angle limits, change the firmware, `../src/tracker/config.ts` and this section in the same session.

## Useful numbers

- Servos: 180° per axis; keep tilt to about ±45° in practice.
- Radar: rated 0.75–6 m, a cone of about ±60°, distance in 0.75 m steps. Plan on about 3 m for a still person under a blanket (an estimate). Cap its range at about 3 m in the HLKRadarTool app.
- Detector speed, measured Oct 23 on Apple's Windows laptop (Intel UHD graphics, Chrome): about 70 ms per frame, 8 fps overall. The iPhone in Bluefy is untested.
- Power, worst case: about 2.2 A (servos straining 2 A, radars 0.16 A). Typical: under 1 A. Estimates; check with a USB power meter or a multimeter.

## Files

- `CLAUDE.md`: this file, loaded every session.
- `../src/tracker/`: the website (see `../src/tracker/README.md`). Tests: `npm run test:tracker` from the repo root.
- `firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino`: firmware for the single-radar stand (its mist switch is unused now). Arduino IDE needs the sketch folder and the .ino to share a name.
- `../hardware/firmware/sightline/sightline.ino` (on Kris's branch, plus the merge PR): firmware for the SightLine head.
- `app/PhoneTrackerApp.swift`: the backup native iPhone app (no FOLLOWING state). Needs the Mac.
- `print/README.md`: what to 3D-print and the requirements for each part.
- `docs/SHOPPING_LIST.md`: what to buy, where, prices, what to skip.
- `docs/BUILD_STEPS.md`: build, wiring, upload, the website, testing and tuning, plus troubleshooting.
- `docs/DEMO_AND_PITCH.md`: the 36-hour plan, demo script, judge Q&A, the 360° answer.
- `docs/STEAM.md`: the mist-that-follows-you design. Dropped Oct 24; kept for history.
- `docs/SESSION_LOG.md`: one entry per session.
- `docs/HANDOFF_2026-10-24.md`: **the latest handoff. Read it first.** PRs, uncommitted work, phone testing (Cloudflare tunnel), gotchas, next steps.
- `docs/HANDOFF.md`: the original handoff from claude.ai, kept for reference.

## Status (as of Oct 24, 2026)

- Plan: website + SightLine head with one radar, pitched for elderly care. Humidifier dropped Oct 24. Plain version first.
- Website: works end to end in Chrome on Apple's PC with a still photo fed in as the camera. It locks on from behind, follows off the edge, sweeps, re-finds by clothes, and holds HIDDEN. 13 automated tests pass. Not yet tried on a real phone (Samsung in Chrome, iPhone in Bluefy) or with the real stand.
- Oct 24: the page was reworked for phones (bottom control bar, front/back **Flip**, mirrored selfie view, taps that ignore a resting thumb, either way up, safe areas, camera recovery after switching apps). Checked at phone sizes in Chrome with a fake camera; not on a real phone yet.
- Oct 24: Kris merged PR #6 into `main` (1:48 AM), plus #8 (login, family dashboard) and #10 (the phone sends short movement events, including "Possible fall", to Supabase for the family page). Today's work (wall fix, phone page, blanket tracking) was combined with that on branch `tracker-phone-friendly`, in a new PR into `main`. The page now has Kris's privacy banner, sign-in and Stop watching.
- Plan (Oct 24): pivot the pitch toward elderly care. Apple chose "fall alert + face check": fall detection from body pose on the tracked person, an "I'm OK" countdown, an alert to the family, and face recognition to confirm it's the elderly person. Not built yet.
- Firmware: **both compile** (Oct 24, arduino-cli 1.5.1, ESP32 core 3.3.12, ESP32Servo 3.2.1, ld2410 0.2.2, board `esp32:esp32:adafruit_feather_esp32_v2`). SightLine (PR #7) uses 1.43 MB (42%) of program space and 16% RAM, with 2 harmless format warnings in Kris's WiFi printf. The single-radar sketch uses 33% and 12%, with no warnings. Never run on hardware. The tools are on this PC: `arduino-cli.exe` in this session's scratchpad (allowed in simplewall), packages in `C:\Users\marba\.ard` (a short path: the toolchain fails under the long scratchpad path, past Windows' 260-character limit).
- 3D mockup of SightLine + mist, with a hole-by-hole breadboard layout: https://claude.ai/artifact/VGajiyE2hiaV4B1B3DpeaD. Fallback without mist: https://claude.ai/artifact/S6Zg89U4N5bQv58RC92Qv3 (both made in a separate session).
- Apple's first live webcam test (Oct 23): after hiding behind a wall, the box got stuck on something nearby and never followed again. Fixed: the target's look is now kept from the moment of the tap, a "sort of" match is only trusted for 1.5 s, a clearly better match anywhere wins, and the colour fingerprint was made finer (it used to score red, orange and brown as identical). Each box now shows its match number.
- Parts: carts were nearly final on Oct 17. Which orders were placed is unknown. Humidifier dropped (parts not obtainable).
- Printed parts: Kris has STLs for the SightLine base, lid and radar head; the 3D-mockup session made a one-radar head (`radar_phone_head_1radar.stl`, not in the repo yet).

## Open questions

1. Which iPhone goes on the rig (Apple's friend's), and in which case? SightLine assumes an iPhone 14 in a case.
2. Does Bluefy on that iPhone allow the camera? Test: open https://webrtc.github.io/samples/src/content/getusermedia/gum/ in Bluefy.
3. How does the phone get an https link to `/tracker`? The repo is already connected to Vercel (project `carenest` in the team's "Hackathon project" Vercel account). Vercel blocks preview builds of dennisliang07's commits because that account isn't a team member, so PRs have no preview link. PR #6 is merged, so `main` should now deploy `/tracker`; not yet confirmed. Alternatives: the owner adds Apple to the Vercel team (needs Pro), or a tunnel from the PC.
4. Will Kris accept the firmware merge PR (Bluetooth + mist added to SightLine, pan range widened to 10–170°)?
5. Which orders were placed? Tick them in `docs/SHOPPING_LIST.md`.
6. What are the event's real length, date and rules on pre-built hardware and code?
7. How does the project fit "Steel and Steam" now that the mist is gone? The motorized stand covers "steel"; the "steam" part needs a new answer for the judges.
8. Why does `/tracker` reload itself on Kris's iPhone 14 (Chrome, iOS version unknown) after tracking a while? Likely iOS ending the page for memory or graphics load. Tried so far (Oct 24, not yet tested on the iPhone): the detector on the CPU on iPhones, at most 15 detections a second, faces off by default on iPhones. If it still reloads: try `?gpu` vs `?cpu`, then a 640×480 camera.

## Next steps

1. Apple retests on the S22 through the Cloudflare tunnel: hand-held turning (does the dial follow the turn the right way?), faces, hiding behind a pillar, and the emergency alert (Settings → Test the alert, then a staged fall). Then commit to PR #13.
2. Kris reviews and merges PR #13 (`tracker-phone-friendly`); then open the deployed `/tracker` on the S22. Check the frame rate.
3. Try `/tracker` with the PC webcam: walk out of view, hide behind a chair, come back.
4. Kris reviews the firmware merge, PR #7 (into `hardware-build-guide`); upload it and test with the website (`docs/BUILD_STEPS.md`).
5. On the stand: Settings → Front camera, motor test, Camera width (the S22's front camera may be wider than 65°; an estimate). Rehearse the fall and seizure demo; tune `EMERGENCY` in `config.ts` if it alarms too easily or not at all.
6. Tune on the real stand (`docs/BUILD_STEPS.md` Part E), then rehearse the demo at least 5 times.
