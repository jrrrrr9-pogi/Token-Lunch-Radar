# Token Launch Radar

A live radar for brand-new token launches. It polls a data source, scores every launch with a **transparent, explainable model**, and shows a ranked dashboard that updates in real time, with an alert when a strong, clean launch appears.

Zero dependencies. Node 22 or later.

```sh
npm start        # demo mode: simulated launches, works offline
npm run live     # live mode: real launches via the DexScreener public API
npm test
```

Then open http://127.0.0.1:3000.

## What makes it useful

- **Every point is explained.** Click a token to see each scoring factor, its points and a plain-English note, plus the flags that fired.
- **Risk flags, not just a number.** High-severity flags (possible honeypot, thin liquidity) cap the score at 40, so a risky token can't hide behind good-looking numbers.
- **Real-time.** Server-Sent Events push new tokens, updates and alerts to the dashboard.
- **Filter fast.** Chain, minimum score, hide high-risk, and text search.
- **Pluggable sources.** A source is any object with `async poll()` returning normalized tokens (`src/sources/`).

## Scoring model (0-100)

| Factor | Max | What it checks |
|---|---|---|
| Liquidity | 25 | Pool size, log scale ($2k -> 0, $200k -> 25) |
| Liquidity vs valuation | 10 | Liquidity as a share of market cap |
| Volume health | 10 | 1h volume relative to liquidity |
| Activity | 15 | Transactions in the last hour |
| Buy/sell balance | 15 | Healthy two-way trading |
| Age | 10 | Penalizes under 5 minutes, rewards 1-24 hours |
| Momentum | 10 | Penalizes extreme pumps and dumps |
| Social presence | 10 | Website, X, Telegram (low weight, easy to fake) |

Flags: `THIN_LIQUIDITY` and `NO_SELLS` (high); `LIQ_VS_CAP`, `WASH_VOLUME`, `SELL_PRESSURE`, `PARABOLIC`, `DUMPING` (warn); `BRAND_NEW`, `NO_SOCIALS` (info).

Grades: A 75+, B 55+, C 35+, D below.

## Layout

```
src/scoring.js              the scoring model
src/radar.js                polling loop, ranking book, events
src/sources/demo.js         deterministic simulated launches
src/sources/dexscreener.js  live source (public API, no key)
src/server.js               HTTP + SSE server
public/index.html           dashboard (no build step)
test/radar.test.js          node:test suite
```

Config via env: `PORT`, `HOST` (default 127.0.0.1), `POLL_MS`, `ALERT_SCORE`.

## Limitations

- This is a heuristic screen. It cannot see contract-level risks (mint authority, hidden fees, locked liquidity, holder concentration). A high score does not mean a token is safe.
- Not financial advice.
- The DexScreener adapter follows the documented API but may need small tweaks if response fields change. Only `normalize()` in `src/sources/dexscreener.js` touches those fields.
