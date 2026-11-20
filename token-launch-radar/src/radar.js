// The radar polls a source on an interval, scores every token, keeps a ranked
// in-memory book and emits events: "new", "update", "alert", "source-error".

import { EventEmitter } from "node:events";
import { scoreToken } from "./scoring.js";

export class Radar extends EventEmitter {
  constructor({ source, pollMs = 5000, maxTokens = 300, alertScore = 75 } = {}) {
    super();
    if (!source || typeof source.poll !== "function") {
      throw new Error("Radar needs a source with a poll() method");
    }
    this.source = source;
    this.pollMs = pollMs;
    this.maxTokens = maxTokens;
    this.alertScore = alertScore;
    this.tokens = new Map();
    this.lastError = null;
    this.timer = null;
    this.running = false;
  }

  async tick() {
    let tokens;
    try {
      tokens = await this.source.poll();
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      this.emit("source-error", this.lastError);
      return;
    }
    this.lastError = null;

    const now = Date.now();
    for (const t of tokens ?? []) {
      if (!t || typeof t.id !== "string") continue;
      const result = scoreToken(t, now);
      const prev = this.tokens.get(t.id);
      const entry = { ...t, firstSeen: prev?.firstSeen ?? now, lastSeen: now, result };
      this.tokens.set(t.id, entry);

      if (!prev) {
        this.emit("new", entry);
        const hasHigh = result.flags.some((f) => f.severity === "high");
        if (result.score >= this.alertScore && !hasHigh) {
          this.emit("alert", entry);
        }
      } else {
        this.emit("update", entry);
      }
    }

    if (this.tokens.size > this.maxTokens) {
      const oldestFirst = [...this.tokens.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      for (const [id] of oldestFirst.slice(0, this.tokens.size - this.maxTokens)) {
        this.tokens.delete(id);
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      await this.tick();
      if (this.running) this.timer = setTimeout(loop, this.pollMs);
    };
    loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
  }

  list({ minScore = 0, chain, limit = 200 } = {}) {
    return [...this.tokens.values()]
      .filter((t) => t.result.score >= minScore && (!chain || t.chain === chain))
      .sort((a, b) => b.result.score - a.result.score || b.firstSeen - a.firstSeen)
      .slice(0, limit);
  }
}
