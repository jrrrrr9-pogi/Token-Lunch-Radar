import { DemoSource } from "./demo.js";
import { DexScreenerSource } from "./dexscreener.js";

export function createSource(name) {
  switch (name) {
    case "demo":
      return new DemoSource();
    case "dexscreener":
      return new DexScreenerSource();
    default:
      throw new Error(`Unknown source "${name}". Use "demo" or "dexscreener".`);
  }
}
