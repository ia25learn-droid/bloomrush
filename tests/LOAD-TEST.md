# Bloom Rush: controlled 200-player test

Run `node tests/score-queue.test.mjs` for batching/retry checks.

With the Netlify-enabled Nuxt development server running, run:

```
node tests/load-room.mjs http://localhost:3000
```

The runner rejects non-loopback destinations. It uses a unique `load-*` room, never the active `sprout` room, and does not reset or overwrite real participants. It retains synthetic records in that isolated local room for diagnosis. The machine must have enough resources to run both the server and 200 simulated clients. Do not build or edit the app during the run.

## Coverage

- 200 simultaneous joins and a host reading the live roster.
- 19,800 simulated taps through the actual client score-batching queue, paced against an absolute clock over a 25-second race.
- State-only participant polling; no participant receives the full leaderboard.
- 20 injected temporary upload failures followed by retries.
- Final-score acknowledgements for all 200 players.
- Concurrent stale/new score submissions, monotonic sequence and score checks.
- Old-round and pre-start score rejection; zero scores for a new round.

## Latest clean run (2026-09-04)

See `load-results.json` for machine-readable measurements. 200/200 players joined, received the start before the scheduled deadline, and saved a score of 99. Zero unexpected HTTP errors; 20 injected failures recovered. 2,842 score requests versus 19,800 per-tap requests (85.6% reduction, including extra ordering-test requests). Overall p95 response time: 1,372 ms; host p95: 3,709 ms. Production build passed separately.

An earlier repeat exposed concurrent conditional-write races in the file-based Netlify emulator. The server now serializes writes per player within each process and additionally uses ETag conditional writes across production instances. The final run passed the ordering check.

## Limits and deployment

This is an HTTP test of the real local Nuxt endpoint and Netlify's local Blobs emulator, not a live Netlify capacity certification or a 200-phone/Wi-Fi test. Serverless cold starts, account quotas, production storage latency, mobile browsers, and event-network congestion remain unmeasured. A successful build is not a concurrency test. The observed host delay means this is not certified lag-free.

Deploy all app, server, and composable changes together. Room storage is now namespaced under `v2`; old demo/session records are not migrated or deleted. Participants should rejoin after the deployment. Reset preserves the ready roster for another round while changing the game id so scores cannot leak between rounds.

Score ordering and retries do not implement anti-cheat or host authentication. Scores are still client-reported. A separate staging deployment, explicit load-test authorization/budget, and a venue network rehearsal are needed before relying on this for a live 200-person event.
