# TypeFlow · Event typing contest

A typing contest built for one night: rolling 60-second rounds while people arrive, then a single organizer-run final for prizes.
Scoring follows Monkeytype (WPM = characters of correctly typed words, including their spaces, divided by 5 per minute; accuracy = correct keypresses / total keypresses). Ties are broken by accuracy, then by who submitted first.

- **`/`**: players register (roll number, name, username) and play
- **`/screen`**: projector view with the join QR code, a live countdown and the leaderboards
- **`/admin`**: organizer console (needs `ADMIN_TOKEN`)

## How it works

- One Node process serves the site, the API and Socket.IO, with SQLite storage under `/data`. There's no Redis or Postgres to set up.
- Every browser gets the same word list for a round. Each player's 60 s timer starts on their first keystroke, which must come within 8 s of GO.
- The browser sends a live WPM once a second for the live board. At the end it sends the full **keystroke log**, and the server replays it through the same engine (`shared/engine.ts`) to calculate the official score. Scores the client reports are never trusted.
- The server rejects logs that arrive faster than real time allows. It flags scores above 200 WPM and machine-like keystroke timing, and flagged scores appear in `/admin`.
- Pasting is blocked. Each roll number gets one final result, and starting a new final wipes the previous final's scores.

## Deploying on Coolify

1. **New resource → Public/Private repository → Build pack: Dockerfile.** Set the branch, and set the port to `3000`.
2. **Environment variables:**
   | Variable | Example | Notes |
   |---|---|---|
   | `ADMIN_TOKEN` | a long random string | Required. Gives access to `/admin` and the CSV exports. |
   | `EVENT_NAME` | `Freshers' Orientation 2026` | Shown in the header and on the projector. |
   | `PUBLIC_URL` | `https://type.example.com` | Used for the QR code on `/screen` (defaults to the current origin). |
3. **Persistent storage:** add a volume mounted at **`/data`**. Without it, a redeploy loses registrations and scores.
4. **Domain:** attach a domain with HTTPS. Coolify's proxy passes WebSockets through without extra config.
5. **Health check:** `GET /api/health`. The Dockerfile already defines one.
6. Keep it at **one instance**. All round state lives in memory in that single process. 1 vCPU and 512 MB is plenty: 400 simulated players used about 90 MB.

Optional timing settings, in seconds: `ROUND_SECONDS` (60), `INTERMISSION_SECONDS` (25), `COUNTDOWN_SECONDS` (5), `FINAL_COUNTDOWN_SECONDS` (10), `START_WINDOW_SECONDS` (8), `SUBMIT_GRACE_SECONDS` (5), `RESULTS_SECONDS` (15). A rolling cycle is about 2 minutes.

Local Docker: `ADMIN_TOKEN=secret docker compose up --build`, then open http://localhost:3000.

## Event-night runbook

**Before doors open**
1. Deploy and open `/screen` on the projector laptop (full-screen with F11). Open `/admin` on an organizer's laptop.
2. Stress test the real deployment from a laptop (see below), then press **Remove load-test bots** in `/admin`.
3. Register yourself and play one round on the venue Wi-Fi.

**While people arrive:** rolling rounds run on their own. Students scan the QR code, register and play as many rounds as they like. "Tonight's top typists" shows each player's best rolling score. Use **Hide** in the admin console for any inappropriate username.

**The final**
1. **Prepare final.** If a rolling round is running, it finishes first. Every screen then shows "get ready".
2. Give people a minute to settle, then press **Start final**. Everyone gets a 10 s countdown and one 60 s attempt.
3. Results appear on every screen and stay up. Download **Final results CSV**, which includes roll numbers and names.
4. Check **Flagged scores**. Before handing out prizes, it's worth watching the top 3 type briefly in person.
5. **Abort** during the final discards it so you can prepare it again. **Run rolling rounds** goes back to casual play afterwards.

## Stress testing

```bash
npm install
npm run loadtest -- --url https://type.example.com --bots 400 --rounds 1
```

Bots register (roll `LT<run>-<n>`, name `Load Test Bot`), connect over WebSockets, and play real-time rounds exactly like browsers do. They type at 30–110 WPM with typos, send progress once a second, and all submit at the end. The report covers submit acknowledgement latency, the live-update interval, disconnects, how many server scores matched the bots' own calculation, and the server's event-loop lag and memory. Afterwards, press **Remove load-test bots** in `/admin`.

Local baseline (400 bots, same machine): 400/400 submitted, 0 failures, 0 score mismatches, submit acknowledgement p95 of 5 ms, live updates exactly every ~1 s, event-loop p99 of about 21 ms, and 90 MB of memory.

## Development

```bash
npm install
npm run dev        # Vite on :5173 (proxies to the server on :3000)
npm run typecheck
npm run build && ADMIN_TOKEN=dev npm start
```

Layout: `shared/` (typing engine, word list, protocol types), `server/` (Express, Socket.IO, round state machine, SQLite), `client/` (React + Tailwind), `loadtest/`.
