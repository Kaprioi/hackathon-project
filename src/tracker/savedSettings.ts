// The camera page's settings as this phone saved them, with the iPhone's own defaults.
// No React or browser storage here, so it can be tested with `npm test`.

import { DEFAULT_SETTINGS, type Settings } from "./config.ts";

/**
 * The settings to start with. Face recognition starts off on iPhones: its AI is heavy,
 * and iOS restarts the page (or the Home Screen app) when it runs short of memory.
 * Phones that saved their settings before that default carry the old "on", so on an
 * iPhone a saved "on" only counts when someone switched faces on in Settings by hand.
 */
export function startSettings(saved: Partial<Settings> | null, iPhone: boolean, facesChosen: boolean): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, faces: !iPhone, ...saved };
  if (iPhone && !facesChosen) s.faces = false;
  return s;
}
