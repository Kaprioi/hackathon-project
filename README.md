# hackathon-project

**CareNest**: a phone standing on a table watches the room with its camera (all on the phone), and family see in plain words how their loved one is doing. Family can also press **Watch live** to see and hear the room and talk through the phone; the video goes straight to them and is never recorded.

The site has eight pages:

| Page | Address | What it is |
| --- | --- | --- |
| About Us | `/` | What CareNest is and how it works |
| Sign in | `/login` | Sign in or create an account (email and password) |
| Phone camera | `/tracker` | Open this on the phone on the table and press **Start watching** |
| Family | `/dashboard` | What is happening right now, recent news, and adding family |
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

1. Install the packages (once, and again whenever `package.json` changes):

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

   - open the Supabase dashboard -> SQL Editor -> New query, paste the whole of `supabase/migrations/20261024000000_carenest_schema.sql` and press **Run**, then do the same with `supabase/migrations/20261024010000_family_fixes.sql` (it makes adding family members safer: people are found by the email they signed up with, nobody can change the email on their profile, and the answer never reveals whether an email has an account), then the same with `supabase/migrations/20261024020000_checking_on_it.sql` (it lets family press "I'm checking on it" on a possible fall so everyone else sees who is handling it), then the same with `supabase/migrations/20261025000000_live_video.sql` (it lets only members of a family use that family's live video channel; see **Live video** below), or
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

   Row Level Security is on for every table, so people only see their own circle's rows. `movement_events` and `event_acknowledgements` are added to Supabase Realtime so the family page can update live. Live video's private Realtime channels (`live:<circle id>`) only let members of that circle in.

4. Start the app on your computer:

   ```bash
   npm run dev
   ```

   Then open the address it prints (usually http://localhost:5173).

   The "Read aloud" buttons and spoken alerts speak with our ElevenLabs voices through the small server function in `api/tts.ts`. It needs these Vercel environment variables (already set for production, preview and development): `ELEVENLABS_API_KEY` (secret, stays on the server), and the voice IDs `ELEVENLABS_VOICE_EN`, `ELEVENLABS_VOICE_ES` and `ELEVENLABS_VOICE_ZH`. It also reads the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as the site, because only logged-in people can use it (at most 30 readings every 10 minutes each, spoken alerts included). Everything said out loud uses an ElevenLabs voice (the browser's own voices are never used); if that voice can't be reached, the page just says "Read aloud isn't available right now". `npm run dev` doesn't run that function, so locally you'll see that note. To hear the ElevenLabs voices on your computer, run `vercel dev` (after `vercel link`) instead of `npm run dev`.

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

The phone camera page. Stand a phone on a table, sign in, open `/tracker` and press **Start watching**. A green "Camera on" bar stays on screen while it watches, and turns red ("LIVE: Sam is watching") while family watch live. The phone finds people with its camera (all on the phone) and sends only short text notes to the `movement_events` table: what happened (moving, still, nobody, possible fall), which side of the room (left/middle/right), posture (standing/sitting/lying) and the time, plus a "still watching" heartbeat every 30 seconds. No video or pictures are stored anywhere; video only leaves the phone live, when family press **Watch live** (below). If nobody is signed in it asks you to sign in first; without Supabase keys you can still try the camera, but nothing is sent.

When it stops watching it tells the family page: when you press **Stop watching**, close the tab, or leave the page hidden (another tab, another app, or the screen turned off) for 15 seconds, because a hidden page can't watch. Only one tab watches at a time: starting the camera in a new tab stops it in the old one.

It also still drives the optional Phone Tracker stand: it follows the person you tap and aims the stand and its humidifier mist at them. The code is in `src/tracker/` (see `src/tracker/README.md`); the hardware, firmware and build guide are in `phone-tracker/`.

- On a PC: `npm run dev`, then open http://localhost:5173/tracker in **Chrome or Edge**. Safari and Firefox can't use Bluetooth.
- On an iPhone: open the deployed `https://…/tracker` link in the free **Bluefy** browser. It has to be https; Safari can't use Bluetooth from a website.
- Test the tracking and event logic without a camera: `npm run test:tracker`.
- The camera needs https on a phone: use the deployed Vercel link (or `npm run dev -- --host` plus an https tunnel).

**Emergency alert.** If the person being followed seems to fall (or have a seizure), the phone shows "Are you OK?" with a 15-second countdown, then phones the emergency contact through Twilio via the server function `api/emergency-call.ts`. The call reads "This is a CareNest alert. Grandma may have fallen…" twice. It never calls emergency services. It needs these Vercel environment variables (see `.env.example`): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (secret), `TWILIO_FROM` (the Twilio number), `ALERT_CALL_TO` (who to call), `ALERT_PERSON_NAME`. Without them the alert makes a pretend call. Only signed-in CareNest accounts can start a call: the page sends its login token, and the function checks it with Supabase using the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. At most one call every 30 seconds. On a Twilio free trial, the number called must be verified in Twilio, and calls start with a short trial message. `npm run dev` also answers `/api/emergency-call`, reading the same settings from `.env.local`. Settings -> Emergency alert -> **Test the call** rings the contact.

**Live video.** On the family page, **Watch live** shows the phone camera live with sound, and **Talk** lets family speak through the phone ("Grandma, are you OK? Help is coming."). The fall alert has a **Watch live now** button too. The video and sound go straight between the phone and the family member's browser (WebRTC, encrypted) and are never recorded or stored. While anyone watches, the phone's top bar turns red and says who ("LIVE: Sam is watching"), so the person on camera always knows. The phone can switch it off (Settings -> Live video for family). At most 3 family members watch at once. The code is `src/lib/live.ts` (the phone's side and the family page's side), `src/components/LiveView.tsx` (the card) and `api/ice-servers.ts`.

- **It needs the database rule** `supabase/migrations/20261025000000_live_video.sql` (run it once, like the others in step 3). The phone and the family page first swap a few short "let's connect" messages through a private Supabase Realtime channel, `live:<care circle id>`, and that rule only lets members of that family in. Until it's run, Watch live says "Live video isn't switched on in the database yet".
- **Relay for strict networks.** When the two devices can't reach each other directly (some venue Wi-Fi and mobile data block it), the video goes through Twilio's relay servers, still encrypted. `api/ice-servers.ts` gets a short-lived relay login with the same `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` as the emergency call, for signed-in accounts only. Without them it uses a free public server, which works on most home networks. Relayed video uses Twilio credit (charged by the amount of video); direct connections cost nothing.
- The phone asks for the microphone at **Start watching** (for the room's sound). If it's refused, family can still watch but not hear or talk.

## Family page (`/dashboard`)

Where family members see how things are. After logging in, the login page brings you here; if nobody is logged in it sends you to `/login`. It shows:

- **Right now**, in big words: for example "Moving around - left side - 2 minutes ago". The box turns red with a "please call or visit" note if the phone thinks someone may have fallen, Once the camera stops (Stop watching, a closed tab, or nothing heard from it for 2 minutes, for example a flat battery or no internet; it normally sends a heartbeat every 30 seconds) it says "The phone stopped watching at 3:42 pm." and the **Live** badge changes to **Camera off**.
- **Recent news**: the last 10 events with their times.
- **Add a family member** (only for the circle's owner): type the email of someone who already has a CareNest account, and they will see the same page. For privacy the page gives the same answer whether or not that email has an account. A family member's page shows the circle with the newest news, so they see the phone of the person they were added for.

It updates by itself through Supabase Realtime, so there is no need to reload. To try the whole flow: sign in on a phone, open `/tracker` and press **Start watching**; sign in with the same account on a computer and open `/dashboard`. The plain-words logic is in `src/family/status.ts` and is tested by `npm test`.

## Care profile page (`/profile`)

A few simple questions, one at a time, about the person being cared for: their age, who they live with, when they wake up and go to bed, when they're on their own, how often they get up at night, past falls, walking aids and medicines. At the end it shows:

- **Chance of a fall**: Lower, Medium or Higher, with the reasons in plain words.
- **Times to keep an eye on**: for example overnight, the first hour after waking up, or afternoons when they're alone.
- **Your answers**, each with a "Change" button, and "Start again".

You have to be signed in to see it; if nobody is signed in it sends you to `/login`. It's a rough guide, not medical advice. For now the answers are only saved in that browser (one set per account), not in Supabase. The questions and scoring are in `src/family/careProfile.ts` and are tested by `npm test`.
