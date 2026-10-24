# Phone Tracker (SBUHacks 2026)

A motorized stand that holds an iPhone, keeps one chosen person in view and points a humidifier's mist at them as they move around the room. It keeps working when they turn their back, hide under a blanket or box, or walk out of the picture. Built by Apple and partner River for SBUHacks 2026 at Stony Brook University, with teammate Kris's SightLine radar head as the hardware. Planned in claude.ai from Oct 16 to Oct 23, 2026; this folder is where every Claude Code session continues it.

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

- SBUHacks 2026, Stony Brook University. Theme: "Steel and Steam". The project is deliberately not Roblox-related, because judges may not know Roblox.
- Length unclear: Stony Brook's CS page says 24 hours and sbuhacks.org says 48. The plan assumes 36. Date not confirmed.
- Most hackathons allow hardware bought and printed beforehand but want code written at the event. Check the rules; if so, treat the code here as a reference.

## Decisions (locked)

1. **The software is a website**, the `/tracker` page of the team web app (code in `../src/tracker/`). The iPhone runs the AI in the page and talks to the ESP32 over Bluetooth. No laptop in the loop. On the iPhone it runs in the free **Bluefy** browser, because Safari can't use Bluetooth from a website. On a PC it runs in Chrome or Edge. Chosen Oct 23 because Apple builds on Windows. The Swift app in `app/` is a backup only.
2. Which phone camera faces the person is a setting on the page (start screen, Settings, or the **Flip** button). The default is the **front** camera, because SightLine mounts the phone screen-forward (it was the rear camera in the first plan). The front camera is shown mirrored, like a selfie; the tracking brain always works on the unmirrored picture.
3. Lynxmotion Pan and Tilt Kit (BPT-KT) with its two Hitec HS-422 servos, as sold.
4. **Hardware: Kris's SightLine head** (branch `hardware-build-guide`, `hardware/` in the repo): two LD2410C radars angled 25° left and right, the iPhone on a backplate above them, WiFi alerts. Chosen Oct 23. Merging it with this project's Bluetooth link is proposed in a pull request for Kris to review. The single-radar Phone Tracker stand (`firmware/PhoneTracker_ESP32`) still works with the website as a fallback.
5. Print the phone holder and base box instead of buying a clamp and a board.
6. Plain version first. No steampunk styling until the plain version works.
7. **Steam = a humidifier whose mist follows the tracked person.** Apple's reason: a humidifier sprays one way, so you lose the mist when you move from bed to chair, and re-aiming the nozzle is even harder for wheelchair users. The nozzle rides on the head beside the phone and aims where the camera aims. The tank, mist maker and fan sit beside the base. See `docs/STEAM.md`.
8. Mist switch: one MOSFET module on Feather pin **A0 (GPIO 26)** switches the mist maker and its fan together. Not pin 14: SightLine uses it, and it may pulse during boot.
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
- The water tank on the moving head: too heavy for the tilt servo.

## Architecture

| Part | Job | Connection |
|---|---|---|
| iPhone running the `/tracker` website in Bluefy | Sees, runs the AI, decides where to point and when to mist | Bluetooth to the ESP32 |
| Adafruit ESP32 Feather V2 | Moves the servos, reads the radar(s), switches the mist | USB-C to a PC for uploading; a phone charger for the demo |
| Pan servo (HS-422) | Left and right | Signal to pin 27 |
| Tilt servo (HS-422) | Up and down | Signal to pin 33 |
| Radar, SightLine: 2 × LD2410C over serial | Presence and which side is stronger | Left on RX/TX (GPIO 7/8), right on 32/14. **The event build has one radar** (no second one arrives in time): wired as the "left" radar on GPIO 7/8, but mounted centered under the phone, facing straight ahead, in a one-radar head (`radar_phone_head_1radar.stl`, from the 3D-mockup session; not in the repo yet). The firmware sees one radar at startup (`RADAR_COUNT` = auto) and then only reports presence |
| Radar, single-radar fallback: 1 × LD2410C | OUT pin HIGH while someone is there | OUT to pin 32 |
| MOSFET module | Switches the mist maker and fan | Signal from pin A0 (GPIO 26) |
| 5V ultrasonic mist maker + 5V fan, in a tank beside the base | Makes the mist; the fan pushes it up a tube to the nozzle on the head | 5V through the MOSFET |
| 5V 4A supply + DC jack adapter | Powers servos, radars, mist maker and fan through the breadboard rails | Never from the ESP32. Worst case about 3 A (estimate) |

- All grounds join the breadboard's – rail, including the ESP32's GND. Without a shared ground the motors twitch.
- The radars face the same way as the camera that faces the person. Keep the nozzle tip ahead of and outside the radar windows: the radar boards are bare, so droplets could short them.
- The phone sits sideways (landscape), centered over the tilt axle.

**Bluetooth protocol** (website `../src/tracker/stand.ts` and `config.ts`; firmware `.ino`)
- Service UUID `6e400001-b5a3-f393-e0a9-e50e24dcca9e`.
- Move `…0002` (write): text `pan,tilt` such as `90,90`. Pan is limited to 10–170° and tilt to 45–135°, and the firmware eases toward each target by 15% every 20 ms. While the camera is steering, the website repeats the aim every 250 ms even if it hasn't changed. On a SightLine stand, the radars steer again once moves stop for about 0.7 s.
- Radar `…0003` (notify): `1` or `0` from the single-radar stand. SightLine sends `presence,left,right,pan,tilt` such as `1,42,13,95.0,90.0`, so the website knows where the radars have turned the head. With one radar, right is always 0; the website only reads presence, pan and tilt.
- Mist `…0004` (write): `1` = on, `0` = off. The website repeats `1` every second. The firmware turns the mist off after 3 s of silence, and when the phone disconnects.

**Website states** (`../src/tracker/brain.ts`)
- TAP A PERSON: boxes around everyone in view; tap one to pick them.
- TRACKING: follows that person's body, so it keeps working when they turn away. A missed frame or a quick pass behind something is bridged by predicting their motion for 0.6 s. A shape the detector is unsure about (confidence 0.2–0.35, like someone covering their face) still counts right where the target is, for up to 5 s, if the colours roughly match. If it ends up on the wrong person, it switches to someone who matches clearly better (by 0.15 at once, or by 0.07 held for 0.6 s).
- HIDDEN: they vanished in the middle of the picture. Holds on the cover and follows it if it moves (it matches a small grey picture of the lump each frame); the radar confirms someone's inside. A person shape that stays on the moving cover for 0.5 s (walking around under a blanket, legs showing) is taken as them, whatever its colours. If it loses the cover for 1 s while the radar still senses someone, it stops sending moves so a two-radar stand steers by radar.
- FOLLOWING: they left through the edge of the picture. Keeps turning that way at their speed (25–90°/s).
- SEARCHING: not found there. Sweeps across the whole range once.
- LOST: the cover went still and the radar read empty for 4 s, or the sweep found nothing. Compares everyone in view with the saved look (clothing colours) and locks back on when one matches.
- Mist "Follow me" mode: mist on in TRACKING, HIDDEN and FOLLOWING; off otherwise.
- The camera steers in TRACKING, HIDDEN, FOLLOWING and SEARCHING. In TAP A PERSON and LOST it stops sending moves, so a SightLine stand steers by radar (also in the dark, and during a FaceTime call, when iOS gives the camera to FaceTime).

Vision: Google MediaPipe's EfficientDet-Lite0 person detector (`@mediapipe/tasks-vision` 1.1.1, runs on the phone's GPU), plus the clothing-colour look and the cover tracker, both written in this repo.

Tuning: constants in `../src/tracker/config.ts`; the most-tuned ones are also on the page's Settings panel (saved in the browser): camera side, flip left/right and up/down, match strictness (0.38), aim height (0.35 = chest), camera width (65°), dead zone (2.5°), and "Keep people upright for the AI" (Auto by default: with the phone sideways and auto-rotate off, the motion sensor says which way is up and the picture is turned before detection; `orientation.ts`).

**Keep firmware and website in sync.** If you change a pin, a UUID, the command format or the angle limits, change the firmware, `../src/tracker/config.ts` and this section in the same session.

## Useful numbers

- Servos: 180° per axis; keep tilt to about ±45° in practice.
- Radar: rated 0.75–6 m, a cone of about ±60°, distance in 0.75 m steps. Plan on about 3 m for a still person under a blanket (an estimate). Cap its range at about 3 m in the HLKRadarTool app.
- Detector speed, measured Oct 23 on Apple's Windows laptop (Intel UHD graphics, Chrome): about 70 ms per frame, 8 fps overall. The iPhone in Bluefy is untested.
- Mist reach from a small 5V mist maker: probably 0.5–1.5 m (an estimate; test it). Place the stand 0.5–1 m from the bed or chair.
- Power, worst case: about 2.8 A (servos straining 2 A, radars 0.16 A, mist maker 0.3–0.5 A, fan 0.1 A). Typical: about 1 A. All estimates; check with a USB power meter or a multimeter.

## Files

- `CLAUDE.md`: this file, loaded every session.
- `../src/tracker/`: the website (see `../src/tracker/README.md`). Tests: `npm run test:tracker` from the repo root.
- `firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino`: firmware for the single-radar stand, now with the mist switch. Arduino IDE needs the sketch folder and the .ino to share a name.
- `../hardware/firmware/sightline/sightline.ino` (on Kris's branch, plus the merge PR): firmware for the SightLine head.
- `app/PhoneTrackerApp.swift`: the backup native iPhone app (no mist, no FOLLOWING state). Needs the Mac.
- `print/README.md`: what to 3D-print and the requirements for each part.
- `docs/SHOPPING_LIST.md`: what to buy, where, prices, what to skip.
- `docs/BUILD_STEPS.md`: build, wiring, upload, the website, testing and tuning, plus troubleshooting.
- `docs/DEMO_AND_PITCH.md`: the 36-hour plan, demo script, judge Q&A, the 360° answer.
- `docs/STEAM.md`: the mist-that-follows-you design, tests and safety.
- `docs/SESSION_LOG.md`: one entry per session.
- `docs/HANDOFF_2026-10-24.md`: **the latest handoff. Read it first.** PRs, uncommitted work, phone testing (Cloudflare tunnel), gotchas, next steps.
- `docs/HANDOFF.md`: the original handoff from claude.ai, kept for reference.

## Status (as of Oct 24, 2026)

- Plan: website + SightLine head + mist that follows you. Plain version first.
- Website: works end to end in Chrome on Apple's PC with a still photo fed in as the camera. It locks on from behind, follows off the edge, sweeps, re-finds by clothes, and holds HIDDEN. 13 automated tests pass. Not yet tried on a real phone (Samsung in Chrome, iPhone in Bluefy) or with the real stand.
- Oct 24: the page was reworked for phones (bottom control bar, front/back **Flip**, mirrored selfie view, taps that ignore a resting thumb, either way up, safe areas, camera recovery after switching apps). Checked at phone sizes in Chrome with a fake camera; not on a real phone yet.
- Oct 24: Kris merged PR #6 into `main` (1:48 AM), plus #8 (login, family dashboard) and #10 (the phone sends short movement events, including "Possible fall", to Supabase for the family page). Today's work (wall fix, phone page, blanket tracking) was combined with that on branch `tracker-phone-friendly`, in a new PR into `main`. The page now has Kris's privacy banner, sign-in and Stop watching.
- Plan (Oct 24): pivot the pitch toward elderly care. Apple chose "fall alert + face check": fall detection from body pose on the tracked person, an "I'm OK" countdown, an alert to the family, and face recognition to confirm it's the elderly person. Not built yet.
- Firmware: the single-radar `.ino` got the mist switch; never compiled or run on hardware. The SightLine merge is written as a proposal PR for Kris; not compiled.
- 3D mockup of SightLine + mist, with a hole-by-hole breadboard layout: https://claude.ai/artifact/VGajiyE2hiaV4B1B3DpeaD. Fallback without mist: https://claude.ai/artifact/S6Zg89U4N5bQv58RC92Qv3 (both made in a separate session).
- Apple's first live webcam test (Oct 23): after hiding behind a wall, the box got stuck on something nearby and never followed again. Fixed: the target's look is now kept from the moment of the tap, a "sort of" match is only trusted for 1.5 s, a clearly better match anywhere wins, and the colour fingerprint was made finer (it used to score red, orange and brown as identical). Each box now shows its match number.
- Parts: carts were nearly final on Oct 17. Which orders were placed is unknown. Humidifier parts not bought.
- Printed parts: Kris has STLs for the SightLine base, lid and radar head. The nozzle arm isn't designed yet.

## Open questions

1. Which iPhone goes on the rig (Apple's friend's), and in which case? SightLine assumes an iPhone 14 in a case.
2. Does Bluefy on that iPhone allow the camera? Test: open https://webrtc.github.io/samples/src/content/getusermedia/gum/ in Bluefy.
3. How does the phone get an https link to `/tracker`? The repo is already connected to Vercel (project `carenest` in the team's "Hackathon project" Vercel account). Vercel blocks preview builds of dennisliang07's commits because that account isn't a team member, so PRs have no preview link. PR #6 is merged, so `main` should now deploy `/tracker`; not yet confirmed. Alternatives: the owner adds Apple to the Vercel team (needs Pro), or a tunnel from the PC.
4. Will Kris accept the firmware merge PR (Bluetooth + mist added to SightLine, pan range widened to 10–170°)?
5. Which orders were placed? Tick them in `docs/SHOPPING_LIST.md`. The humidifier parts need approval before buying.
6. What are the event's real length, date and rules on pre-built hardware and code?

## Next steps

1. Test the phone-friendly page through the Cloudflare tunnel (`docs/HANDOFF_2026-10-24.md`): the Samsung in Chrome, the iPhone in Bluefy (also answers open question 2). Check tapping, Flip, both ways up, and the fps chip.
2. Kris reviews and merges the `tracker-phone-friendly` PR; then open the deployed `/tracker` on the iPhone in Bluefy. Check the frame rate.
3. Try `/tracker` with the PC webcam: walk out of view, hide behind a chair, come back.
4. Kris reviews the firmware merge, PR #7 (into `hardware-build-guide`); upload it and test with the website (`docs/BUILD_STEPS.md`).
5. Approve and buy the humidifier parts; test the mist reach and whether droplets reach the radars.
6. Tune on the real stand (`docs/BUILD_STEPS.md` Part E), then rehearse the demo at least 5 times.
