# Token Launch Radar

A live radar for new token launches. It polls a data source, scores each launch with a transparent, explainable model, and displays a ranked dashboard that updates in real time.

Zero dependencies. Requires Node.js 22 or later.

```sh
npm start        # Demo mode: simulated launches, works offline
npm run live     # Live mode: real launches via the DexScreener public API
npm test
```

Then open http://127.0.0.1:3000.

## What it does

- **Explains every score:** inspect the scoring factors, points, plain-English explanations, and triggered flags for each token.
- **Highlights risk:** high-severity flags such as possible honeypots and thin liquidity cap the score at 40.
- **Streams updates:** Server-Sent Events send new tokens, updates, and alerts to the dashboard.
- **Makes filtering quick:** filter by chain, minimum score, risk level, or text search.
- **Supports pluggable sources:** add a source implementing `async poll()` that returns normalized tokens in `src/sources/`.

## Scoring model (0–100)

| Factor | Maximum | What it checks |
|---|---:|---|
| Liquidity | 25 | Pool size on a logarithmic scale ($2k → 0, $200k → 25) |
| Liquidity vs. valuation | 10 | Liquidity as a share of market cap |
| Volume health | 10 | One-hour volume relative to liquidity |
| Activity | 15 | Transactions in the last hour |
| Buy/sell balance | 15 | Healthy two-way trading |
| Age | 10 | Penalizes tokens under five minutes; rewards ages of 1–24 hours |
| Momentum | 10 | Penalizes extreme pumps and dumps |
| Social presence | 10 | Website, X, and Telegram (low weight; easy to fake) |

Flags: `THIN_LIQUIDITY` and `NO_SELLS` (high severity); `LIQ_VS_CAP`, `WASH_VOLUME`, `SELL_PRESSURE`, `PARABOLIC`, and `DUMPING` (warnings); `BRAND_NEW` and `NO_SOCIALS` (information).

Grades: A (75+), B (55+), C (35+), D (below 35).

## Project layout

```text
src/scoring.js              Scoring model
src/radar.js                Polling loop, ranking book, and events
src/sources/demo.js         Deterministic simulated launches
src/sources/dexscreener.js  Live source using the public API (no key)
src/server.js               HTTP and SSE server
public/index.html           Dashboard (no build step)
test/radar.test.js          node:test suite
```

Configuration via environment variables: `PORT`, `HOST` (default `127.0.0.1`), `POLL_MS`, and `ALERT_SCORE`.

## Limitations

This is a heuristic screening tool, not financial advice. It cannot detect all contract-level risks, including mint authority, hidden fees, locked liquidity, or holder concentration. A high score does not mean a token is safe. The DexScreener adapter may need updates if the API response fields change; only `normalize()` in `src/sources/dexscreener.js` handles those fields.

## License

MIT. See [LICENSE](LICENSE).
