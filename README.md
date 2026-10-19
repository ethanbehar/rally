# ClubQuad 🎪
Discord-style home for college clubs. Chat, events, volunteer calls, officer inbox, alumni rollover, advisor view.

## Run it
Requires Node 22.5+ (no npm install needed — zero dependencies).

    node server.js            # then open http://localhost:3000

Env vars: `PORT` (3000), `CAMPUS` (label), `DB` (sqlite path), `SEED=0` (skip demo data).
Demo logins (password `demo1234`): demo@student.edu (officer), maya@student.edu (president), advisor@school.edu (advisor).
**Before going live:** run with `SEED=0` so demo accounts don't exist, and serve over HTTPS (add `Secure` to the cookie in `startSession`).

## What's in it
- Clubs with channels (announcement / chat / officers-only / members-only / alumni), live messages, reactions, typing, unread badges
- Explore directory: search, tags, one-tap join or request-to-join, invite codes
- One events board across all clubs: RSVP, capacity, volunteer spots, cancel-with-notify, advisor approval
- Inbox: message any club's officers from one place (all officers see it)
- Officer tools: roles, join requests, channels, class-year rollover to alumni, ownership transfer, advisor link
- Advisor dashboard: activity stats and event approvals

Files: `server.js` (API + live stream + SQLite), `seed.js`, `public/` (app.js, style.css, index.html).

## Put it online (real multi-user app)
GitHub Pages can't run this (static only). Use a Node host:
1. Push the whole folder (server.js, seed.js, package.json, render.yaml, public/) to GitHub.
2. render.com → New → Blueprint → select the repo → Deploy. You get a https://….onrender.com link.
3. Free plan wipes data on restart; for real use add a disk (see render.yaml) and set `SEED=0`.

## Install on a phone (no App Store)
Open the link in Safari (iPhone) or Chrome (Android) → Share → Add to Home Screen. It opens full-screen with its own icon.
