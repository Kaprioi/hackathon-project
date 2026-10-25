// The camera page's settings as this phone saved them, with the iPhone's own defaults.
// No React or browser storage here, so it can be tested with `npm test`.

import { DEFAULT_SETTINGS, type Settings } from "./config.ts";

/**
 * The settings to start with. Face recognition starts off on iPhones: its AI is heavy,
 * and iOS restarts the page (or the Home Screen app) when it runs short of memory.
 * Phones that saved their settings before that default carry the old "on", so on an
 * iPhone a saved "on" only counts when someone switched faces on in Settings by hand.
 *
 * Up/down (tiltSign) only counts when someone chose it by hand (Settings: Flip up/down,
 * `tiltChosen`). The page also flips up/down by itself when it notices the motor turning the
 * wrong way (tiltCheck.ts), but only for this visit: a wrong automatic flip used to be saved,
 * and then the stand kept looking up (or down) for good, even after a reload. Settings saved
 * back then can't tell a flip made by hand from an automatic one, so a flip saved before is
 * dropped once; press Flip up/down again and it stays.
 */
export function startSettings(
  saved: Partial<Settings> | null,
  iPhone: boolean,
  facesChosen: boolean,
  tiltChosen: boolean,
): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, faces: !iPhone, ...saved };
  if (iPhone && !facesChosen) s.faces = false;
  if (!tiltChosen) s.tiltSign = DEFAULT_SETTINGS.tiltSign;
  return s;
}

/** What to save for settings `s`: up/down as last chosen by hand (`handTiltSign`), never an automatic flip. */
export function settingsToSave(s: Settings, handTiltSign: Settings["tiltSign"]): Settings {
  return { ...s, tiltSign: handTiltSign };
}
