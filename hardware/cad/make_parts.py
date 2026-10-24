"""Generates the SightLine 3D-printable parts as STL files.

    pip install manifold3d trimesh numpy
    python make_parts.py            # writes the STLs in stl/ (radar_phone_head_single.stl is the one-radar head)

All sizes are millimetres. Print in PLA, 0.2 mm layers, 20% infill, no supports.
"""

import math
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import Manifold

SEG = 48

# ---------- shared helpers ----------

def box(x, y, z, at=(0, 0, 0)):
    return Manifold.cube([x, y, z]).translate(list(at))


def cyl(h, d, at=(0, 0, 0), seg=SEG):
    return Manifold.cylinder(h, d / 2, d / 2, seg).translate(list(at))


def rounded_box(x, y, z, r=3):
    corners = [cyl(z, 2 * r, (cx, cy, 0)) for cx in (r, x - r) for cy in (r, y - r)]
    return Manifold.batch_hull(corners)


def slot(length, d, h, at, axis_x=True):
    """A stadium-shaped hole: two cylinders joined by a hull."""
    ax, ay, az = at
    if axis_x:
        ends = [(ax - length / 2, ay), (ax + length / 2, ay)]
    else:
        ends = [(ax, ay - length / 2), (ax, ay + length / 2)]
    return Manifold.batch_hull([cyl(h, d, (ex, ey, az)) for ex, ey in ends])


# ---------- base box + lid ----------
# Fits a half-size breadboard (82 x 55 mm) with the Feather plugged into it.
# Height leaves room for the pan servo, which hangs ~27 mm below the lid,
# above the Feather and its jumper wires.
IN_X, IN_Y, IN_Z = 100, 70, 56
WALL, FLOOR_T, LID_T, LIP, TOL = 2.4, 9, 3, 2, 0.4   # thick floor holds the tripod nut
OUT_X, OUT_Y = IN_X + 2 * WALL, IN_Y + 2 * WALL

# Hitec HS-422 standard servo (ships with the Lynxmotion pan-tilt kit)
SERVO_CUT = (41.0, 20.4)            # body is 40.6 x 19.8 mm
SERVO_HOLE_DX, SERVO_HOLE_DY = 24.0, 5.0   # mounting holes 48 x 10 mm apart
SERVO_OFFSET_X = 10                 # puts the output shaft near the box centre

# 1/4"-20 hex nut trapped in the floor: fits a camera tripod or a carriage bolt.
NUT_AF, NUT_H, BOLT_D = 11.3, 5.8, 6.8


def base_box():
    shell = rounded_box(OUT_X, OUT_Y, FLOOR_T + IN_Z) - box(IN_X, IN_Y, IN_Z + 1, (WALL, WALL, FLOOR_T))
    cx, cy = OUT_X / 2, OUT_Y / 2
    cuts = [
        cyl(FLOOR_T + 2, BOLT_D, (cx, cy, -1)),
        # hex pocket: drop the nut in from inside; the breadboard then covers it
        cyl(NUT_H + 1, NUT_AF / math.cos(math.radians(30)), (cx, cy, FLOOR_T - NUT_H), seg=6),
        # barrel-jack adapter hole on the short side
        cyl(WALL + 2, 11.5).rotate([0, 90, 0]).translate([-1, cy, FLOOR_T + 12]),
        # USB-C access slot for programming the Feather (line its USB end up with this)
        box(30, WALL + 2, 12, (14, -1, FLOOR_T + 8)),
    ]
    cuts += [box(WALL + 2, 4, 18, (OUT_X - WALL - 1, 12 + i * 10, FLOOR_T + 10)) for i in range(5)]
    for c in cuts:
        shell = shell - c
    return shell


def base_lid():
    """Modelled upside down (lip pointing up) so it prints flat with no supports."""
    plate = rounded_box(OUT_X, OUT_Y, LID_T)
    lx, ly = IN_X - 2 * TOL, IN_Y - 2 * TOL
    lip = box(lx, ly, LIP, (WALL + TOL, WALL + TOL, LID_T)) - box(
        lx - 3.2, ly - 3.2, LIP + 2, (WALL + TOL + 1.6, WALL + TOL + 1.6, LID_T - 1))
    lid = plate + lip
    sx, sy = OUT_X / 2 + SERVO_OFFSET_X, OUT_Y / 2
    lid = lid - box(SERVO_CUT[0], SERVO_CUT[1], 20, (sx - SERVO_CUT[0] / 2, sy - SERVO_CUT[1] / 2, -5))
    for dx in (-SERVO_HOLE_DX, SERVO_HOLE_DX):
        for dy in (-SERVO_HOLE_DY, SERVO_HOLE_DY):
            lid = lid - slot(1.6, 2.6, 20, (sx + dx, sy + dy, -5))  # slotted for tolerance
    # pass-through for the tilt servo + radar cables
    lid = lid - cyl(20, 14, (22, OUT_Y / 2, -5))
    return lid


# ---------- radar head ----------
# Holds two LD2410C boards (22 x 16 mm) toed out left and right. Comparing how
# strongly each one "hears" the person tells the firmware which way to turn.
TOE = 25
BOARD = (22.4, 16.4)
BOARD_T = 1.8
PLATE = (56, 34, 3)
HOLDER_T = 3


def radar_holder():
    w, h = BOARD[0] + 2 * HOLDER_T, BOARD[1] + HOLDER_T + 2
    body = box(w, 8, h)
    cuts = [
        box(BOARD[0], BOARD_T, BOARD[1] + 10, (HOLDER_T, 3, HOLDER_T)),            # PCB slides in from the top
        box(BOARD[0] - 4, 4.5, BOARD[1] + 10, (HOLDER_T + 2, -1, HOLDER_T + 2)),    # open window for the antenna
        box(BOARD[0] - 2, 4, BOARD[1] + 10, (HOLDER_T + 1, 3 + BOARD_T - 0.01, HOLDER_T)),  # parts + header relief
        box(16, 7, HOLDER_T + 2, (w / 2 - 8, 2, -1)),                               # wire exit
    ]
    for c in cuts:
        body = body - c
    # window side (y = 0) becomes the front, facing +y
    return body.mirror([0, 1, 0]).translate([-w / 2, 0, 0])


def head_plate():
    plate = box(*PLATE, (-PLATE[0] / 2, -PLATE[1] / 2, 0))
    for y in (-8, 8):
        plate = plate - slot(22, 3.4, 20, (0, y, -5))   # fits most bracket hole patterns
    return plate - cyl(20, 8, (0, 0, -5))               # wire bundle


def radar_head():
    plate = head_plate()
    for side in (-1, 1):
        plate = plate + radar_holder().rotate([0, 0, -side * TOE]).translate(
            [side * 17, PLATE[1] / 2, PLATE[2] - 0.01])
    return plate


# ---------- radar head with an iPhone backplate ----------
# The phone (iPhone 14 in a case, ~150 x 76 x 11 mm, ~200 g) is glued by its
# case to a backplate that holds it in landscape just above the radars, screen
# facing forward. Its weight sits over the tilt joint, so the servo isn't
# levered. The backplate stays 70 mm wide so it misses the rear camera bump
# whichever way the phone is turned.
BACK_W, BACK_T, BACK_TOP = 70, 4, 90
PHONE_FRONT_Y, PHONE_DEPTH, PHONE_Z0 = -5.5, 13, 28   # case face line, shelf depth, phone bottom
SHELF_W = 44                                          # stays clear of the radar slots


def radar_phone_head(single=False):
    """single=True: one radar facing straight ahead, for one-radar mode."""
    y_back = PHONE_FRONT_Y - BACK_T
    if single:
        head = head_plate() + radar_holder().translate([0, PLATE[1] / 2, PLATE[2] - 0.01])
    else:
        head = radar_head()
    head = head + box(BACK_W, BACK_T, BACK_TOP - PLATE[2], (-BACK_W / 2, y_back, PLATE[2] - 0.01))
    # shelf the case rests on while the glue cures, with a 45° wedge under it so it prints without supports
    shelf = box(SHELF_W, BACK_T + PHONE_DEPTH, 3, (-SHELF_W / 2, y_back, PHONE_Z0 - 3))
    wedge_foot = box(SHELF_W, BACK_T, 1, (-SHELF_W / 2, y_back, PHONE_Z0 - 3 - PHONE_DEPTH))
    lip = box(SHELF_W, 1.6, 3, (-SHELF_W / 2, PHONE_FRONT_Y + PHONE_DEPTH - 1.6, PHONE_Z0 - 0.01))
    head = head + Manifold.batch_hull([shelf, wedge_foot]) + lip
    # two gussets behind the backplate stiffen it against wobble
    for x in (-28, 28):
        head = head + Manifold.batch_hull([
            box(3, y_back - (-PLATE[1] / 2), 3, (x - 1.5, -PLATE[1] / 2, PLATE[2] - 0.01)),
            box(3, 0.5, 40, (x - 1.5, y_back - 0.5, PLATE[2] - 0.01)),
        ])
    return head


def save(m, path):
    mesh = m.to_mesh()
    verts = np.asarray(mesh.vert_properties)[:, :3]
    tris = np.asarray(mesh.tri_verts)
    t = trimesh.Trimesh(verts, tris, process=False)
    t.export(path)
    lo, hi = t.bounds
    print(f"{path.name:16s} {len(tris):6d} triangles  size {hi[0]-lo[0]:.1f} x {hi[1]-lo[1]:.1f} x {hi[2]-lo[2]:.1f} mm  watertight={t.is_watertight}")


if __name__ == "__main__":
    out = Path(__file__).parent / "stl"
    out.mkdir(exist_ok=True)
    save(base_box(), out / "base_box.stl")
    save(base_lid(), out / "base_lid.stl")
    save(radar_head(), out / "radar_head.stl")
    save(radar_phone_head(), out / "radar_phone_head.stl")
    save(radar_phone_head(single=True), out / "radar_phone_head_single.stl")
