// tests/rate-limit.test.ts
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { checkRateLimit } from "../src/rate-limit";

// t = 100 s exactos → segundo 40 de la ventana de 60 s
const T = 100_000;

describe("checkRateLimit (binding de Rate Limiting, 10/60 s)", () => {
  it("permite 10 llamadas, bloquea la 11 e informa de los segundos hasta la próxima ventana", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await checkRateLimit(env.RL, "1.1.1.1", 60, T)).allowed).toBe(true);
    }
    expect(await checkRateLimit(env.RL, "1.1.1.1", 60, T + 5_000)).toEqual({ allowed: false, retryAfter: 15 });
  });

  it("cada IP tiene su propio contador", async () => {
    for (let i = 0; i < 10; i++) await checkRateLimit(env.RL, "3.3.3.3");
    expect((await checkRateLimit(env.RL, "4.4.4.4")).allowed).toBe(true);
  });
});
