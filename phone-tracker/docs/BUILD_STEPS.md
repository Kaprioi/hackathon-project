# Build steps

**Which hardware?** The team is building Kris's **SightLine** head (one radar for the event, centered under the iPhone). For the base box, the pan-tilt kit, both radars and their wiring, follow Kris's guide: `hardware/build-guide.html` on the `hardware-build-guide` branch. Then come back here for **Part C (firmware)** and **Part D (the website)**. (Part B2, the humidifier, was dropped on Oct 24.)

Parts A and B below are the original single-radar Phone Tracker build. Keep them as a fallback: the website works with either stand.

The one rule that protects the board: the motors and radars get power from the 5V supply, never from the ESP32.

## Install first (all free)

- **Arduino IDE 2** from https://www.arduino.cc/en/software
- **ESP32 board support:** in Arduino IDE, open Boards Manager, search "esp32" and install **esp32 by Espressif Systems**. Pick **Adafruit Feather ESP32 V2** as the board. Guide: https://learn.adafruit.com/adafruit-esp32-feather-v2/overview
- **Libraries:** Library Manager, install **ESP32Servo**. For SightLine, also **ld2410** by ncmreynolds.
- **Node.js** (already on Apple's PC) to run the website locally.
- On the iPhone: **Bluefy** (a browser that can use Bluetooth), and **LightBlue** or **nRF Connect** to test the stand before the website. **HLKRadarTool** to cap the radar's range.
- On Windows, simplewall blocks newly installed programs from the internet until you allow them. If Arduino IDE can't download boards or libraries, allow it in simplewall first.

Tools: small Phillips screwdriver, wire strippers or scissors, double-sided foam tape or zip ties.

## Part A: the single-radar stand (fallback)

1. **Center the motors.** The Lynxmotion kit arrives assembled. Turn the top plate by hand to the middle of its travel, and do the same for the tilt.
2. **Fix the kit to the base.** Screw or tape the bottom of the kit to the middle of the printed base box. It must not slide when the motors move.
3. **Attach the phone holder.** Push the 1/4"-20 × 1/2" hex bolt up through a hole in the kit's top plate into the nut captured in the printed holder.
4. **Balance check.** Put the phone in sideways (landscape). It should sit roughly over the tilt axle. Take it out again for now.
5. **Mount the radar** on top of the holder, facing the same way as the camera that faces the person. Leave enough wire slack for the full pan and tilt.

## Part B: single-radar wiring (fallback)

6. **Power rails.** Plug the female DC jack adapter onto the power supply's plug (supply not in the wall yet). Red wire from the adapter's **+** to the breadboard's red (+) rail; black wire from **–** to the blue (–) rail. Optional: a 1000 µF capacitor across the two rails, long leg on +.
7. **Connect everything.** Each HS-422 has black (ground), red (power) and yellow (signal) wires. Check the pin numbers printed on the ESP32.

| From | To |
|---|---|
| Pan red, tilt red | Breadboard + rail |
| Pan black, tilt black | Breadboard – rail |
| Pan yellow | ESP32 pin 27 |
| Tilt yellow | ESP32 pin 33 |
| ESP32 GND | Breadboard – rail |
| Radar VCC (or 5V) | Breadboard + rail |
| Radar GND | Breadboard – rail |
| Radar OUT | ESP32 pin 32 |

   Nothing connects to the ESP32's 3V or USB pins. The radar's OUT pin is 3.3 V, which is safe for the ESP32.

8. **Double-check, then power up.** Compare every wire with the table. Plug the supply into the wall and the ESP32 into the PC with a USB-C data cable.

## Part B2: the humidifier (both stands)

> **Skip this part (Oct 24, 2026):** the humidifier was dropped because the parts can't be obtained. Leave pin A0 unconnected. Kept for history.

The mist maker and its fan sit in a closed tank **beside** the base box, never inside it. A tube carries the mist up to a nozzle on the head. Geometry and a hole-by-hole breadboard layout are in the 3D mockup: https://claude.ai/artifact/VGajiyE2hiaV4B1B3DpeaD. If the mist parts aren't ready, build the same head without it (A0 left unconnected; the website still tracks): https://claude.ai/artifact/S6Zg89U4N5bQv58RC92Qv3

9. **Tank.** About 1.5 L, with a lid. The floating mist maker sits in the water. Its driver board stays dry on the lid. The 5V fan sits on the lid, blowing **into** the tank. A spigot in the lid takes the tube. Use distilled water.
10. **Tube and nozzle.** About 16 mm across, light silicone or CPAP hose, roughly 1 m. Clip it to the C bracket near the tilt axle, so it doesn't lever the head, with a loose loop for the full pan and tilt. It should run **downhill** from the nozzle to the tank, with no dips, so condensation drains back. The nozzle sits on a printed arm beside the phone and points where the camera points. Its tip goes ahead of and outside both radar windows.
11. **Switch.** Wire the MOSFET module:

| From | To |
|---|---|
| MOSFET module signal (SIG / IN / PWM) | ESP32 pin **A0** (GPIO 26) |
| MOSFET module signal ground (GND) | Breadboard – rail |
| MOSFET module power in (VIN+ / VIN–) | Breadboard + and – rails |
| MOSFET module output (OUT+ / OUT–) | Mist maker + fan, in parallel (+ to +, – to –) |

   Label names vary between sellers; read your module's markings. The module must turn on from a 3.3 V signal (a "logic-level" module). The mist maker must start misting as soon as it gets power, with no on button.

   Put a diode (1N5819 or 1N4007) across the fan's two wires, unless the module already has one: the stripe end goes to the fan's red (+) wire. It protects the MOSFET from the voltage kick when the fan switches off.

12. **Test the switch with no water.** Upload the firmware (Part C). In LightBlue, write `1` to the characteristic ending **0004**: the module's LED lights and the fan spins. After 3 seconds with no further `1`, it turns off by itself. That's the safety timeout working.
   - Never run the mist maker dry for more than a second or two; it can overheat. For dry tests, unplug it and watch the module's LED and the fan.
13. **Wet test.** Water in, lid on, write `1` every second. Check: does visible mist come out of the nozzle, how far does it reach (measure it), and does any water drip onto the radars, the phone or the base box? The stand should sit 0.5–1 m from the bed or chair.

## Part C: the firmware

14. **Upload.**
   - SightLine head: open `hardware/firmware/sightline/sightline.ino` (the merge PR version, with Bluetooth and mist). Follow Kris's guide for `secrets.h`.
   - Single-radar stand: open `phone-tracker/firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino`.
   - Pick **Adafruit Feather ESP32 V2** and its port, click Upload. It advertises Bluetooth as **PhoneTracker**.
   - Written for version 3 of the ESP32 board package. On version 2, change `String v = c->getValue();` to `String v = c->getValue().c_str();`.
   - If `BLE2902.h` won't compile, delete its include line and the `addDescriptor` line.
   - "Sketch too big": Bluetooth plus WiFi is large. In Tools → Partition Scheme, pick an option with a bigger app (for example "Huge APP" or an 8 MB option).
15. **Test from the phone.** In LightBlue, connect to **PhoneTracker**. On the characteristic ending **0002**, write UTF-8 text one at a time: `90,90` (center), `40,90`, `140,90`, `90,60`, `90,120`. A motor turning the "wrong" way is fine; the website flips it. Subscribe to **0003**: it should read `1` (or start with `1,` on SightLine) while you stand in front of the radar, and drop to `0` a few seconds after you leave.
16. **Put the phone back in** and repeat the motor test. If it shakes or the tilt sags, re-check the balance (step 4 or Kris's guide).

## Part D: the website

On the PC (testing):

17. In the repo folder, run `npm install` once, then `npm run dev`. Open **http://localhost:5173/tracker** in **Chrome or Edge**. Safari and Firefox can't do Bluetooth.
18. Click **Start camera** and allow the camera. The first start downloads the AI model (a few MB). Boxes appear around people. Tap one: TRACKING. The front camera (and a PC webcam) is shown mirrored, like a selfie.
19. Without the stand, the camera doesn't move, but the dial in the corner shows where the stand would point. Walk out of view and watch it go FOLLOWING, then SEARCHING, then LOST. Walk back in and it re-finds you.

On a phone, held in your hand (a quick test before the stand):

- Either way up works, also sideways with auto-rotate off on Android: the page reads the motion sensor and turns the picture upright for the AI (Settings → "Keep people upright for the AI" shows what it's doing; pick a turn by hand if Auto gets it wrong). On an iPhone, turn auto-rotate on instead. Pick **Front** or **Back** on the start screen; while it runs, **Flip** in the bottom bar switches cameras (and lets go of the person, since the picture changes).
- Tap a person with a quick tap. A thumb resting on the screen or a drag is ignored. Android phones buzz briefly when it locks on.
- **Release** sits next to the state at the top left. **Show log** there lists the last decisions.
- **Emergency alert:** Settings → **Test the alert** shows the "Are you OK?" countdown and then the pretend emergency call (no real number is dialled). For the real thing, tap the person, then have them fall and stay down (about 3 s), or lie down and shake. Stage it a few steps from the camera with the whole body in the picture: a box cut off by the edge of the picture never counts, and sitting down (even at a table) never does. Press **I'm OK** to cancel; it only watches again once the person has stood up for 3 s, or after 2 minutes. The **Posture** sign on the camera screen shows what it thinks (standing, sitting, lying, or can't tell when the person is partly out of view).
- **Full screen** (Android and PCs) hides the browser bars. iPhones don't allow it from a web page.
20. To check the tracking logic without a camera: `npm run test:tracker`.

On the iPhone (the demo):

21. The page must be on **https**, so it has to be deployed (Vercel; open question 3 in `CLAUDE.md`). Open `https://<the site>/tracker` in **Bluefy**, not Safari.
22. Turn **off** rotation lock and put the phone in the stand sideways. Once the stand is connected, the page warns you if the picture is upright.
23. On the start screen pick the camera that faces the person (**Front** for SightLine, where the screen faces forward), then **Start camera**. Then **Connect stand** in the bottom bar → pick **PhoneTracker**.

## Part E: tuning

All of these are on the page's **Settings** panel and are saved in the browser.

24. **Directions.** Settings → Test the motors (press Release first). **Left** should bring what was on the left of the screen toward the middle. If it does the opposite, press **Flip left/right**. Same with **Up** and **Flip up/down**.
25. **Feel.** If it overshoots and swings back past you, lower **Camera width**. If it lags behind you, raise it. If it twitches while you sit still, raise **Dead zone** to 4–5.
26. **Hiding.** Get under a blanket within about 3 m. The box should turn dashed and say HIDDEN within about half a second. In HLKRadarTool, cap the radar's range at about 3 m.
27. **Re-finding.** Every box shows a number: how much that person looks like the one you tapped (0.00 = same clothes colours). It turns green when it's under **Match strictness**, meaning "that's them". Note your own number as you walk around the room, then a teammate's. Set **Match strictness** between the two.
28. **Aim.** **Aim height** 0.35 aims at the chest. For someone lying in bed, try 0.2–0.3.

## Backup: the native iPhone app (needs the Mac)

Only if the website can't be used on the iPhone. It has no mist control and no FOLLOWING state.

1. In Xcode: File → New → Project → iOS App. Name it **PhoneTracker**, interface SwiftUI. Save it inside `phone-tracker/app/`.
2. In the target's Info tab, add `Privacy - Camera Usage Description` ("Finds the person you picked so the stand can follow them.") and `Privacy - Bluetooth Always Usage Description` ("Talks to the PhoneTracker stand.").
3. In Build Settings, set "Default Actor Isolation" to **nonisolated**. If concurrency errors remain, set "Swift Language Version" to **Swift 5**.
4. Replace the project's `PhoneTrackerApp.swift` with `app/PhoneTrackerApp.swift` and delete `ContentView.swift`. It has never been compiled: budget an hour for fixes. It uses the rear camera.
5. Plug in the iPhone, pick it as the run target, press Run. Trust the developer certificate on the phone (Settings → General → VPN & Device Management).

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| "This browser can't use Bluetooth" | Safari or Firefox | iPhone: Bluefy. PC: Chrome or Edge |
| "Can't open the camera" | Page not on https | Use the deployed https link, or `localhost` on the PC |
| Camera never starts in Bluefy | Bluefy camera permission | iPhone Settings → Bluefy → Camera on; reload |
| "The camera is blocked for this page" | Camera permission was refused once | Chrome: tap the icon left of the address → Permissions → Camera → Allow; reload. Bluefy: as above |
| "The camera stopped" | Another app took the camera (FaceTime, the Camera app) | Close that app, then **Restart camera** |
| "Turn the phone sideways" banner | Rotation lock on | Turn it off in Control Center |
| Misses people, or one big box around several, with the phone sideways | The picture reaches the AI on its side (auto-rotate off, and no motion sensor reading: iPhone, or Auto turned off) | Turn auto-rotate on, or Settings → "Keep people upright for the AI" → pick 90° or 270° |
| Very low fps | Slow graphics, or the phone is hot | Close other apps; check the fps chip (it also says GPU or CPU) |
| The page reloads by itself after a while (seen on an iPhone) | Probably iOS ending the page for memory or graphics load | Keep Recognise faces off; add `?cpu` (default on iPhones) or `?gpu` to the address to compare; tell Claude which one held up |
| "Face AI unavailable" | The face models couldn't download (no internet, or jsDelivr blocked) | Check the connection; tracking still works by clothes colours |
| Motors twitch or buzz | ESP32 GND not on the – rail | Add the GND wire |
| ESP32 restarts when a motor moves | Motors powered from the ESP32 | Move both red wires to the 5V rail |
| Upload fails | Charge-only cable, wrong port, or something on pin 12 | Another cable; the port that appears when you plug in; keep pin 12 clear |
| LightBlue doesn't see the stand | Firmware not running, or the website is connected | Press reset; disconnect the website |
| Stand turns away from you | Motor direction flipped | Settings → Flip left/right (or up/down) |
| Swings past you and back | Camera width setting too high | Lower it (Part E step 25) |
| Radar always reads someone there | It sees people behind the target | Cap its range at about 3 m; aim away from crowds |
| Radar reads 0 under the blanket | Too far, aimed wrong, or metal in front | Stay within 3 m; keep metal away |
| Flickers between TRACKING and HIDDEN | Detector missing frames | Better light; fewer people in view |
| Never goes LOST | Radar still senses someone nearby | Shorten the radar range |
| Locks onto the wrong person | Match strictness too loose | Lower it (step 27) |
| Box sticks to a coat, chair or door after you hide | Something near you looks like a person to the detector | It gives up within 1.5 s and re-finds you by your number; if not, lower Match strictness |
| Never locks back on | Match strictness too strict, or the target changed clothes | Raise it (step 27) |

## Reference videos and guides

They use slightly different parts; follow this file for pins and code.

- Pan-tilt bracket assembly: https://www.youtube.com/watch?v=Rpc4Pk7T09E
- Two servos on an ESP32 for pan and tilt: https://www.youtube.com/watch?v=Rm_R0MAmHHA
- ESP32 BLE server servo control: https://www.youtube.com/watch?v=GKpnU84tFXg
- Random Nerd Tutorials, ESP32 BLE: https://randomnerdtutorials.com/esp32-bluetooth-low-energy-ble-arduino-ide/
- Random Nerd Tutorials, ESP32 servos: https://randomnerdtutorials.com/esp32-servo-motor-web-server-arduino-ide/
- MediaPipe object detector for the web: https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js
- Web Bluetooth samples (also a quick Bluefy test): https://googlechrome.github.io/samples/web-bluetooth/
- Apple DockKit (ready-made tracking stands, a no-build alternative): https://developer.apple.com/documentation/dockkit
