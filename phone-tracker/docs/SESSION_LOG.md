# Session log

Newest entry at the top. Add one entry at the end of every session.

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
