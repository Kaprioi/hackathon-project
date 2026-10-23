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

_(Filled in once the app is set up.)_
