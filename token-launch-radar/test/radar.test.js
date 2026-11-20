import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreToken, gradeOf } from "../src/scoring.js";
import { Radar } from "../src/radar.js";
import { DemoSource } from "../src/sources/demo.js";

const NOW = 1_700_000_000_000;

const healthy = () => ({
  id: "solana:healthy",
  chain: "solana",
  liquidityUsd: 150000,
  marketCap: 1500000,
  volume: { h1: 120000 },
  txns: { h1: { buys: 120, sells: 80 } },
  priceChange: { h1: 20 },
  createdAt: NOW - 6 * 3600 * 1000,
  links: { website: "https://a.example", twitter: "https://x.com/a", telegram: "https://t.me/a" },
});

test("a healthy launch scores an A with no high flags", () => {
  const r = scoreToken(healthy(), NOW);
  assert.ok(r.score >= 90, `score was ${r.score}`);
  assert.equal(r.grade, "A");
  assert.equal(r.flags.filter((f) => f.severity === "high").length, 0);
});

test("zero sells with real activity is flagged as a honeypot and capped", () => {
  const t = healthy();
  t.txns.h1 = { buys: 100, sells: 0 };
  const r = scoreToken(t, NOW);
  assert.ok(r.flags.some((f) => f.code === "NO_SELLS" && f.severity === "high"));
  assert.ok(r.score <= 40);
});

test("thin liquidity is a high-severity flag", () => {
  const t = healthy();
  t.liquidityUsd = 1500;
  const r = scoreToken(t, NOW);
  assert.ok(r.flags.some((f) => f.code === "THIN_LIQUIDITY"));
  assert.ok(r.score <= 40);
});

test("wash-trading volume and parabolic moves are warned about", () => {
  const t = healthy();
  t.volume.h1 = t.liquidityUsd * 40;
  t.priceChange.h1 = 900;
  const codes = scoreToken(t, NOW).flags.map((f) => f.code);
  assert.ok(codes.includes("WASH_VOLUME"));
  assert.ok(codes.includes("PARABOLIC"));
});

test("missing data never produces NaN", () => {
  const r = scoreToken({}, NOW);
  assert.ok(Number.isInteger(r.score));
  assert.ok(r.score >= 0 && r.score <= 100);
  for (const f of r.factors) assert.ok(Number.isFinite(f.points));
});

test("grade boundaries", () => {
  assert.equal(gradeOf(75), "A");
  assert.equal(gradeOf(55), "B");
  assert.equal(gradeOf(35), "C");
  assert.equal(gradeOf(34), "D");
});

test("radar dedupes, ranks, and alerts only on strong clean launches", async () => {
  const good = { ...healthy(), id: "a", createdAt: Date.now() - 6 * 3600 * 1000 };
  const bad = { ...healthy(), id: "b", liquidityUsd: 1000, createdAt: Date.now() - 6 * 3600 * 1000 };
  const radar = new Radar({ source: { poll: async () => [good, bad] } });

  const alerts = [];
  radar.on("alert", (t) => alerts.push(t.id));
  await radar.tick();
  await radar.tick();

  assert.equal(radar.tokens.size, 2);
  assert.deepEqual(alerts, ["a"]);
  assert.equal(radar.list()[0].id, "a");
  assert.deepEqual(radar.list({ minScore: 90 }).map((t) => t.id), ["a"]);
});

test("a failing source emits source-error and does not throw", async () => {
  const radar = new Radar({ source: { poll: async () => { throw new Error("boom"); } } });
  let msg = null;
  radar.on("source-error", (m) => (msg = m));
  await radar.tick();
  assert.equal(msg, "boom");
  assert.equal(radar.lastError, "boom");
});

test("radar prunes beyond maxTokens", async () => {
  const radar = new Radar({ source: new DemoSource({ initial: 20 }), maxTokens: 10 });
  await radar.tick();
  assert.equal(radar.tokens.size, 10);
});

test("demo source is deterministic for a seed and mixes archetypes", async () => {
  const a = await new DemoSource({ seed: 7, initial: 30 }).poll();
  const b = await new DemoSource({ seed: 7, initial: 30 }).poll();
  assert.deepEqual(a.map((t) => t.kind), b.map((t) => t.kind));
  assert.ok(new Set(a.map((t) => t.kind)).size >= 3);
});
