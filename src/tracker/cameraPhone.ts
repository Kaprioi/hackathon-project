// Brings CareNest on the Home Screen back to the camera after the iPhone restarts it.
//
// The Home Screen icon always opens the family page (start_url in manifest.webmanifest),
// and iOS restarts a Home Screen app from that page whenever it closes it, for example to
// free memory while the camera and the AI are running. So a phone watching on its stand
// ended up on the family page. This phone now remembers that it was watching until
// someone presses Stop or leaves the camera page, and opens the camera page again instead.
// No React here, so it can be tested with `npm test`.

const KEY = "carenest.cameraWatching.v1";
const FAMILY_PAGE = "/dashboard";
const CAMERA_PAGE = "/tracker";

/** The page to open instead of `path` when the app starts, or null to stay. */
export function reopenCameraPath(path: string, homeScreenApp: boolean, wasWatching: boolean): string | null {
  const page = path.replace(/\/+$/, "") || "/";
  return homeScreenApp && wasWatching && page === FAMILY_PAGE ? CAMERA_PAGE : null;
}

/** Remember (or forget) that this phone is watching, so a restart can come back to it. */
export function rememberWatching(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "yes");
    else localStorage.removeItem(KEY);
  } catch {
    // private browsing can block saving: a restart then opens the family page, as before
  }
}

function wasWatching(): boolean {
  try {
    return localStorage.getItem(KEY) === "yes";
  } catch {
    return false;
  }
}

/** Opened from the Home Screen icon, not in a browser tab. */
function isHomeScreenApp(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true
  );
}

let reopened = false;

/**
 * Called once as the site starts, before the pages are drawn: if the iPhone restarted
 * CareNest while it was watching, go back to the camera page instead of the family page.
 */
export function reopenCameraIfNeeded(): void {
  const to = reopenCameraPath(window.location.pathname, isHomeScreenApp(), wasWatching());
  if (!to) return;
  window.history.replaceState(null, "", to);
  reopened = true;
}

/** True once, on the camera page, after reopenCameraIfNeeded brought the app back to it. */
export function takeReopened(): boolean {
  const was = reopened;
  reopened = false;
  return was;
}
