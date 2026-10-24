# Demo and pitch

## One-line pitch

"A humidifier that keeps its mist on you. It watches with a phone and two radars, so it follows you from bed to chair, keeps aiming when you're under the covers or the lights are off, and comes back to you when you walk out and return."

## 36-hour plan

| Hours | Goal | Done when |
|---|---|---|
| Before | Order parts, print the SightLine parts, test the website on the PC webcam, deploy it, run the Bluefy camera test | `/tracker` opens on the iPhone in Bluefy |
| 0–3 | Head assembled, wired, firmware on | LightBlue moves both motors, the radar reads, `1` on `…0004` clicks the mist switch |
| 3–7 | Website on the phone, driving the stand | It follows you around the room |
| 7–11 | Mist on the head | "Follow me" mist swings with you from chair to chair |
| 11–14 | Hidden mode and the radar | It keeps the mist on you under a blanket; an empty blanket goes LOST within about 5 s |
| 14–20 | Sleep | Seriously |
| 20–24 | Walking out of view, re-finding | It turns after you when you leave, and locks back onto you, not your teammate |
| 24–29 | Polish, drip check, SightLine alerts | It works the same way three times in a row; no water on the radars |
| 29–33 | Rehearse at least 5 times | Same result every run |
| 33–36 | Pitch and buffer | Slides ready, rig packed |

If behind schedule, cut in this order: the SightLine WiFi alerts, the room sweep (SEARCHING), then re-finding. Protect two moments: **the mist swinging to follow someone from bed to chair**, and **someone pulling a blanket over themselves while the stand keeps aiming at the lump**.

## Main demo

1. A volunteer sits in the "bed" (a chair with a blanket). Tap them on the phone: TRACKING. Turn the mist to **Follow me**.
2. They get up and walk to a second chair, the "wheelchair". The head turns with them, and so does the mist.
3. They turn their back: it keeps following, because it tracks the whole body, not the face.
4. They pull the blanket over themselves. The box goes dashed (HIDDEN), the radar says someone's there, and the mist stays on them.
5. They slip out of view on one side. The head keeps turning that way (FOLLOWING), and locks back on when it sees them.

## Extra demos for "what else can it do?"

1. **Pick a judge:** a judge taps themselves on the phone, then tries to lose it.
2. **Crowd swap:** two or three people cross paths; it stays on the right one.
3. **Leave and return:** the target walks out and back in from another spot; it re-finds them by their clothes.
4. **Decoy blanket:** the target slips out and leaves an empty lump; the radar reads empty, so it goes LOST instead of misting an empty bed.
5. **The log:** the on-screen log shows why it made each call ("You vanished where you stood and nobody walked away. Watching the cover.").
6. **Lights off:** the camera can't see, but the radars keep the head pointed at the person (SightLine firmware).

## "Can it turn all the way around?"

"This build covers 160°, which is enough for one side of a bedroom. 360° is a hardware upgrade, not a software one:

1. **A pan motor that can spin forever and still knows its angle:** a stepper motor with a driver and a home switch, or a smart servo with a multi-turn mode (for example a Dynamixel). The cheap '360° servos' can't report their angle, which is why we didn't use them.
2. **A slip ring:** a rotating connector that passes power and signal through the spinning joint, so the wires never twist. Security cameras with endless pan work this way. The phone talks over Bluetooth, so it needs no wires.
3. **Mist up the hollow centre of the spinning axis.** Mist is low-pressure air, so a loose sleeve joint works; no watertight seal needed.

The software already works in room angles, so 360° means changing the angle limits and letting the pan wrap around."

Rough extra cost: $40–80 (an estimate). Belkin's DockKit iPhone stand already rotates 360°, which shows the mechanics are standard.

## Honest limits, if asked

- **Mist reach:** a small humidifier's mist only travels about a metre (to be measured), so the stand sits near the bed or chair, not across the room.
- **One person at a time:** the software sees everyone, but one nozzle can only aim at one person.
- **Through walls:** no. The radar works through blankets, cardboard and mist, not walls.
- **Shell game:** two identical boxes shuffled around can fool it, and so can covering up out of view.
- **Same clothes:** re-finding uses clothing colours, so two people dressed alike can confuse it after a LOST.
- **FaceTime:** iOS gives the camera to one app at a time. During a SightLine FaceTime call, the radars steer instead of the camera.
- **Speed:** about 8 frames a second on a laptop's built-in graphics; the iPhone should be faster (not yet measured).

## Use cases

- **Patients in bed or in a wheelchair:** dry air hurts throats, eyes and skin. A humidifier that keeps aiming at them, without anyone re-aiming the nozzle.
- **Older family members living alone:** SightLine's alerts. If they're out of view too long, a caregiver's phone buzzes, and one tap starts a FaceTime call to the stand.
- **Steel and steam:** steam rooms, boiler rooms and foundries fill with steam that blinds cameras; the radar keeps confirming a person is there.

## "Isn't this surveillance?"

"Everything runs on the phone. No video is recorded or sent anywhere, and it only follows someone who was picked on the screen."
