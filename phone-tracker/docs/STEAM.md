# Steam

The hackathon theme is "Steel and Steam", and the team wants steam in the build. The team's rule: the steam must be **functional and tied to what the camera does**, not something bolted on to meet the theme.

**Test for any steam idea:** take the camera away. If the steam still makes sense on its own, it's a separate project bolted on. (A friend's idea of steam for soothing arthritic hands fails this test, so it's ruled out.)

Steam fits in one of two ways:
- **The rig makes steam for a reason that depends on the tracking.**
- **Steam is the problem the tracking is built to beat.**

The rig's edge: the radar and the Hidden rule keep the lock when the camera can't see. Steam is exactly what blinds cameras. The LD2410C works at 24 GHz, which passes through fog and water droplets.

## Option 1: Steam shield (top candidate, not yet decided)

- **Idea:** security fog machines already exist; shops and warehouses fill a room with fog the moment an alarm goes off, so a thief can't see what to grab. Their catch is that the fog blinds the security cameras too. This rig fogs the area and keeps tracking the intruder through it, using the radar and object permanence.
- **Why it fits:** the steam is the defense, and the tracking is what makes fogging usable. Each half needs the other.
- **Demo:** a valuable prop in a clear plastic tote with a mist maker inside. When the tracked person reaches for it, the ESP32 fills the tote with steam. A second fog-filled tote between the camera and the person: the camera loses them, but the radar and the Hidden rule hold the lock.
- **Build notes:** the trigger could be the target's box entering a "no-go zone" in the frame. The app sends a command; the ESP32 switches the fogger through a MOSFET on pin 14 (the first themed draft used pin 14 and a `puff` command).

## Option 2: Steam room safety

- **Idea:** people faint in steam rooms and saunas, and staff can't see them through the steam. The rig locks onto each person as they enter, keeps tracking through the steam, and raises an alert if someone stops moving for too long. The same idea works for workers in steamy boiler rooms and steel mills.
- **Why it fits:** it uses all four tracking states as they are.
- **Extra work:** the radar's OUT pin only says "someone there". To detect "stopped moving", the ESP32 must read the radar's serial data, which reports moving and still targets separately (for example with the ncmreynolds `ld2410` Arduino library). Moderate firmware addition.
- **Demo:** a fog-filled tote in front of the camera simulates the steam room; someone lying still behind it triggers the alert.

## Option 3: Auto follow-spot (weaker)

- **Idea:** theaters fill the stage with haze so spotlight beams show up, and a person aims each follow-spot by hand. Add a narrow LED spotlight to the rig; it follows a performer automatically, with the beam visible in the mist.
- **Why it's weaker:** the steam only makes the beam visible; it doesn't connect to the hard part of the tracking. Never use a laser instead of the LED, because it would shine in people's eyes.

## Recommendation

Use the steam shield as the build feature, and the steam room as a second use case in the pitch.

## Tests before committing

- **Fog density:** one small 5V mist maker fills a closed tote slowly. A multi-head pond fogger is much faster but needs its own power supply. Check whether a fogged tote really blocks the camera.
- **Radar through the tote:** thin plastic and fog should barely affect it. Test it.
- **Venue:** ask the organizers about water mist. A closed tote keeps it contained. Real fog machines can set off smoke detectors.
- Keep the blanket demo as the backup.

## Parts (rough prices, check before buying)

- 5V ultrasonic mist maker that starts misting as soon as it gets power (no on button): about $8–12.
- Or a multi-head pond fogger with its own 24V supply: about $20–35.
- MOSFET switch module that triggers from 3.3V: about $3–5.
- Clear plastic tote(s).

## Safety

- Ultrasonic mist is cold, so it can't burn anyone.
- Use distilled water, or the mist leaves white dust everywhere.
- Keep water below and away from the electronics and the camera lens.

## Smaller extras (only after a functional steam feature works)

- **Steam signals:** one puff on lock-on, two when Hidden, one long puff when Lost.
- **The machine breathes:** while Hidden and the radar senses someone, puff softly every few seconds.
- **Phone sounds:** the iPhone plays a hiss on lock-on and a whistle on re-find. No hardware.
- **Steam-valve control:** a printed handwheel on a rotary encoder releases the target or recenters the camera.

## Parked theme look (from the first chat)

- Name idea: "The Iron Owl". Pitch line: "A Victorian watchman automaton that never loses sight of you, even under a blanket."
- Printed brass-painted boiler base with rivets and a chimney (electronics inside), side gears, a lens hood around the rear camera.
- Metallic paint blocks radar, so keep it off anything in front of the radar.
- Brass status pill, target box and dial gauges in the app.
