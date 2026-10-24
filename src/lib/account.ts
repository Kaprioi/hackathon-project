// Checks for the Your account page, kept here (not in the page) so `npm test` can try them.

export const MAX_NAME_LENGTH = 60;

/** Tidies a display name: no spaces at the ends, single spaces inside. */
export function cleanDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** A friendly problem with the display name, or "" if it is fine. */
export function displayNameProblem(name: string): string {
  const clean = cleanDisplayName(name);
  if (!clean) return "Please type a name, like Sam or Grandma Rose.";
  if (clean.length > MAX_NAME_LENGTH) return `Please keep your name under ${MAX_NAME_LENGTH} letters.`;
  return "";
}

/** Which password box has a problem, and what to say. Empty when all is fine. */
export function passwordProblems(current: string, next: string, again: string): {
  current?: string;
  next?: string;
  again?: string;
} {
  if (!current) return { current: "Please type your current password." };
  if (!next) return { next: "Please type a new password." };
  if (next.length < 6) return { next: "Please choose a password with at least 6 letters or numbers." };
  if (next === current) return { next: "Your new password must be different from your old one." };
  if (next !== again) return { again: "The two new passwords don't match. Please type it again." };
  return {};
}
