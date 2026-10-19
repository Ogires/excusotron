// tests/stats.test.ts
import { describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("GET /api/stats", () => {
  it("devuelve el total de excusas dispensadas", async () => {
    await env.KV.put("stats:total", "42");
    const r = await SELF.fetch("https://example.com/api/stats");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ total: 42 });
  });
});
