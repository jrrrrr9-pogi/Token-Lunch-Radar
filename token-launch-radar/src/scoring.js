// Transparent launch-quality scoring. Every point and every flag is explained,
// so a user can see exactly why a token ranks where it does.
//
// Score is 0-100 (higher = healthier-looking launch). Any "high" severity flag
// caps the score at 40. This is a heuristic screen, NOT a safety guarantee.

const MAX_RAW = 105;
const HIGH_FLAG_CAP = 40;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => (Number.isFinite(v) ? v : 0);

export function compact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

export function gradeOf(score) {
  if (score >= 75) return "A";
  if (score >= 55) return "B";
  if (score >= 35) return "C";
  return "D";
}

export function scoreToken(t, now = Date.now()) {
  const flags = [];
  const factors = [];
  let raw = 0;

  const add = (name, points, max, note) => {
    const p = Math.round(points * 10) / 10;
    factors.push({ name, points: p, max, note });
    raw += p;
  };
  const flag = (severity, code, message) => flags.push({ severity, code, message });

  // 1. Liquidity (0-25, log scale: $2k -> 0, $200k -> 25)
  const liq = num(t.liquidityUsd);
  const liqPts = liq <= 2000 ? 0 : clamp((25 * Math.log10(liq / 2000)) / 2, 0, 25);
  add("Liquidity", liqPts, 25, `$${compact(liq)} in the pool`);
  if (liq < 5000) {
    flag("high", "THIN_LIQUIDITY", `Only $${compact(liq)} of liquidity: easy to manipulate and hard to exit`);
  }

  // 2. Liquidity relative to valuation (0-10)
  const cap = num(t.marketCap) || num(t.fdv);
  if (cap > 0) {
    const ratio = liq / cap;
    add("Liquidity vs valuation", clamp(ratio / 0.1, 0, 1) * 10, 10, `${(ratio * 100).toFixed(1)}% of market cap is liquidity`);
    if (ratio < 0.02) {
      flag("warn", "LIQ_VS_CAP", "Liquidity is under 2% of market cap: the valuation is mostly on paper");
    }
  } else {
    add("Liquidity vs valuation", 0, 10, "No market cap data");
  }

  // 3. Hourly volume vs liquidity (0-10)
  const vol1 = num(t.volume?.h1);
  if (vol1 <= 0 || liq <= 0) {
    add("Volume health", 0, 10, "No hourly volume");
  } else {
    const r = vol1 / liq;
    let pts = 10;
    if (r < 0.05) pts = 2;
    else if (r > 20) pts = 0;
    else if (r > 8) pts = 5;
    add("Volume health", pts, 10, `1h volume is ${r.toFixed(1)}x liquidity`);
    if (r > 20) {
      flag("warn", "WASH_VOLUME", `1h volume is ${r.toFixed(0)}x liquidity: possible wash trading`);
    }
  }

  // 4. Activity (0-15)
  const buys = num(t.txns?.h1?.buys);
  const sells = num(t.txns?.h1?.sells);
  const n = buys + sells;
  add("Activity", clamp(n / 100, 0, 1) * 15, 15, `${n} transactions in the last hour`);

  // 5. Buy/sell balance (0-15)
  if (n >= 20 && sells === 0) {
    flag("high", "NO_SELLS", `${buys} buys and zero sells in an hour: possible honeypot`);
  }
  if (n < 10) {
    add("Buy/sell balance", 0, 15, "Too few trades to judge");
  } else {
    const share = buys / n;
    add("Buy/sell balance", 15 * (1 - clamp(Math.abs(share - 0.55) / 0.45, 0, 1)), 15, `${Math.round(share * 100)}% of trades are buys`);
    if (share < 0.25 && n >= 20) {
      flag("warn", "SELL_PRESSURE", "Over 75% of recent trades are sells");
    }
  }

  // 6. Age (0-10)
  if (Number.isFinite(t.createdAt)) {
    const ageMin = (now - t.createdAt) / 60000;
    let pts = 8;
    if (ageMin < 5) pts = 0;
    else if (ageMin < 60) pts = 4;
    else if (ageMin < 1440) pts = 10;
    add("Age", pts, 10, `${Math.max(0, Math.round(ageMin))} min old`);
    if (ageMin < 5) {
      flag("info", "BRAND_NEW", "Under 5 minutes old: almost no history to judge");
    }
  } else {
    add("Age", 3, 10, "Unknown launch time");
  }

  // 7. Momentum (0-10)
  const ch1 = t.priceChange?.h1;
  if (Number.isFinite(ch1)) {
    add("Momentum", ch1 >= -30 && ch1 <= 200 ? 10 : 4, 10, `${ch1 >= 0 ? "+" : ""}${ch1.toFixed(0)}% in 1h`);
    if (ch1 > 500) {
      flag("warn", "PARABOLIC", `Up ${ch1.toFixed(0)}% in an hour: parabolic moves usually reverse`);
    }
    if (ch1 < -60) {
      flag("warn", "DUMPING", `Down ${Math.abs(ch1).toFixed(0)}% in an hour`);
    }
  } else {
    add("Momentum", 5, 10, "No price change data");
  }

  // 7b. Social presence (0-10). Cheap to fake, so low weight.
  const l = t.links ?? {};
  const socialPts = (l.website ? 4 : 0) + (l.twitter ? 3 : 0) + (l.telegram ? 3 : 0);
  add("Social presence", socialPts, 10, socialPts ? "Has public links" : "No website or socials");
  if (!socialPts) {
    flag("info", "NO_SOCIALS", "No website or social links listed");
  }

  let score = Math.round((raw / MAX_RAW) * 100);
  if (flags.some((f) => f.severity === "high")) {
    score = Math.min(score, HIGH_FLAG_CAP);
  }
  score = clamp(score, 0, 100);

  return { score, grade: gradeOf(score), flags, factors };
}
