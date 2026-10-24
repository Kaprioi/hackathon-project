// The setup guide at /get-started: where people go after signing in, and whether
// they have already finished it (remembered in this browser, one per account).
// No React here, so it can be tested with `npm test`.

/** The step-by-step "set up your iPhone" guide. */
export const GUIDE = "/get-started";
/** The family page: where people go once the guide is done. */
export const FAMILY = "/dashboard";

const key = (userId: string) => `carenest-guide-done-${userId}`;

export function guideDone(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === "yes";
  } catch {
    return false;
  }
}

export function markGuideDone(userId: string) {
  try {
    localStorage.setItem(key(userId), "yes");
  } catch {
    // Private browsing can block saving. They'll just see the guide again next time.
  }
}

/**
 * A page on this site to come back to after signing in, from /login?next=/tracker.
 * Anything else (another website, "//evil.com", nothing) gives null. Browsers
 * quietly drop tabs and newlines and treat "\\" like "/", so "/\t/evil.com" would
 * also lead to another website: only plain characters are allowed.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !/^\/(?![/\\])[^\\\s\u0000-\u001f\u007f]*$/.test(next)) return null;
  return next;
}

/** Where to go after signing in: the page asked for, else the guide until it's done, else the family page. */
export function afterSignIn(next: string | null | undefined, finishedGuide: boolean): string {
  return safeNext(next) ?? (finishedGuide ? FAMILY : GUIDE);
}
