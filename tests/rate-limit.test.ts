// tests/rate-limit.test.ts
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { checkRateLimit } from "../src/rate-limit";

// t = 100 s exactos dentro de una ventana de 60 s → minuto 1, segundo 40
const T = 100_000;

describe("checkRateLimit (ventana fija)", () => {
  it("permite hasta el límite y bloquea con el tiempo real que queda", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(env.KV, "1.1.1.1", 3, 60, T)).allowed).toBe(true);
    }
    expect(await checkRateLimit(env.KV, "1.1.1.1", 3, 60, T + 5_000)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfter: 15,
    });
  });

  it("la ventana siguiente empieza de cero aunque el tráfico no pare", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(env.KV, "2.2.2.2", 3, 60, T);
    expect((await checkRateLimit(env.KV, "2.2.2.2", 3, 60, T + 20_000)).allowed).toBe(true);
  });

  it("cada IP tiene su propio contador", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(env.KV, "3.3.3.3", 3, 60, T);
    expect((await checkRateLimit(env.KV, "4.4.4.4", 3, 60, T)).allowed).toBe(true);
  });
});
