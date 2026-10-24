# hackathon-project

Our hackathon web app. (Replace this line with a one-sentence pitch once we decide.)

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

2. Set up Supabase keys (the homepage works without them; the login page needs them):

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

3. Start the app on your computer:

   ```bash
   npm run dev
   ```

   Then open the address it prints (usually http://localhost:5173).

4. Check that it builds for production (Vercel runs this too):

   ```bash
   npm run build
   ```

   `npm run preview` serves that production build locally.

Where things live: pages are in `src/pages/` (routes are listed in `src/main.tsx`), shared pieces in `src/components/`, the Supabase connection in `src/lib/supabase.ts`, and colours and fonts in `src/index.css`. `vercel.json` makes links like `/login`, `/dashboard` and `/reset-password` work when the site is deployed.

Logging in: `/login` has log in, create an account, and "forgot your password". Creating an account logs people straight in and takes them to `/dashboard`. The "forgot password" email brings people back to `/reset-password` to choose a new password (and if "Confirm email" is turned back on, the confirmation email brings them to `/dashboard`). `/dashboard` sends people to `/login` if they aren't logged in.

Family dashboard (`/dashboard`): a big "All okay" or "Needs a look" card, when the person was last seen, and the 20 latest alerts from the SightLine stand. New alerts appear without reloading. It reads the `events` table that the stand writes to, so run `hardware/supabase.sql` once in Supabase (SQL Editor -> New query -> paste -> Run) before using it. Until then the dashboard says "No stand connected yet".

## Phone Tracker page (`/tracker`)

The page that drives the Phone Tracker stand: it finds people with the camera, follows the one you tap, and aims the stand and its humidifier mist at them. The code is in `src/tracker/` (see `src/tracker/README.md`); the hardware, firmware and build guide are in `phone-tracker/`.

- On a PC: `npm run dev`, then open http://localhost:5173/tracker in **Chrome or Edge**. Safari and Firefox can't use Bluetooth.
- On an iPhone: open the deployed `https://…/tracker` link in the free **Bluefy** browser. It has to be https; Safari can't use Bluetooth from a website.
- Test the tracking logic without a camera: `npm run test:tracker`.
