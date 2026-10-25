// Host-side checks for the stand's inner-loop PID. firmware.h is made by run.sh from
// sightline.ino (its constants plus the code between "innerPid begin" and "innerPid end").
#include "firmware.h"
#include <cstdio>
#include <initializer_list>

static int failures = 0;
static void check(bool ok, const char *what) {
  printf("%s  %s\n", ok ? "ok  " : "FAIL", what);
  if (!ok) failures++;
}

const float DT = CAMERA_TICK_MS / 1000.0f;

struct Run {
  float maxSpeed = 0, maxAccel = 0, maxOvershoot = 0;
  bool awayFromAim = false;
};

// Tracks a fixed aim from `start`; records speed, speed-up, and swinging past.
static Run stepTo(InnerPid pid, float start, float aim, float top, int ticks, float *end) {
  Run r;
  float pos = start, lastV = 0;
  pid.reset(pos, true);
  for (int i = 0; i < ticks; i++) {
    float next = pid.step(pos, aim, top, DT);
    float v = (next - pos) / DT;
    if (fabsf(v) > r.maxSpeed) r.maxSpeed = fabsf(v);
    if (fabsf(v - lastV) / DT > r.maxAccel && fabsf(v) > 0) r.maxAccel = fabsf(v - lastV) / DT;
    float past = (aim - start) > 0 ? next - aim : aim - next;
    if (past > r.maxOvershoot) r.maxOvershoot = past;
    if ((next - pos) * (aim - pos) < 0) r.awayFromAim = true;
    lastV = v;
    pos = next;
  }
  *end = pos;
  return r;
}

// The old easing the website still assumes: 25% of the remaining way per tick, capped at
// the top speed, nothing within MOVE_DEADBAND.
static float oldEase(float pos, float aim, float top) {
  if (fabsf(aim - pos) < MOVE_DEADBAND) return pos;
  return pos + fminf(fmaxf((aim - pos) * 0.25f, -top * DT), top * DT);
}

// Test-only I part, so the I-part code still gets checked while KI is 0 in the firmware.
const float TEST_KI = 20;

// A person walking: aims move at `degPerSec`, arriving every 25 ms; the board ticks every 20 ms.
// The lag must be no worse than the old easing, and the speed must never collapse from one
// tick to the next (like 72 -> 46 deg/s) while the motor is still behind.
static void walk(float degPerSec) {
  InnerPid pid = {PAN_KP, PAN_KI, PAN_KD, PAN_ACCEL, 0, 0, 40, 40, 0};
  pid.reset(40, true);
  float pos = 40, old = 40, aim = 40, sumLag = 0, sumOldLag = 0, lastV = 0;
  int n = 0, collapses = 0;
  for (int ms = 0; ms <= 1600; ms += 5) {  // 40 -> at most 232 degrees at 120 deg/s
    if (ms % 25 == 0) aim = 40 + degPerSec * ms / 1000.0f;
    if (ms % 20 != 0 || ms == 0) continue;
    float next = pid.step(pos, aim, PAN_TOP_SPEED, DT);
    float v = (next - pos) / DT;
    pos = next;
    old = oldEase(old, aim, PAN_TOP_SPEED);
    if (ms >= 600) {  // after the start-up
      sumLag += aim - pos;
      sumOldLag += aim - old;
      n++;
      if (v < lastV * 0.7f && aim - pos >= MOVE_DEADBAND) collapses++;
    }
    lastV = v;
  }
  char msg[200];
  snprintf(msg, sizeof msg, "walk %3.0f deg/s: mean lag %.2f deg (old easing %.2f), speed collapses %d",
           degPerSec, sumLag / n, sumOldLag / n, collapses);
  check(sumLag / n <= sumOldLag / n + 0.01f && collapses == 0, msg);
}

// The same walk with a test-only I part: it must be kept through the short holds between
// aims (it never drops), and the speed must not collapse.
static void walkWithI(float degPerSec) {
  InnerPid pid = {PAN_KP, TEST_KI, PAN_KD, PAN_ACCEL, 0, 0, 40, 40, 0};
  pid.reset(40, true);
  float pos = 40, aim = 40, worstIDrop = 0, lastV = 0;
  int collapses = 0;
  for (int ms = 0; ms <= 1600; ms += 5) {
    if (ms % 25 == 0) aim = 40 + degPerSec * ms / 1000.0f;
    if (ms % 20 != 0 || ms == 0) continue;
    float lastI = pid.integral;
    float next = pid.step(pos, aim, PAN_TOP_SPEED, DT);
    float v = (next - pos) / DT;
    pos = next;
    if (ms >= 600) {
      if (lastI - pid.integral > worstIDrop) worstIDrop = lastI - pid.integral;
      if (v < lastV * 0.7f && aim - pos >= MOVE_DEADBAND) collapses++;
    }
    lastV = v;
  }
  char msg[200];
  snprintf(msg, sizeof msg, "walk %3.0f deg/s with a test I part: biggest I drop %.1f, speed collapses %d",
           degPerSec, worstIDrop, collapses);
  check(worstIDrop < 1 && collapses == 0, msg);
}

int main() {
  float end;
  InnerPid pan = {PAN_KP, PAN_KI, PAN_KD, PAN_ACCEL, 0, 0, 90, 90, 0};
  InnerPid tilt = {TILT_KP, TILT_KI, TILT_KD, TILT_ACCEL, 0, 0, 90, 90, 0};
  InnerPid panI = pan;  // for the I-part checks
  panI.ki = TEST_KI;

  Run r = stepTo(pan, 90, 130, PAN_TOP_SPEED, 50, &end);
  check(r.maxSpeed <= PAN_TOP_SPEED + 0.01f, "pan 40 deg jump: never over PAN_TOP_SPEED");
  check(r.maxAccel <= PAN_ACCEL + 1, "pan 40 deg jump: never speeds up faster than PAN_ACCEL");
  check(r.maxOvershoot <= 0 && fabsf(end - 130) < MOVE_DEADBAND, "pan 40 deg jump: settles on the aim, no swinging past");

  r = stepTo(tilt, 90, 105, TILT_TOP_SPEED, 50, &end);
  check(r.maxSpeed <= TILT_TOP_SPEED + 0.01f && r.maxAccel <= TILT_ACCEL + 1, "tilt 15 deg jump: speed and speed-up limits");
  check(r.maxOvershoot <= 0 && fabsf(end - 105) < MOVE_DEADBAND, "tilt 15 deg jump: settles on the aim, no swinging past");

  r = stepTo(tilt, 105, 90, TILT_RETURN_SPEED, 50, &end);
  check(r.maxSpeed <= TILT_RETURN_SPEED + 0.01f && r.maxOvershoot <= 0, "tilt back to level: gentle return speed, no swinging past");

  // Tilt is never ahead of the old easing (25% of the way per 20 ms, top-speed cap,
  // MOVE_DEADBAND), so the website's tilt check never sees the motor ahead of its guess.
  for (float jump : {1.0f, 5.0f, 15.0f, 30.0f}) {
    InnerPid p = tilt;
    p.reset(90, true);
    float pos = 90, old = 90, aim = 90 + jump, worstAhead = 0;
    const float oldStep = TILT_TOP_SPEED * DT;
    for (int i = 0; i < 50; i++) {
      pos = p.step(pos, aim, TILT_TOP_SPEED, DT);
      if (fabsf(aim - old) >= MOVE_DEADBAND) old += fminf(fmaxf((aim - old) * 0.25f, -oldStep), oldStep);
      if (pos - old > worstAhead) worstAhead = pos - old;
    }
    char msg[120];
    snprintf(msg, sizeof msg, "tilt %2.0f deg jump: at most 0.1 deg ahead of the old easing (worst %.2f)", jump, worstAhead);
    check(worstAhead <= 0.1f, msg);
  }
  // The same while someone walks (aims every 25 ms, the board ticks every 20 ms), up to
  // the edge of the tilt range. Where both stop inside MOVE_DEADBAND after that isn't counted.
  for (float degPerSec : {10.0f, 30.0f, 60.0f}) {
    InnerPid p = tilt;
    p.reset(90, true);
    float pos = 90, old = 90, aim = 90, worstAhead = 0;
    const float oldStep = TILT_TOP_SPEED * DT;
    for (int ms = 0; ms <= 1000; ms += 5) {
      if (ms % 25 == 0) aim = fminf(90 + TILT_AIM_RANGE, 90 + degPerSec * ms / 1000.0f);
      if (ms % 20 != 0 || ms == 0) continue;
      pos = p.step(pos, aim, TILT_TOP_SPEED, DT);
      if (fabsf(aim - old) >= MOVE_DEADBAND) old += fminf(fmaxf((aim - old) * 0.25f, -oldStep), oldStep);
      if (aim < 90 + TILT_AIM_RANGE && pos - old > worstAhead) worstAhead = pos - old;
    }
    char msg[120];
    snprintf(msg, sizeof msg, "tilt walk %2.0f deg/s: at most 0.1 deg ahead of the old easing (worst %.2f)", degPerSec, worstAhead);
    check(worstAhead <= 0.1f, msg);
  }

  // Jitter: aims within the deadband never move it.
  {
    InnerPid p = pan;
    p.reset(90, true);
    float pos = 90;
    for (int i = 0; i < 50; i++) pos = p.step(pos, 90 + (i % 2 ? 0.25f : -0.25f), PAN_TOP_SPEED, DT);
    check(pos == 90, "aim jitters +-0.25 deg: motor doesn't twitch");
  }

  // Sudden reversal at full speed, and a kept I part pointing the wrong way: never moves away.
  {
    InnerPid p = panI;
    p.reset(90, true);
    float pos = 90;
    for (int i = 0; i < 6; i++) pos = p.step(pos, 150, PAN_TOP_SPEED, DT);
    bool away = false, past = false;
    for (int i = 0; i < 60; i++) {
      float next = p.step(pos, 80, PAN_TOP_SPEED, DT);
      if (next > pos + 1e-4f) away = true;
      if (next < 80 - 1e-4f) past = true;
      pos = next;
    }
    check(!away && !past && fabsf(pos - 80) < MOVE_DEADBAND, "sudden reversal: never away from the aim, never past it");

    p.reset(90, true);
    p.integral = PID_I_MAX;  // left over from walking right
    p.speed = 0;
    float next = p.step(90, 89, PAN_TOP_SPEED, DT);
    check(next <= 90, "kept I part pointing the other way: doesn't move away from the aim");
  }

  // Anti-windup: aim beyond reach for 3 s (the motor is clamped at PAN_MAX), then back.
  {
    InnerPid p = panI;
    p.reset(160, true);
    float pos = 160;
    for (int i = 0; i < 150; i++) pos = fminf(PAN_MAX, p.step(pos, 200, PAN_TOP_SPEED, DT));
    check(p.integral == 0, "aim out of reach for 3 s: I part stays at 0");
    bool past = false;
    for (int i = 0; i < 60; i++) {
      pos = p.step(pos, 150, PAN_TOP_SPEED, DT);
      if (pos < 150 - 1e-4f) past = true;
    }
    check(!past && fabsf(pos - 150) < MOVE_DEADBAND, "then back to 150: settles without swinging past");
  }

  // Holding still at the aim: the I part fades out after PID_HOLD_TICKS.
  {
    InnerPid p = panI;
    p.reset(90, true);
    p.integral = 20;
    p.speed = 30;
    for (int i = 0; i < PID_HOLD_TICKS; i++) p.step(90, 90.1f, PAN_TOP_SPEED, DT);
    check(p.integral == 0 && p.speed == 0, "held still at the aim for 100 ms: I part and speed forgotten");
  }

  // A big jump in the aim clears the I part.
  {
    InnerPid p = panI;
    p.reset(90, true);
    p.lastTarget = 90;
    p.integral = 20;
    p.step(90, 90 + PID_RESET_JUMP + 1, PAN_TOP_SPEED, DT);
    check(p.integral == 0, "aim jumps more than PID_RESET_JUMP: I part cleared");
  }

  walk(20);
  walk(60);
  walk(120);
  walkWithI(20);
  walkWithI(60);
  walkWithI(120);

  printf(failures ? "%d check(s) failed\n" : "all checks passed\n", failures);
  return failures ? 1 : 0;
}
