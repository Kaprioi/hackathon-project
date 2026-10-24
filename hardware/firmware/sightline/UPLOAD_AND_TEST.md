# Upload SightLine and test it with the phone

For Kris, or for a Claude Code session on Kris's PC. Written Oct 24, 2026.

The phone runs the `/tracker` page and moves the two servos over Bluetooth, so it doesn't need to be on the stand. The 3D-printed parts aren't needed for this test.

Status: this firmware compiles (checked with arduino-cli 1.5.1, ESP32 core 3.3.12) but has **never run on a board**. If something misbehaves, note what you saw (step 7).

## 1. Check the wiring

- Pan servo signal wire (yellow or orange) → Feather pin **27**. Tilt servo signal → pin **33**.
- Both servos' red wires → breadboard **+** rail (the 5V supply). Black or brown → **–** rail.
- Feather **GND** → **–** rail. Without this shared ground the servos twitch.
- Never power the servos from the Feather.
- The radar isn't needed for this test. If it is wired: TX/RX to Feather RX/TX, VCC/GND to the rails.

## 2. Set up Arduino IDE (once)

- **Boards Manager:** "esp32 by Espressif Systems", **version 3.x** (tested: 3.3.12). Version 2.x won't compile the Bluetooth part.
- **Libraries:** "ESP32Servo" by Kevin Harrington (tested 3.2.1) and "ld2410" by ncmreynolds (tested 0.2.2).
- **Board:** Tools → Board → esp32 → **Adafruit Feather ESP32 V2**.

## 3. Upload

1. Get this branch, `sightline-bluetooth-mist` (PR #7): `git fetch` then `git checkout sightline-bluetooth-mist`. Or on GitHub: the branch → Code → Download ZIP.
2. In `hardware/firmware/sightline/`, copy `secrets.example.h` to `secrets.h`. For this test, leave it as it is (blank: no WiFi needed).
3. Open `sightline.ino`, pick the Feather's port, and press **Upload**.
4. Keep the USB cable plugged in during the test; it powers the Feather.

## 4. What you should see

- **Serial Monitor at 115200:**
  - "Left radar NOT found - check wiring" (fine with no radar)
  - "Radar mode: 1 radar (detected at startup)"
  - "Bluetooth: advertising as PhoneTracker"
  - then status lines like `L=  0 R=  0 pan= 90 ... SEARCHING`.
- **Self-test right after start:** the head goes center → left → right → up → center. If both servos do that, the wiring is right.
- **Then, with no radar, it sweeps slowly left and right by itself.** That's normal: it's "searching" for someone. It stops whenever the phone takes over.

## 5. Control it from the phone (Samsung S22, Chrome)

1. Turn on Bluetooth on the phone. If Android asks for Location or Nearby devices, allow it: Chrome needs it to find the stand.
2. Open the tracker page over **https** (Bluetooth only works on https). Either use the temporary `…trycloudflare.com/tracker` link Apple sends (served from Apple's PC, so it only works while that's running), or the team site's `/tracker` once PR #13 is merged.
3. **Start watching** → **Connect stand** → choose **PhoneTracker** → Pair. The button turns green and says **Disconnect**.
4. **Settings → Test the motors.** Press **Left, Right, Up, Down, Center**: the servos should go there. If Left goes the wrong way, press **Flip left/right**; the same for Up and **Flip up/down**. These settings are saved on the phone.
5. **Optional:** close Settings and tap a person. The pan servo turns toward them. The phone isn't on the stand, so it can't see the turn and keeps going to the end. That still shows the phone is steering.

## 6. If something's wrong

| Problem | Likely cause | Fix |
|---|---|---|
| Upload can't connect | Charge-only cable, or the wrong port | Another cable; the port that appears when you plug in; hold **BOOT** while it says "Connecting…" |
| Compile error about `String` / `getValue` | ESP32 core 2.x | Boards Manager → esp32 3.x |
| "Sketch too big" | Small partition | Tools → Partition Scheme → a bigger app (it used 42% when checked, so unlikely) |
| No self-test movement | Servo power or signal wires | Check the 5V rail, pins 27/33 and the shared GND |
| Servos twitch or the Feather restarts | No shared ground, or servos powered from the Feather | Feather GND to the – rail; servo red wires to the 5V rail |
| Phone doesn't list PhoneTracker | Bluetooth or Location off; the page isn't https; another app connected | Turn them on; use the https link; close LightBlue or other Bluetooth apps; press Reset on the Feather |
| Connects, but the test buttons are greyed out | The page is tracking someone | Press **Release** on the main screen |

## 7. Report back to Apple

- Did the self-test move both servos?
- Did the phone find and connect to PhoneTracker?
- Did Left/Right/Up/Down work, and which ones needed flipping?
- Any errors in the Serial Monitor (copy the lines).

## For a Claude Code session on Kris's PC

Read this file first, then `phone-tracker/CLAUDE.md` on branch `tracker-phone-friendly` (PR #13) for the whole project. Ask Kris before installing anything or uploading to the board. The same steps with arduino-cli:

```
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
arduino-cli lib install ESP32Servo ld2410
arduino-cli compile --fqbn esp32:esp32:adafruit_feather_esp32_v2 hardware/firmware/sightline
arduino-cli board list
arduino-cli upload -p COM5 --fqbn esp32:esp32:adafruit_feather_esp32_v2 hardware/firmware/sightline
arduino-cli monitor -p COM5 -c baudrate=115200
```

`arduino-cli board list` shows the real port; use it in place of COM5. On Windows, keep Arduino's data folder on a short path: the ESP32 toolchain fails past Windows' 260-character path limit (error: `machine/_default_types.h: No such file`).
