// Live source using DexScreener's public API (no key needed).
//   GET /token-profiles/latest/v1            -> recently listed token profiles
//   GET /tokens/v1/{chainId}/{addr,addr,...} -> trading pairs for up to 30 tokens
//
// NOTE: written against the documented response shapes but not exercised
// against the live API in the build environment. If DexScreener changes a
// field, only normalize() below needs touching.

const BASE = "https://api.dexscreener.com";
const ADDRESS_RE = /^[A-Za-z0-9]{20,64}$/;
const CHAIN_RE = /^[a-z0-9-]{2,32}$/;

async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).pathname}`);
  }
  return res.json();
}

const numOrUndef = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function normalize(pair) {
  const social = (type) => pair.info?.socials?.find((s) => s.type === type)?.url;
  return {
    id: `${pair.chainId}:${pair.pairAddress}`,
    chain: pair.chainId,
    dex: pair.dexId,
    address: pair.baseToken?.address,
    name: String(pair.baseToken?.name ?? "Unknown"),
    symbol: String(pair.baseToken?.symbol ?? "?"),
    priceUsd: numOrUndef(pair.priceUsd),
    liquidityUsd: numOrUndef(pair.liquidity?.usd),
    fdv: numOrUndef(pair.fdv),
    marketCap: numOrUndef(pair.marketCap),
    volume: { m5: pair.volume?.m5, h1: pair.volume?.h1, h6: pair.volume?.h6, h24: pair.volume?.h24 },
    txns: { m5: pair.txns?.m5, h1: pair.txns?.h1, h6: pair.txns?.h6, h24: pair.txns?.h24 },
    priceChange: {
      m5: pair.priceChange?.m5,
      h1: pair.priceChange?.h1,
      h6: pair.priceChange?.h6,
      h24: pair.priceChange?.h24,
    },
    createdAt: numOrUndef(pair.pairCreatedAt),
    links: {
      website: pair.info?.websites?.[0]?.url,
      twitter: social("twitter"),
      telegram: social("telegram"),
    },
    url: pair.url,
  };
}

export class DexScreenerSource {
  constructor({ chains = ["solana", "base", "ethereum", "bsc"], maxPerChain = 30, maxAgeHours = 72 } = {}) {
    this.chains = chains;
    this.maxPerChain = maxPerChain;
    this.maxAgeMs = maxAgeHours * 3600 * 1000;
  }

  async poll() {
    const profiles = await getJson(`${BASE}/token-profiles/latest/v1`);
    const byChain = new Map();
    for (const p of Array.isArray(profiles) ? profiles : []) {
      if (!this.chains.includes(p.chainId) || !CHAIN_RE.test(p.chainId)) continue;
      if (typeof p.tokenAddress !== "string" || !ADDRESS_RE.test(p.tokenAddress)) continue;
      const list = byChain.get(p.chainId) ?? [];
      if (list.length < this.maxPerChain) list.push(p.tokenAddress);
      byChain.set(p.chainId, list);
    }

    const now = Date.now();
    const out = [];
    for (const [chain, addrs] of byChain) {
      const pairs = await getJson(`${BASE}/tokens/v1/${chain}/${addrs.join(",")}`);
      const best = new Map();
      for (const pair of Array.isArray(pairs) ? pairs : []) {
        const key = pair.baseToken?.address;
        if (!key) continue;
        const cur = best.get(key);
        if (!cur || (pair.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(key, pair);
      }
      for (const pair of best.values()) {
        const t = normalize(pair);
        if (Number.isFinite(t.createdAt) && now - t.createdAt > this.maxAgeMs) continue;
        out.push(t);
      }
    }
    return out;
  }
}
