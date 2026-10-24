# hackathon-project

**CareNest**: a phone standing on a table watches the room with its camera (all on the phone), and family see in plain words how their loved one is doing. No video or pictures ever leave the phone.

The site has four pages:

| Page | Address | What it is |
| --- | --- | --- |
| About Us | `/` | What CareNest is and how it works |
| Sign in | `/login` | Sign in or create an account (email and password) |
| Phone camera | `/tracker` | Open this on the phone on the table and press **Start watching** |
| Family | `/dashboard` | What is happening right now, recent news, and adding family |

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

   - open the Supabase dashboard -> SQL Editor -> New query, paste the whole of `supabase/migrations/20261024000000_carenest_schema.sql` and press **Run**, then do the same with `supabase/migrations/20261024010000_family_fixes.sql` (it makes adding family members safer: people are found by the email they signed up with, nobody can change the email on their profile, and the answer never reveals whether an email has an account), or
   - with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link --project-ref <your-ref>` (ours is `egraxwvpbqmjfybdbjsg`) then `supabase db push`.

   What it creates:

   | Table | What it holds |
   | --- | --- |
   | `profiles` | One row per account, made automatically when someone signs up |
   | `care_circles` | One "home" per account (made at sign-up too). The owner can add family with `add_family_member(circle id, their email)` |
   | `care_circle_members` | Who is in which circle (owner or family) |
   | `devices` | Each phone used as a camera |
   | `movement_events` | Small text events from the phone: what happened, left/middle/right, posture, time. Never video or pictures |

   Row Level Security is on for every table, so people only see their own circle's rows. `movement_events` is added to Supabase Realtime so the family page can update live.

4. Start the app on your computer:

   ```bash
   npm run dev
   ```

   Then open the address it prints (usually http://localhost:5173).

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

Logging in: `/login` has log in, create an account, and "forgot your password". Creating an account logs people straight in and takes them to `/dashboard`. The "forgot password" email brings people back to `/reset-password` to choose a new password (and if "Confirm email" is turned back on, the confirmation email brings them to `/dashboard`). `/dashboard` is the family page (below) and sends people to `/login` if they aren't logged in.

## Phone Tracker page (`/tracker`)

The phone camera page. Stand a phone on a table, sign in, open `/tracker` and press **Start watching**. A green "Camera on - video stays on this phone" sign stays on screen while it watches. The phone finds people with its camera (all on the phone) and sends only short text notes to the `movement_events` table: what happened (moving, still, nobody, possible fall), which side of the room (left/middle/right), posture (standing/sitting/lying) and the time, plus a "still watching" heartbeat every minute. No video or pictures ever leave the phone. If nobody is signed in it asks you to sign in first; without Supabase keys you can still try the camera, but nothing is sent.

It also still drives the optional Phone Tracker stand: it follows the person you tap and aims the stand and its humidifier mist at them. The code is in `src/tracker/` (see `src/tracker/README.md`); the hardware, firmware and build guide are in `phone-tracker/`.

- On a PC: `npm run dev`, then open http://localhost:5173/tracker in **Chrome or Edge**. Safari and Firefox can't use Bluetooth.
- On an iPhone: open the deployed `https://…/tracker` link in the free **Bluefy** browser. It has to be https; Safari can't use Bluetooth from a website.
- Test the tracking and event logic without a camera: `npm run test:tracker`.
- The camera needs https on a phone: use the deployed Vercel link (or `npm run dev -- --host` plus an https tunnel).

## Family page (`/dashboard`)

Where family members see how things are. After logging in, the login page brings you here; if nobody is logged in it sends you to `/login`. It shows:

- **Right now**, in big words: for example "Moving around - left side - 2 minutes ago". The box turns peach with a "please call or visit" note if the phone thinks someone may have fallen, and warns you if the phone has not checked in for over 3 minutes (it normally sends a heartbeat every minute).
- **Recent news**: the last 10 events with their times.
- **Add a family member** (only for the circle's owner): type the email of someone who already has a CareNest account, and they will see the same page. For privacy the page gives the same answer whether or not that email has an account. A family member's page shows the circle with the newest news, so they see the phone of the person they were added for.

It updates by itself through Supabase Realtime, so there is no need to reload. To try the whole flow: sign in on a phone, open `/tracker` and press **Start watching**; sign in with the same account on a computer and open `/dashboard`. The plain-words logic is in `src/family/status.ts` and is tested by `npm test`.
