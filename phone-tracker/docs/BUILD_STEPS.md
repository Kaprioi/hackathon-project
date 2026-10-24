# Build steps

Condensed from the Phone Tracker Build Manual (River's manual, edited Oct 16, 2026). Keep everything unplugged until step 8. The one rule that protects the board: the motors and radar get power from the 5V supply, never from the ESP32.

## Install first (all free)

- **Arduino IDE 2** from https://www.arduino.cc/en/software
- **ESP32 board support:** in Arduino IDE, open Boards Manager, search "esp32" and install **esp32 by Espressif Systems**. Pick **Adafruit Feather ESP32 V2** as the board. Guide: https://learn.adafruit.com/adafruit-esp32-feather-v2/overview
- **ESP32Servo library:** Library Manager, search "ESP32Servo", install.
- **Xcode** from the Mac App Store, and a free Apple developer account, to put the app on the iPhone.
- **LightBlue** or **nRF Connect** on the iPhone, to test the stand before the app exists.
- **HLKRadarTool** on the iPhone, to cap the radar's range.

Tools: small Phillips screwdriver, wire strippers or scissors, double-sided foam tape or zip ties.

## Part A: the stand

1. **Center the motors.** The Lynxmotion kit arrives assembled. Turn the top plate by hand to the middle of its travel, and do the same for the tilt.
2. **Fix the kit to the base.** Screw or tape the bottom of the kit to the middle of the printed base box. It must not slide when the motors move.
3. **Attach the phone holder.** Push the 1/4"-20 × 1/2" hex bolt up through a hole in the kit's top plate into the nut captured in the printed holder.
4. **Balance check.** Put the phone in sideways (landscape), rear camera facing out, screen facing you. It should sit roughly over the tilt axle. Take it out again for now.
5. **Mount the radar** on top of the holder, its antenna side facing the same way as the rear camera. Leave enough wire slack for the full pan and tilt.

## Part B: the wiring

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

8. **Double-check, then power up.** Compare every wire with the table. Plug the supply into the wall and the ESP32 into the Mac with a USB-C data cable.

## Part C: the firmware

9. **Upload.** Open `firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino` in Arduino IDE, pick **Adafruit Feather ESP32 V2** and its port, click Upload. It advertises Bluetooth as **PhoneTracker**.
   - Written for version 3 of the ESP32 board package. On version 2, change `String v = c->getValue();` to `String v = c->getValue().c_str();`.
   - If `BLE2902.h` won't compile, delete its include line and the `addDescriptor` line.
10. **Test from the phone.** In LightBlue, connect to **PhoneTracker**. On the characteristic ending **0002**, write UTF-8 text one at a time: `90,90` (center), `40,90`, `140,90`, `90,60`, `90,120`. A motor turning the "wrong" way is fine; the app flips it. Then subscribe to the characteristic ending **0003**: it should read `1` while you stand in front of the radar and drop to `0` a few seconds after you leave.
11. **Put the phone back in** and repeat the motor test. If it shakes or the tilt sags, re-check the balance (step 4).

## Part D: the app

12. **Create the project.** In Xcode: File → New → Project → iOS App. Name it **PhoneTracker**, interface SwiftUI. Save it inside this repo's `app/` folder.
13. **Permissions.** In the target's Info tab, add:
    - `Privacy - Camera Usage Description`: "Finds the person you picked so the stand can follow them."
    - `Privacy - Bluetooth Always Usage Description`: "Talks to the PhoneTracker stand."
14. **Build setting.** In Build Settings, set "Default Actor Isolation" to **nonisolated**. If concurrency errors remain, set "Swift Language Version" to **Swift 5**.
15. **Add the code.** Replace everything in the project's `PhoneTrackerApp.swift` with `app/PhoneTrackerApp.swift`, and delete `ContentView.swift`. Then keep only one copy of the file in the repo. The code has never been compiled, so budget about an hour for small fixes.
16. **Run it.** Plug the iPhone into the Mac, pick it as the run target, press Run. The first time, trust the developer certificate on the phone (Settings → General → VPN & Device Management) and allow Camera and Bluetooth.

## Part E: tuning

17. **Directions.** Phone in the stand sideways, tap yourself, step to one side. If the stand turns away from you, set `panSign` to `-1`. Same for `tiltSign` when you crouch or stand.
18. **Feel.** Overshoots and wobbles: lower `strength` to 5. Too slow: raise it to 12. Twitches while you stand still: raise `deadZone` to 0.1.
19. **Hiding.** Get under a blanket within about 3 m. The box should turn dashed and say HIDDEN within half a second. If it flickers to HIDDEN while you walk, raise `framesBeforeHidden` to 15–20. In HLKRadarTool, cap the radar's range at about 3 m.
20. **Re-finding.** Slip out of view and wait for LOST. Note the "Closest match" number when you walk back in, then when a teammate walks in. Set `matchLimit` between the two.

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Motors twitch or buzz | ESP32 GND not on the – rail | Add the GND wire (step 7) |
| ESP32 restarts when a motor moves | Motors powered from the ESP32 | Move both red wires to the 5V rail |
| Upload fails | Charge-only cable, or wrong port | Try another cable; pick the port that appears when you plug in |
| LightBlue doesn't see the stand | Firmware not running, or the app connected first | Press the ESP32's reset button; close the iPhone app |
| Stand turns away from you | Motor direction flipped | `panSign` or `tiltSign` to `-1` |
| Swings past you and back | Chasing too hard | Lower `strength` |
| Tilt sags or shakes | Phone off the tilt axle | Re-center it (step 4) |
| Xcode actor or concurrency errors | New-project default | Step 14 |
| Radar always reads someone there | It sees people behind the target | Cap its range at about 3 m; aim away from crowds |
| Radar reads 0 under the blanket | Too far, aimed wrong, or metal in front | Stay within 3 m; face it the way the camera faces; keep metal away |
| Flickers to HIDDEN while walking | Detector missed a few frames | `framesBeforeHidden` to 15–20 |
| Never goes LOST | Radar still senses someone nearby | Shorten the radar range, or lower `lostAfter` |
| Locks onto the wrong person | `matchLimit` too loose | Lower it (step 20) |
| Never locks back on | `matchLimit` too strict, or the target changed clothes | Raise it (step 20) |

## Reference videos and guides

They use slightly different parts; follow this file for pins and code.

- Pan-tilt bracket assembly: https://www.youtube.com/watch?v=Rpc4Pk7T09E
- DIY servo mounts: https://www.youtube.com/watch?v=SUXvdHxVoQQ
- Two servos on an ESP32 for pan and tilt: https://www.youtube.com/watch?v=Rm_R0MAmHHA
- Servo control over Bluetooth from a phone: https://www.youtube.com/watch?v=5TlEgfFDrzI
- ESP32 BLE server servo control: https://www.youtube.com/watch?v=GKpnU84tFXg
- A phone app that talks to an ESP32 over BLE: https://youtube.com/watch?v=RvbWl8rZOoQ
- Face-tracking camera with computer vision: https://www.youtube.com/watch?v=icdbFx0uJu0
- Cambot motion-tracking camera: https://www.youtube.com/watch?v=nbJNLVBo_g4
- Random Nerd Tutorials, ESP32 BLE: https://randomnerdtutorials.com/esp32-bluetooth-low-energy-ble-arduino-ide/
- Random Nerd Tutorials, ESP32 servos: https://randomnerdtutorials.com/esp32-servo-motor-web-server-arduino-ide/
- Turret Face Tracker on GitHub: https://github.com/AshishA26/Turret-Face-Tracker
- Apple DockKit (ready-made tracking stands, a no-build alternative): https://developer.apple.com/documentation/dockkit
