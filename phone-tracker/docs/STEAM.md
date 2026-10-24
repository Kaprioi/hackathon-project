# Steam: a humidifier whose mist follows you

The hackathon theme is "Steel and Steam", and the team wants steam in the build. The team's rule: the steam must be **functional and tied to what the camera does**, not something bolted on to meet the theme.

**Test for any steam idea:** take the camera away. If the steam still makes sense on its own, it's a separate project bolted on.

## Decided (Oct 23): the mist follows the person

**Apple's reason:** "I don't like when my humidifier only sprays mist in one direction when I walk around my room or move from my bed to my chair. I'd like the mist to keep tracking me." For patients in wheelchairs or in bed, re-aiming a nozzle by hand is even more annoying, or impossible.

**Why it passes the test:** without the tracking it's just a humidifier pointing at a wall. The camera, the radar and the Hidden rule decide where the mist goes, including when the person is under a blanket in bed (radar confirms they're there) and in a dark room at night. Steam also usually blinds cameras; the 24 GHz radar sees through mist, so the lock holds.

**How it works**
- The nozzle rides on the pan-tilt head beside the phone and points where the camera points. The website aims at the chest by default (Settings → Aim height), not the face.
- The water tank, a floating 5V ultrasonic mist maker and a small 5V fan sit in a closed tank **beside** the base box. The fan blows into the tank; mist leaves through a tube up to the nozzle.
- One MOSFET module on Feather pin **A0 (GPIO 26)** switches the mist maker and fan together.
- The website has three mist settings: **Off**, **On**, and **Follow me** (mist only while it knows where you are: TRACKING, HIDDEN, FOLLOWING).
- Safety in the firmware: mist is off at power-on, off when the phone disconnects, and off if the phone hasn't said "mist on" for 3 seconds.
- Layout and sizes: the 3D mockup at https://claude.ai/artifact/VGajiyE2hiaV4B1B3DpeaD and `docs/BUILD_STEPS.md` Part B2.

**Demo:** the volunteer sits in a "bed" (a chair with a blanket), then moves to a second chair. The mist plume swings with them. They pull the blanket over themselves: HIDDEN, the radar says they're there, and the mist stays on them.

## Tests before relying on it

- **Reach:** how far does visible mist travel from the nozzle? A small 5V mist maker may reach only 0.5–1.5 m (an estimate). If it's too weak, a 24V multi-head fogger is much stronger but needs its own supply and a MOSFET rated for it.
- **Drips:** run it for 10 minutes and check for water on the radar boards (they're bare: droplets could short them), the phone and the base box.
- **Condensation in the tube:** the tube must run downhill to the tank with no dips.
- **Radar through mist:** it should be unaffected; confirm the radar still reads `1` with mist between it and the person.
- **Venue:** ask the organizers about water mist near electronics. Cold mist won't set off smoke detectors the way fog machines can, but check.

## Parts (rough prices, nothing bought yet)

See `docs/SHOPPING_LIST.md` → Humidifier.

## Safety

- Ultrasonic mist is cold, so it can't burn anyone.
- Use distilled water, or the mist leaves white dust everywhere.
- Empty and dry the tank daily. Standing water in a humidifier grows bacteria, which matters more for someone who is ill.
- Keep water below and away from the electronics, and never inside the base box.
- Don't run the mist maker without water.

## Earlier ideas (not chosen)

- **Steam shield:** fog a tote around a valuable when an intruder reaches for it, and keep tracking them through the fog. Replaced by the humidifier.
- **Steam room safety:** alert when someone in a steam room stops moving. Kept as a pitch use case only.
- **Auto follow-spot:** a light beam visible in stage haze. The steam didn't connect to the tracking.
- **Steam for arthritic hands:** fails the test above.

## Parked theme look (from the first chat)

- Name idea: "The Iron Owl". Pitch line: "A Victorian watchman automaton that never loses sight of you, even under a blanket."
- Printed brass-painted boiler base with rivets and a chimney (electronics inside), side gears, a lens hood around the camera.
- Metallic paint blocks radar, so keep it off anything in front of the radars.
- Brass status pill, target box and dial gauges in the website.
