# Handoff: CareNest phone tracker (written the night of Oct 24, 2026)

For the next Claude Code session, and for Apple. Read this first, then `phone-tracker/CLAUDE.md`
(project rules, decisions, architecture) and the newest entries in `phone-tracker/docs/SESSION_LOG.md`.
SBUHacks ends **Sunday Oct 25, 4 PM Eastern** (MLH lists 2026-10-25 20:00 UTC). Submissions are on Devpost.

## Start here

1. **Open Claude Code in `C:\Users\marba\Projects\hackathon-merge\phone-tracker`** (so `CLAUDE.md` loads).
   `hackathon-merge` is a git worktree on branch **`live-video`**, which holds all the newest work.
   (`C:\Users\marba\Projects\hackathon-project` is an older worktree on `tracker-website`; don't work there.)
2. **Both of our branches now conflict with `main`.** The team merged 15 more PRs on Oct 24 evening
   (weekly report with activity charts, family notes, daily reminders, Web Push fall notifications,
   "no movement for a while", Lighthouse fixes). Dry runs:
   - `live-video` vs `main`: conflicts in `.env.example`, `README.md`, `package.json`, `package-lock.json`,
     `src/i18n/es.ts`, `src/i18n/zh.ts`, `src/pages/DashboardPage.tsx`, `src/tracker/TrackerPage.tsx`.
   - `tracker-phone-friendly` (PR #13) vs `main`: `.env.example`, `package.json`, `package-lock.json`, `TrackerPage.tsx`.
   First job: merge `origin/main` into both (keep both sides, as on Oct 24: see "How the last merge was done"),
   re-run tests, push. Ask Apple before committing (house rule), then push.
3. **The family page is being changed by Kris's agents too** (family notes and reminders landed on it).
   Our dashboard layout (below) rearranges that page, so when merging, place their new cards in the layout
   (probably the right-hand column under Spoken alerts) instead of dropping either side. Tell Kris.
4. **Running on this PC (the "test link"):**
   - Vite dev server for `hackathon-merge`: `npx vite --host 127.0.0.1 --port 5176 --strictPort` (pid 31772).
     Other Vite servers on port 5175 belong to the old `hackathon-project` worktree; ignore them.
   - Cloudflare quick tunnel (pid 46860):
     `C:\Users\marba\AppData\Local\Temp\claude\C--Users-marba-Projects\c135ed46-898b-4f54-9522-bd0608ae0031\scratchpad\cloudflared\cloudflared.exe tunnel --url http://127.0.0.1:5176 --http-host-header 127.0.0.1:5176 --no-autoupdate`
   - Phone link: **https://tennessee-endorsement-approaches-isle.trycloudflare.com/tracker** (family page: `/dashboard`).
     Quick tunnels die when the PC sleeps or the process stops; restarting gives a new URL.
     cloudflared and arduino-cli are allowed in simplewall (new programs are blocked until allowed).
5. **`.env.local` in `hackathon-merge`** (gitignored, never commit, never print the token) holds:
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (Apple typed it in), `TWILIO_FROM` (+1 737 258 3742),
   `ALERT_CALL_TO` (Apple's friend, verified in Twilio), `ALERT_PERSON_NAME=Grandma`, and the site's public
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (project `egraxwvpbqmjfybdbjsg`, role anon, copied from the
   live site). Because Supabase is set, the test link asks for sign-in like the real site. Saving this file
   restarts the dev server for a moment.

## Uncommitted right now (branch `live-video`)

- **Seizure false-alarm fix** (`src/tracker/emergency.ts`, `config.ts`, 5 new tests in `emergency.test.mjs`). See below.
- **This handoff** and a `SESSION_LOG.md` entry.
Apple was asked whether to commit them; check `git status` and ask if they're still uncommitted.

## Pull requests and branches

| What | Branch | State |
|---|---|---|
| PR #13 | `tracker-phone-friendly` → `main` | Phone-friendly tracker, faces, fall/seizure alert, Twilio call, sign-in lock, merged with main + PR #23 as of Oct 24 afternoon. **Now conflicts with main** (4 files). |
| PR #23 (Kris's agents) | `fm/tracker-m13` → `main` | Older copy of our tracker + their iPhone fixes. Fully contained in PR #13; merging #13 makes #23 redundant. |
| (no PR yet) | `live-video` | PR #13 + live video + dashboard layout (+ the seizure fix once committed). Open it: https://github.com/Kaprioi/hackathon-project/pull/new/live-video. Say "Includes PR #13, merge that first" and "needs `supabase/migrations/20261025000000_live_video.sql` run". **Now conflicts with main** (8 files). |
| PR #7 | `sightline-bluetooth-mist` → `hardware-build-guide` | Bluetooth link for Kris's SightLine firmware (worktree `C:\Users\marba\Projects\hackathon-sightline`). Kris to review. `UPLOAD_AND_TEST.md` there. |

`gh` isn't installed. PR state was read with the public GitHub API (`curl https://api.github.com/repos/Kaprioi/hackathon-project/pulls`).
Never push to `main`. Git author is Dennis Liang / dennisliang07@gmail.com.

## What was built on Oct 24 (all tested; details in SESSION_LOG.md)

1. **Real emergency call through Twilio** (`api/emergency-call.ts`, `src/tracker/call.ts`). After a fall or possible
   seizure and a 15 s "Are you OK?" countdown, the server asks Twilio to ring `ALERT_CALL_TO`; Twilio fetches the
   words from `/api/emergency-call?say=fall` (trial accounts refuse words inside the request). Every answer to the
   page is HTTP 200 with `result` inside (Cloudflare hides 502s). One call per 30 s, 30 a day. **Apple confirmed a
   real call rang the friend's phone.** Only signed-in accounts can call where the server has Supabase settings.
   Trial: calls start with Twilio's trial message and a key press; only verified numbers can be called.
2. **Merged main + PR #23 into PR #13** (kept both sides; 182 tests then).
3. **Live video** (`src/lib/live.ts`, `src/components/LiveView.tsx`, `api/ice-servers.ts`,
   `supabase/migrations/20261025000000_live_video.sql`). Family page "Watch live": phone camera + room sound,
   "Talk" sends the family member's voice to the phone. WebRTC straight between devices, encrypted, nothing stored.
   Connection messages go over a private Supabase Realtime channel `live:<circle id>`; the migration lets only
   circle members join. Twilio relay (TURN) logins for strict networks, signed-in only (works on the trial).
   Phone: Settings → "Live video for family" (default on); the top bar turns red "LIVE: Sam is watching".
   Checked in Chrome with a real WebRTC call (direct and forced through the relay; sound both ways). **Not yet
   tried on two real devices**: needs the migration run in Supabase (Apple has dashboard access).
   The "video never leaves the phone" promise was reworded across the site in English, Spanish and Chinese.
4. **Family page as a laptop dashboard** (`src/family/dayPicture.ts`, `src/components/DayPanels.tsx`,
   `DashboardPage.tsx`): video panel left, Right now + Call right, four tiles (moving today, last moved, where most
   time, alerts today), a coloured strip of today in "Today so far", Recent news beside the settings. Phones keep
   one column (Call right under Right now). Header says "Your Account" when signed in.
   Note: main now has a weekly report page with its own activity charts; check for overlap when merging.
5. **Seizure false alarms fixed** (Apple's report tonight: close up to the screen, looking down, or moving out of
   the picture kept starting the seizure alert). Causes, reproduced in a script before fixing:
   - A box cut off by the picture's edges (close up, looking down at the phone, leaving) is short and wide, so it
     read as "lying"; its size jumps as you move, which read as shaking.
   - The shake count included the moment of going from upright to "lying" (and back), so leaning forward and back
     at a desk counted as swings.
   - Hidden in the same bug: the counter only started once the size moved a full swing from the *first* frame,
     so the real-seizure test only passed because the fall itself started it.
   Fix: lying and shaking are only judged on whole boxes (not cut off at the top or bottom, not bigger than 30% of
   the picture); cut-off frames count as "not seen properly" (timers keep going, nothing new starts). Shaking is only
   counted while lying the whole time and in full view (not touching a side), the box must stay in one place
   (its middle moving less than half the person's size in the 3 s window), and the counter starts once the size has
   spanned a full swing from anywhere. New settings in `EMERGENCY` (`config.ts`): `shakeMaxDrift 0.5`,
   `edgeMargin 0.02`, `maxLyingArea 0.3`. 216 tests pass. **Not yet retested on the phone.**
   Trade-off for the demo: **stage the fall a few steps from the camera**, so the whole body stays in the picture
   (a body touching the top or bottom edge isn't judged).

6. **Gemini's look at the picture** (late Oct 24, for the "Best Use of Gemini API" prize): when an alert's
   countdown runs out, one still picture goes to Gemini through `api/scene-check.ts`; its one-sentence description
   shows on the alert screen and is read out in the call. Never cancels anything; the call waits at most 6 s.
   Needs `GEMINI_API_KEY` (Google AI Studio) in `.env.local` and Vercel. Free tier: Google may keep and review the
   pictures, so the demo uses teammates and real use needs the paid tier. Tested with a stand-in Gemini and in
   Chrome without a key; **not yet tried with a real key.** Google's Gemini agent skills are installed locally in
   `.agents/skills` (kept out of git through `.git/info/exclude`).

## Apple's and Kris's to-do before the demo

1. **Supabase:** run `supabase/migrations/20261025000000_live_video.sql` (dashboard → carenest → SQL Editor →
   New query → paste → Run). Without it Watch live says "Live video isn't switched on in the database yet".
2. **Retest on the S22** (test link): the seizure fix (go close, look down, walk out: no alert; lie down and
   shake on purpose: alert), Watch live on the laptop (headphones or "Mute sound" in the same room), the dashboard
   filling up with real data (sign in with the same account on both, press Start watching).
3. **Open the `live-video` PR**; after the main merge, **Kris merges #13 then `live-video`**.
4. **Vercel** (Kris has access): add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `ALERT_CALL_TO`,
   `ALERT_PERSON_NAME` and `GEMINI_API_KEY` (values sent privately, never in GitHub or group chat), redeploy. The Supabase vars are
   already there. Then the real site is https://carenest-eight-bay.vercel.app (tracker at `/tracker`).
5. **Hardware: the stand has never moved with the phone.** Firmware compiles (arduino-cli, see memory/
   `phone-tracker/CLAUDE.md`), never run on the board. Kris uploads it; S22 → Connect stand → Settings test moves.
   Biggest demo risk. Backup: phone on a plain tripod (tracking, alerts, call and live video all still work).

## Demo day (what the judges see)

- S22 on the stand running `/tracker` (signed in, Start watching, Connect stand); laptop on `/dashboard` (same
  family); the friend's phone on speaker for the call.
- Script: problem (Grandma alone, cameras feel like spying) → Start watching → tap Grandma, stand follows, turn
  around / passer-by / blanket → family dashboard updates → Watch live + Talk → she lies down (a few steps away):
  "Are you OK?" → "I'm OK" cancels; then let it run: friend's phone rings, dashboard turns red with
  "Watch live now" and "I'm checking on it" → close (privacy, cost, next: call family in order, monitoring centre).
- Bring a hotspot (family page, call and live video need internet; the AI runs on the phone).

## Next ideas (not started)

- **Fall clips** (Apple chose "live first, clips after"): the phone keeps the last ~15 s (MediaRecorder in short
  restarting segments, since WebM chunks can't be cut mid-stream), saves before+after a fall, uploads to a private
  Supabase Storage bucket (`clips/<circle id>/...`, a policy migration like the live-video one); family page shows
  "Watch the clip" on the fall. Medal.tv (event sponsor) was considered and ruled out: its clipping runs in the
  Windows desktop app recording that PC's screen, can't record a phone browser, and SBUHacks has no Medal prize.
- **ElevenLabs voice for the emergency call** (Twilio `<Play>` an mp3 instead of `<Say>`): SBUHacks has a
  "Best Use of ElevenLabs" prize and the site already uses ElevenLabs (`api/tts.ts`).
- Live video: rotate the viewer's picture when the phone is sideways with auto-rotate off (the phone knows the turn).
- "Steel and Steam" theme: the "steam" answer is still open since the humidifier was dropped.

## How the last merge was done (for the next one)

- `git merge --no-ff --no-commit origin/main`, then resolve by keeping both sides:
  - `package.json`: union of the test lists (ours: `brain events orientation handheld faces emergency call callServer`
    + `src/lib/live.test.mjs`, `src/family/dayPicture.test.mjs`; theirs: everything they list) and of dependencies.
  - `package-lock.json`: both sides only add packages; keep both blocks, then `npm install` and check the lock is unchanged.
  - `TrackerPage.tsx`: keep main's features (camera stops after 15 s hidden / tab closed / another tab, account
    switching, translated start screen) and ours (faces, alert, call, live video, hand-held, flips); our wake-up
    listener must not restart the camera after main's 15 s stop (`watchingRef` check).
  - `es.ts` / `zh.ts`: keep both sides' lines; the parity test needs the same English keys in both.
- Then `npx tsc -b` (delete `tsconfig.tsbuildinfo` after), `npm test`, `npm run build`, a Chrome check with a fake
  camera (inject a canvas `captureStream` as `getUserMedia`), push.

## Working notes

- Tests: `npm test` (216, everything) or `npm run test:tracker`. Node runs the `.ts` files directly, so no
  TypeScript-only syntax like constructor parameter properties in tested files.
- In Git Bash, long inline `node -e`/heredoc scripts with mixed quotes can break; write them to a file in the
  scratchpad and run that. Files are mixed CRLF/LF; edit scripts keep each file's line endings.
- Claude may not type passwords: for signed-in checks in Chrome, ask Apple to sign in in Claude's tab.
- Apple's working style is in `phone-tracker/CLAUDE.md` (plain words, numbered steps, recommend one option,
  multiple-choice questions, ask before installing/buying/committing).
