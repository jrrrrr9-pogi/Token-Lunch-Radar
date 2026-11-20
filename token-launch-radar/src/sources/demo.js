// Offline demo source: deterministic, clearly fake launches that mimic
// common real-world patterns (healthy, hype, honeypot, thin, wash trading).

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Moon", "Giga", "Based", "Turbo", "Cosmic", "Sneaky", "Mega", "Pixel", "Neon", "Lucky"];
const SECOND = ["Cat", "Frog", "Rocket", "Chad", "Bot", "Goose", "Cash", "Wizard", "Pump", "Inu"];
const CHAINS = ["solana", "solana", "solana", "base", "ethereum"];
const ARCHETYPES = [
  ["healthy", 0.35],
  ["hype", 0.2],
  ["honeypot", 0.15],
  ["thin", 0.15],
  ["wash", 0.15],
];
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export class DemoSource {
  constructor({ seed = 42, perPoll = 2, initial = 12 } = {}) {
    this.rand = mulberry32(seed);
    this.perPoll = perPoll;
    this.initial = initial;
    this.tokens = [];
    this.counter = 0;
  }

  between(lo, hi) {
    return lo + this.rand() * (hi - lo);
  }

  pick(list) {
    return list[Math.floor(this.rand() * list.length)];
  }

  archetype() {
    let r = this.rand();
    for (const [name, p] of ARCHETYPES) {
      r -= p;
      if (r <= 0) return name;
    }
    return "healthy";
  }

  spawn(now, ageMinutes) {
    const kind = this.archetype();
    const chain = this.pick(CHAINS);
    const name = `${this.pick(FIRST)}${this.pick(SECOND)}`;
    this.counter += 1;
    let addr = "DEMO";
    for (let i = 0; i < 40; i++) addr += ALPHABET[Math.floor(this.rand() * ALPHABET.length)];

    const allSocials = { website: "https://example.com", twitter: "https://x.com/example", telegram: "https://t.me/example" };
    const t = {
      id: `${chain}:${addr}`,
      chain,
      dex: chain === "solana" ? "raydium" : "uniswap",
      address: addr,
      name,
      symbol: name.toUpperCase().slice(0, 6),
      priceUsd: this.between(0.00001, 0.01),
      createdAt: now - ageMinutes * 60000,
      url: "https://example.com/demo",
      links: allSocials,
      kind,
      volume: {},
      txns: { h1: {} },
      priceChange: {},
    };

    if (kind === "healthy") {
      t.liquidityUsd = this.between(40000, 300000);
      t.marketCap = t.liquidityUsd * this.between(5, 15);
      t.volume.h1 = t.liquidityUsd * this.between(0.3, 2);
      t.txns.h1 = { buys: Math.round(this.between(80, 200)), sells: Math.round(this.between(60, 150)) };
      t.priceChange.h1 = this.between(-10, 60);
    } else if (kind === "hype") {
      t.liquidityUsd = this.between(30000, 100000);
      t.marketCap = t.liquidityUsd * this.between(4, 10);
      t.volume.h1 = t.liquidityUsd * 6;
      t.txns.h1 = { buys: Math.round(this.between(250, 400)), sells: Math.round(this.between(30, 60)) };
      t.priceChange.h1 = this.between(600, 3000);
      delete t.links.telegram;
    } else if (kind === "honeypot") {
      t.liquidityUsd = this.between(20000, 60000);
      t.marketCap = t.liquidityUsd * this.between(3, 8);
      t.volume.h1 = t.liquidityUsd;
      t.txns.h1 = { buys: Math.round(this.between(40, 120)), sells: 0 };
      t.priceChange.h1 = this.between(20, 150);
      t.links = {};
    } else if (kind === "thin") {
      t.liquidityUsd = this.between(1000, 4000);
      t.marketCap = this.between(200000, 2000000);
      t.volume.h1 = t.liquidityUsd * this.between(0.5, 3);
      t.txns.h1 = { buys: Math.round(this.between(4, 15)), sells: Math.round(this.between(2, 10)) };
      t.priceChange.h1 = this.between(-50, 100);
      t.links = { twitter: allSocials.twitter };
    } else {
      t.liquidityUsd = this.between(15000, 40000);
      t.marketCap = t.liquidityUsd * this.between(5, 12);
      t.volume.h1 = t.liquidityUsd * 40;
      t.txns.h1 = { buys: Math.round(this.between(200, 260)), sells: Math.round(this.between(180, 240)) };
      t.priceChange.h1 = this.between(-20, 40);
    }
    return t;
  }

  evolve(t) {
    t.liquidityUsd *= 1 + (this.rand() - 0.5) * 0.1;
    t.txns.h1.buys += Math.floor(this.rand() * 10);
    if (t.kind !== "honeypot") t.txns.h1.sells += Math.floor(this.rand() * 8);
    t.priceChange.h1 += (this.rand() - 0.5) * 10;
    t.volume.h1 += t.liquidityUsd * this.rand() * 0.05;
  }

  async poll() {
    const now = Date.now();
    if (this.tokens.length === 0) {
      for (let i = 0; i < this.initial; i++) this.tokens.push(this.spawn(now, this.between(1, 90)));
    } else {
      for (const t of this.tokens) this.evolve(t);
      for (let i = 0; i < this.perPoll; i++) this.tokens.push(this.spawn(now, 0.5));
    }
    if (this.tokens.length > 80) this.tokens.splice(0, this.tokens.length - 80);
    return structuredClone(this.tokens);
  }
}
