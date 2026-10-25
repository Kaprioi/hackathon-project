// The name of a care circle ("home"), shown at the top of the family page, like
// "Grandma's home". The owner can change it in the family page's Settings.
// No React here, so it can be tested with `npm test`.

import { english, type Translate } from "../i18n/translate.ts";

export const MAX_HOME_NAME = 40;
/** What every new circle is called (see supabase/migrations/20261024000000_carenest_schema.sql). */
export const DEFAULT_HOME_NAME = "My care circle";

/** Tidies a typed name: single spaces, no hidden control characters, not too long. "" if empty. */
export function cleanHomeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_HOME_NAME);
}

/** The name to show: the default one in the reader's language, anything typed as it is. */
export function shownHomeName(name: string, t: Translate = english): string {
  return name === DEFAULT_HOME_NAME ? t(DEFAULT_HOME_NAME) : name;
}
