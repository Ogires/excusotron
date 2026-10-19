// tests/rate-limit.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { checkRateLimit } from "../src/rate-limit";

beforeEach(async () => {
  await env.KV.delete("rl:1.2.3.4");
  await env.KV.delete("rl:5.6.7.8");
});

describe("checkRateLimit", () => {
  it("permite las primeras 10 llamadas y bloquea la 11", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await checkRateLimit(env.KV, "1.2.3.4");
      expect(r.allowed).toBe(true);
    }
    const bloqueada = await checkRateLimit(env.KV, "1.2.3.4");
    expect(bloqueada.allowed).toBe(false);
    expect(bloqueada.retryAfter).toBe(60);
  });

  it("las IPs son independientes", async () => {
    expect((await checkRateLimit(env.KV, "1.2.3.4", 1)).allowed).toBe(true);
    expect((await checkRateLimit(env.KV, "1.2.3.4", 1)).allowed).toBe(false);
    expect((await checkRateLimit(env.KV, "5.6.7.8", 1)).allowed).toBe(true);
  });

  it("informa del remaining", async () => {
    const r = await checkRateLimit(env.KV, "1.2.3.4");
    expect(r.remaining).toBe(9);
  });
});
