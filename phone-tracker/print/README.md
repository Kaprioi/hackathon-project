# Parts to 3D-print

Apple prints on a Creality printer. Put design files (OpenSCAD `.scad`, `.stl`, `.3mf`) in this folder.

## SightLine head (the hardware the team is building)

Kris already designed these: `hardware/cad/make_parts.py` and `hardware/cad/stl/` on the `hardware-build-guide` branch (`base_box.stl`, `base_lid.stl`, `radar_phone_head.stl`, `radar_head.stl`). Print instructions are in Kris's `hardware/build-guide.html`.

## Mist nozzle arm (new, not designed yet)

From the 3D mockup (https://claude.ai/artifact/VGajiyE2hiaV4B1B3DpeaD):

- Mounts on the outer edge of SightLine's radar plate, at the end of the phone **opposite** the front camera, at about mid-phone height.
- Holds a nozzle for the ~16 mm tube. The tip sits about 4.5 cm in front of the screen, pitched up about 8° from the camera's direction, so the mist goes where the camera looks.
- Never above the phone: cold mist sinks, and falling mist would cross the screen and lens.
- The tip must be ahead of and outside both radar windows. The radar boards are bare, so droplets could short them.
- Keep the arm and nozzle under about 30 g (an estimate). The tilt servo already carries the phone (~200 g).

## Tank lid parts (new, not designed yet)

- A ring that holds a 40 mm fan over a hole in the tank lid, blowing in.
- A spigot for the tube.
- A dry spot for the mist maker's driver board.

## Small parts

- Cable and tube clips along the bracket, so the wires and the mist tube don't snag as the head moves. Clip the tube near the tilt axle.

## Single-radar Phone Tracker stand (fallback only)

- **Phone holder:** holds the phone sideways (landscape), centered over the tilt axle. A captured-nut slot for a 1/4"-20 nut, so a 1/4"-20 × 1/2" hex bolt from below fastens it to the Lynxmotion kit's top plate. Leaves the cameras, the side buttons and the charging port clear. A flat spot on top for the LD2410C radar, facing the same way as the camera that faces the person.
- **Base box:** about 15 × 15 cm, weighted so the stand can't tip. Holds the half-size breadboard and the ESP32, with openings for the USB-C and power cables.
