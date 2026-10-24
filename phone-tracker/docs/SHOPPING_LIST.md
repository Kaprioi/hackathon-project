# Shopping list

> **Oct 24, 2026:** the humidifier is dropped (parts not obtainable). Skip every humidifier part below (mist maker, fan, tank, tube, MOSFET module).

Last checked Oct 17, 2026. Tick each box once it's actually ordered.

## Buy

| ✓ | Part | Where | Price | Notes |
|---|---|---|---|---|
| [ ] | Lynxmotion Pan and Tilt Kit | RobotShop, SKU RB-Lyn-74, manufacturer # **BPT-KT** | $48.65 | Includes 2× Hitec HS-422 servos. RobotShop also sells a no-servo version, so check the part number. |
| [ ] | Adafruit ESP32 Feather V2 **with headers** | Adafruit, PID 5900 | $20.95 | Not the $19.95 version without headers, which needs soldering. |
| [ ] | Adafruit 5V 4A power supply | Adafruit, PID 1466 | $14.95 | Wasn't in the Adafruit cart on Oct 17. Order it with the ESP32. |
| [ ] | California JOS DC jack adapters, 2 male + 2 female, 2.1 × 5.5 mm | Amazon | $3.97 | Use one of the **female** ones. |
| [ ] | Coliao LD2410C radar, 2-pack | Amazon | $14.99 | SightLine uses both (left and right). The single-radar stand uses one and keeps one spare. |
| [ ] | 1/4"-20 × 1/2" **hex-head** bolt with a nut | Any hardware store | about $1 | Holds the printed phone holder to the kit's top plate. |

About $104 total, plus shipping and tax.

## Remove from the carts

- [ ] Mywish carriage bolts, 1/4-20 × 1-1/2" (Amazon, $9.99): too long, and the round head can't be gripped.

## Check the Arduino kit first; buy only what's missing

- [ ] Half-size breadboard (Adafruit PID 64, $4.95)
- [ ] Male/male jumper wires (Adafruit PID 1957, $1.95)
- [ ] Male/female jumper wires, at least 30 cm, for the radar. The wires bundled with the radar may be female on both ends.
- [ ] Optional: 1000 µF electrolytic capacitor, 10 V or more (about $1), only if the motors jitter.

Without the carriage bolts the Amazon subtotal is about $19, under the $35 free-shipping minimum, so shipping is $6.99.

## Already have

- iPhone (goes on the rig), Mac with Xcode
- USB-C cable that carries data, not a charge-only one
- Creality 3D printer and filament
- Small Phillips screwdriver, foam tape or zip ties

## Humidifier (the mist that follows you)

Nothing here is approved or bought yet. Prices are rough estimates from Oct 23; check before buying. See `docs/STEAM.md` and `docs/BUILD_STEPS.md` Part B2.

| ✓ | Part | Price (estimate) | Notes |
|---|---|---|---|
| [ ] | 5V ultrasonic mist maker, floating type | $8–12 | Must start misting as soon as it gets power (no on button). Driver board on a lead, so it can sit dry on the lid. |
| [ ] | 5V fan, 40 mm | $3–6 | Blows into the tank to push mist up the tube. |
| [ ] | MOSFET switch module, logic-level (turns on from 3.3 V) | $3–5 | One module switches the mist maker and the fan together, from pin A0. |
| [ ] | Diode, 1N5819 or 1N4007 | under $1 | Across the fan, unless the module has one built in. |
| [ ] | Tank with a lid, about 1.5 L | $3–6 | A food container works. Drill holes for the fan and the tube spigot. |
| [ ] | Tube, about 16 mm across, about 1 m | $5–10 | Light silicone or a slim CPAP hose. |
| [ ] | Distilled water | $1–2 | Tap water leaves white dust. |

About $25–40 total. If the 5V mist is too weak (test in `docs/STEAM.md`), a 24V multi-head pond fogger ($20–35) is much stronger, but needs its own 24V supply and a MOSFET rated for it.

## SightLine radars

SightLine uses **both** LD2410C radars from the 2-pack (left and right), so there's no spare. Consider a second 2-pack ($14.99) for a spare.

## Don't buy

FotodioX clamp or tripod kit · a wooden base board · MG996R servos · a generic pan-tilt bracket · metal servo horns · a lazy susan bearing · DroidCam Pro · a 6 ft USB cable
