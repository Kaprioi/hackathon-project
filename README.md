# hackathon-project

**CareNest**: a phone standing on a table watches the room with its camera (all on the phone), and family see in plain words how their loved one is doing. No video or pictures ever leave the phone.

The site has eight pages:

| Page | Address | What it is |
| --- | --- | --- |
| About Us | `/` | What CareNest is and how it works |
| Sign in | `/login` | Sign in or create an account (email and password) |
| Phone camera | `/tracker` | Open this on the phone on the table and press **Start watching** |
| Family | `/dashboard` | What is happening right now, recent news, and adding family |
| This week | `/report` | A weekly report: moving around each day, when in the day they are up and about, night-time trips, possible falls, camera-off time, and how it compares with last week (signed-in only) |
| Care profile | `/profile` | A few questions about the person being cared for (age, routine, who they live with), then how likely a fall is and the times to keep an eye on |
| Help | `/help` | Picture steps for getting started, what the Family page means, privacy, and common questions |
| Your account | `/account` | Your email, the name family see, change your password, your family circles, and log out (signed-in only) |
| Set up your iPhone | `/get-started` | Step-by-step guide shown right after signing in: turns an iPhone into the phone camera on the table (with a QR code to open it on the iPhone). Signed-in only |

The "forgot password" email also brings people to `/reset-password` to choose a new password.

## Team setup (do this once, ~5 minutes)

You need a Mac with [Homebrew](https://brew.sh), a GitHub account, and access to this repo (ask the owner to invite you).

1. Install the tools:

   ```bash
   brew install gh herdr treehouse jq node
   ```

   ```bash
   brew install --cask claude-code
   ```

2. Log in to GitHub:

   ```bash
   gh auth login
   ```

3. Get firstmate (the agent that runs a crew of Claude agents for you):

   ```bash
   git clone https://github.com/kunchenguid/firstmate ~/github/firstmate
   ```

   ```bash
   mkdir -p ~/github/firstmate/config && echo herdr > ~/github/firstmate/config/backend
   ```

## Using it

1. Start herdr in your terminal: `herdr`
2. In herdr, go to firstmate and start Claude:

   ```bash
   cd ~/github/firstmate && claude
   ```

3. Tell it what to build, for example:

   > ahoy! Our project is https://github.com/Kaprioi/hackathon-project. Run these in parallel, one worker each: 1) ... 2) ... 3) ...
   > Use direct-PR mode. I'm not technical, so explain in plain English.

Each worker gets its own branch, opens a pull request when done, and the first mate tells you. Type `/bearings` inside Claude for a status report.

## Team rules

- **Split work by area.** Before starting, agree in chat who (and whose agents) owns which part: e.g. one person on the homepage, one on the backend, one on styling.
- **Never push straight to `main`.** All changes go through pull requests, so nobody's work gets overwritten.
- **Merge small and often.** Merge finished pull requests every 30 minutes or so, and pull the latest `main` before starting new tasks.

## Run the app

The app is a [Vite](https://vite.dev) + React + TypeScript site styled with Tailwind CSS. It is set up to deploy on Vercel, import into Lovable, and use Supabase for data.

1. Install the packages (once, and again whenever `package.json` changes). If you forget, `npm run dev` and `npm test` stop and tell you which packages are missing:

   ```bash
   npm install
   ```

2. Set up Supabase keys (the About Us page works without them; the login page at `/login` needs them):

   ```bash
   cp .env.example .env.local
   ```

   Then open `.env.local` and fill in the two values from your Supabase project (Supabase dashboard -> Project Settings -> API):

   | Variable | What it is |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your project URL, like `https://abcd1234.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | The public "anon" key |

   `.env.local` is ignored by git, so real keys never get committed. On Vercel, add the same two variables under Project Settings -> Environment Variables.

   Our Supabase project ("carenest") is already set up so its emails link back to the live site (https://carenest-eight-bay.vercel.app), Vercel preview sites, and `http://localhost:5173`. You can see this in the Supabase dashboard under Authentication -> URL Configuration. If you run the app on a different address, add it to the Redirect URLs there, or the "confirm your email" and "forgot password" links won't come back to it.

   Supabase's built-in email service only delivers to members of our Supabase team (and only a few emails an hour), so "forgot password" emails won't reach real families until we set up our own email sender in Supabase under Authentication -> Emails -> SMTP Settings. For now "Confirm email" is turned off (Authentication -> Sign In / Providers -> Email), so creating an account logs people straight in without needing an email. Once SMTP is set up, it can be turned back on.

3. Set up the database (once per Supabase project). The tables live in `supabase/migrations/`. Either:

   - open the Supabase dashboard -> SQL Editor -> New query, paste the whole of `supabase/migrations/20261024000000_carenest_schema.sql` and press **Run**, then do the same with `supabase/migrations/20261024010000_family_fixes.sql` (it makes adding family members safer: people are found by the email they signed up with, nobody can change the email on their profile, and the answer never reveals whether an email has an account), then the same with `supabase/migrations/20261024020000_checking_on_it.sql` (it lets family press "I'm checking on it" on a possible fall so everyone else sees who is handling it), then the same with `supabase/migrations/20261024030000_no_movement.sql` (it lets the phone camera save a "No movement for a while" event when nobody has moved for 3 hours during the day), then the same with `supabase/migrations/20261024040000_push_alerts.sql` (it saves which devices want phone alerts, see "Phone alerts" below), then the same with `supabase/migrations/20261024041200_family_notes.sql` (it switches on the "Family notes" board, where the family can leave each other short notes like "I'll visit Saturday", tick them "Done" and react with 👍 ❤️ ✅), then the same with `supabase/migrations/20261024050000_daily_reminders.sql` (daily reminders, see "Daily reminders" below), or
   - with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link --project-ref <your-ref>` (ours is `egraxwvpbqmjfybdbjsg`) then `supabase db push`.

   What it creates:

   | Table | What it holds |
   | --- | --- |
   | `profiles` | One row per account, made automatically when someone signs up |
   | `care_circles` | One "home" per account (made at sign-up too). The owner can add family with `add_family_member(circle id, their email)` |
   | `care_circle_members` | Who is in which circle (owner or family) |
   | `devices` | Each phone used as a camera |
   | `movement_events` | Small text events from the phone: what happened, left/middle/right, posture, time. Never video or pictures |
| `event_acknowledgements` | Who pressed "I'm checking on it" on which possible fall |
| `family_notes` | Short notes the family leave each other on the family page ("I'll visit Saturday"), and who ticked each one "Done". Everyone in the circle can read them; people can only delete their own |
| `note_reactions` | Quick 👍 ❤️ ✅ reactions on family notes, one of each per person |
| `push_subscriptions` | Each device that pressed "Get alerts on this device": where to send the notification, its language, time zone and which alerts it wants. People only see their own |
| `push_alerts_sent` | Which events have already been sent as phone alerts, so nobody gets the same one twice. Only the server can see it |
| `reminders` | Daily reminders family added, like "Heart pills" at 08:00 |
| `reminder_checks` | Which reminder was done on which day, and when "I did it" was pressed |

   Row Level Security is on for every table, so people only see their own circle's rows. `movement_events`, `event_acknowledgements`, `reminders` and `reminder_checks` are added to Supabase Realtime so the family page can update live.

4. Start the app on your computer:

   ```bash
   npm run dev
   ```

   Then open the address it prints (usually http://localhost:5173).

   **Switched off for now:** the team stopped using ElevenLabs, so `VOICE_ON` in `src/family/voice.ts` is `false`. That hides the "Read aloud" buttons and the spoken alerts switch, and reminders on the camera phone only chime. Set it to `true` to bring them back.

   The "Read aloud" buttons and spoken alerts speak with our ElevenLabs voices through the small server function in `api/tts.ts`. It needs these Vercel environment variables (already set for production, preview and development): `ELEVENLABS_API_KEY` (secret, stays on the server), and the voice IDs `ELEVENLABS_VOICE_EN`, `ELEVENLABS_VOICE_ES` and `ELEVENLABS_VOICE_ZH`. It also reads the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as the site, because only logged-in people can use it (at most 30 readings every 10 minutes each, spoken alerts included). Everything said out loud uses an ElevenLabs voice (the browser's own voices are never used); if that voice can't be reached, the page just says "Read aloud isn't available right now". `npm run dev` doesn't run that function, so locally you'll see that note. To hear the ElevenLabs voices on your computer, run `vercel dev` (after `vercel link`) instead of `npm run dev`.

   Phone alerts ("Get alerts on this device" on the family page) need a few more Vercel environment variables; see "Phone alerts" below. Without them the button just says alerts aren't set up yet.

5. Check that it builds for production (Vercel runs this too):

   ```bash
   npm run build
   ```

   `npm run preview` serves that production build locally.

6. Run the tests (no camera or Supabase needed):

   ```bash
   npm test
   ```

Where things live: pages are in `src/pages/` (routes are listed in `src/main.tsx`), shared pieces in `src/components/`, the Supabase connection in `src/lib/supabase.ts`, and colours and fonts in `src/index.css`. `vercel.json` makes links like `/login`, `/dashboard` and `/reset-password` work when the site is deployed.

Logging in: `/login` has log in, create an account, and "forgot your password". Until someone signs in, the **Sign In** link in the header glows with a yellow "Start here" bubble pointing at it. After logging in or creating an account, people go to the iPhone setup guide at `/get-started` (one step at a time, with a glowing **Next** button); once they finish or skip it, later log-ins on that browser go straight to `/dashboard`. A link like `/login?next=/tracker` brings people back to that page after logging in instead (the Phone camera page uses this, so an iPhone that signs in goes straight back to the camera). The "forgot password" email brings people back to `/reset-password` to choose a new password (and if "Confirm email" is turned back on, the confirmation email brings them to `/dashboard`). `/dashboard` is the family page (below) and sends people to `/login` if they aren't logged in.

## Phone Tracker page (`/tracker`)

The phone camera page. Stand a phone on a table, sign in, open `/tracker` and press **Start watching**. A green "Camera on - video stays on this phone" sign stays on screen while it watches. The phone finds people with its camera (all on the phone) and sends only short text notes to the `movement_events` table: what happened (moving, still, nobody, possible fall), which side of the room (left/middle/right), posture (standing/sitting/lying) and the time, plus a "still watching" heartbeat every 30 seconds. No video or pictures ever leave the phone. If nobody is signed in it asks you to sign in first; without Supabase keys you can still try the camera, but nothing is sent.

When it stops watching it tells the family page: when you press **Stop watching**, close the tab, or leave the page hidden (another tab, another app, or the screen turned off) for 15 seconds, because a hidden page can't watch. Only one tab watches at a time: starting the camera in a new tab stops it in the old one. If an iPhone restarts CareNest on the Home Screen while it is watching (iOS does this to free memory), it opens the camera page again instead of the family page, with a note to tap **Start watching**. On iPhones, face recognition starts off to save memory (also on phones that saved older settings); switch it on in Settings and the phone remembers that.

It also still drives the optional Phone Tracker stand: it follows the person you tap and aims the stand and its humidifier mist at them. The code is in `src/tracker/` (see `src/tracker/README.md`); the hardware, firmware and build guide are in `phone-tracker/`.

- On a PC: `npm run dev`, then open http://localhost:5173/tracker in **Chrome or Edge**. Safari and Firefox can't use Bluetooth.
- On an iPhone: open the deployed `https://…/tracker` link in the free **Bluefy** browser. It has to be https; Safari can't use Bluetooth from a website.
- Test the tracking and event logic without a camera: `npm run test:tracker`.
- The camera needs https on a phone: use the deployed Vercel link (or `npm run dev -- --host` plus an https tunnel).

**Emergency alert.** If the person being followed seems to fall (or have a seizure), the phone shows "Are you OK?" with a 15-second countdown, then phones the emergency contact through Twilio via the server function `api/emergency-call.ts`. The call reads "This is a CareNest alert. Grandma may have fallen…" twice. It never calls emergency services. **Who it calls** is typed on the camera phone: `/tracker` → Settings → Emergency alert → the emergency contact's name and phone number (saved on that phone, sent with each call). It needs these Vercel environment variables (see `.env.example`): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (secret), `TWILIO_FROM` (the Twilio number), and optionally `ALERT_PERSON_NAME` and `ALERT_CALL_TO` (a number to call when Settings has none). Without the Twilio ones the alert makes a pretend call. Only signed-in CareNest accounts can start a call: the page sends its login token, and the function checks it with Supabase using the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. At most one call every 30 seconds. On a Twilio free trial, the number called must be verified in Twilio, and calls start with a short trial message. `npm run dev` also answers `/api/emergency-call`, reading the same settings from `.env.local`. Settings -> Emergency alert -> **Test the call** rings the contact.

**Gemini's look at the picture** (for the "Best Use of Gemini API" prize). When an alert's countdown runs out (nobody pressed I'm OK), the phone sends one still picture to the server function `api/scene-check.ts`, which asks Google Gemini (`gemini-3.5-flash-lite`, 500 free requests a day, structured JSON output, `store: false`) what it sees. Its one-sentence answer ("A person is lying on the kitchen floor next to a chair.") shows on the phone's alert screen and is read out in the call ("What the camera sees: ..."). It never cancels an alert or a call, and the call waits for it at most 6 seconds. Nothing is sent otherwise; Settings -> **Gemini's look at the picture** turns it off. It needs `GEMINI_API_KEY` (Google AI Studio -> Get API key) in Vercel and in `.env.local`; without it the call goes ahead without a description. Signed-in accounts only, at most one check every 10 seconds and 50 a day. On Gemini's free tier Google may keep and review what it's sent, so real use needs the paid tier.

## Family page (`/dashboard`)

Where family members see how things are. After logging in, the login page brings you here; if nobody is logged in it sends you to `/login`. It shows:

- **Right now**, in big words: for example "Moving around - left side - 2 minutes ago". The box turns red with a "please call or visit" note if the phone thinks someone may have fallen, Once the camera stops (Stop watching, a closed tab, or nothing heard from it for 2 minutes, for example a flat battery or no internet; it normally sends a heartbeat every 30 seconds) it says "The phone stopped watching at 3:42 pm." and the **Live** badge changes to **Camera off**.
- **Recent news**: the last 10 events with their times.
- **Add a family member** (only for the circle's owner): type the email of someone who already has a CareNest account, and they will see the same page. For privacy the page gives the same answer whether or not that email has an account. A family member's page shows the circle with the newest news, so they see the phone of the person they were added for.

It updates by itself through Supabase Realtime, so there is no need to reload. To try the whole flow: sign in on a phone, open `/tracker` and press **Start watching**; sign in with the same account on a computer and open `/dashboard`. The plain-words logic is in `src/family/status.ts` and is tested by `npm test`.

## This week report (`/report`)

Linked from the family page ("This week's report") and the footer; like the family page it sends people to `/login` if they aren't logged in. It reads the last 14 days of `movement_events` for your care circle (no database change needed) and shows:

- **How the week went**, in plain words compared with the week before, e.g. "A bit less active than last week." and "2 more night-time trips than last week (4 in all).", with a **Read the week aloud** button.
- **Numbers**: rough time spent moving around, night-time trips (movement between the bed and wake-up times from the Care profile, or 10 pm to 7 am), possible falls, and how long the camera was off.
- **Two charts**: a bar for each day, and a strip of 24 hour squares per day that is darker when they were moving around more. Screen readers get the same numbers as tables.
- **Show example week**: a pretend week, so the report can be shown before a phone has been watching.

The sums are in `src/family/weeklyReport.ts` and are tested by `npm test`.

## Phone alerts

Until the notification keys below are added in Vercel, the family page hides this card completely.

Family can press **Get alerts on this device** on the family page. After they allow notifications, that phone or computer gets a notification like "Possible fall at Mum's, 3:42 pm" whenever the phone camera sees a possible fall, even when the family page is closed. Tapping it opens the family page. They can also tick "Also tell me when the phone camera stops watching" and "Also tell me when nobody has moved for a while during the day" (the phone camera's "No movement for a while" news), and press **Send a test alert** to check it works.

- Each notification is written for the person getting it: in the language they use CareNest in, in their own time zone, and with the name from their Care profile ("Mum"). Possible falls are always sent; quiet hours don't apply.
- The camera phone itself never gets the alert it sent. The same event is never sent twice, and old events (over 10 minutes) are never sent.
- **iPhone and iPad:** notifications only work after adding CareNest to the Home Screen (Share -> Add to Home Screen) and opening it from that icon, on iOS 16.4 or newer. The family page explains this on iPhones.
- It uses Web Push, built into browsers, so there's no extra account to sign up for. Text messages and email are not done yet.

How it works: `public/sw.js` (a small "service worker" the browser keeps running) shows the notifications. The family page saves each device in the `push_subscriptions` table (`src/family/usePushAlerts.ts`). When the camera page saves a possible fall, it calls `api/notify.ts`, which checks with Supabase that the event is real and in your circle, then sends the notifications with the `web-push` package.

Setting it up (once):

1. Run `supabase/migrations/20261024040000_push_alerts.sql` in the Supabase SQL editor (step 3 of "Run the app"). Until then the button says a database update is needed.
2. Make a pair of notification keys ("VAPID keys") on your computer:

   ```bash
   npx web-push generate-vapid-keys
   ```

   It prints a **Public Key** and a **Private Key**. Keep the private key secret: never commit it or paste it in chat.
3. In Vercel -> Project Settings -> Environment Variables, add these (for Production and Preview), then redeploy:

   | Variable | What to put |
   | --- | --- |
   | `VAPID_PUBLIC_KEY` | The Public Key from step 2 |
   | `VITE_VAPID_PUBLIC_KEY` | The same Public Key again (the family page needs it in the browser) |
   | `VAPID_PRIVATE_KEY` | The Private Key from step 2 (secret) |
   | `VAPID_SUBJECT` | A contact email for the push services, written like `mailto:you@example.com` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard -> Project Settings -> API -> `service_role` key (secret: it can read every table, so it only goes in Vercel, never in `.env.local` or the code) |

   `VITE_SUPABASE_URL` is already set for the site and is used too.
4. To try it on your computer, put `VITE_VAPID_PUBLIC_KEY` in `.env.local` and use `vercel dev` (the alerts are sent by the server function, which `npm run dev` doesn't run).

## Care profile page (`/profile`)

A few simple questions, one at a time, about the person being cared for: their age, who they live with, when they wake up and go to bed, when they're on their own, how often they get up at night, past falls, walking aids and medicines. At the end it shows:

- **Chance of a fall**: Lower, Medium or Higher, with the reasons in plain words.
- **Times to keep an eye on**: for example overnight, the first hour after waking up, or afternoons when they're alone.
- **Your answers**, each with a "Change" button, and "Start again".

You have to be signed in to see it; if nobody is signed in it sends you to `/login`. It's a rough guide, not medical advice. For now the answers are only saved in that browser (one set per account), not in Supabase. The questions and scoring are in `src/family/careProfile.ts` and are tested by `npm test`.

## Daily reminders

On the Family page, the **Daily reminders** card starts empty. Family add reminders only if their loved one needs them: choose Medicine, Meal, Drink water or Something else, write the words to show (like "Heart pills with water"), and pick a time. Anyone in the care circle can add or remove them.

At that time, while the phone on the table is watching (`/tracker`), it shows the reminder in big words over the camera view, plays a chime and says it out loud in the chosen language. It has two buttons:

- **I did it**: the Family page shows "Done at 8:02".
- **Later**: hides it for 10 minutes, then it comes back.

A reminder stays on the phone for an hour. If nobody presses "I did it" in that time, the Family page shows **Missed** in red. Until then it says "Showing on the phone now", and before its time it says "Coming up".

It needs the `20261024050000_daily_reminders.sql` database update (step 3 of "Run the app"). Without it, the card says reminders aren't switched on yet. The logic is in `src/family/reminders.ts` and is tested by `npm test`.
