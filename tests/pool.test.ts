// tests/pool.test.ts
import { describe, expect, it } from "vitest";
import { POOL_EXCUSAS } from "../src/pool";

describe("pool de reserva", () => {
  it("tiene al menos 15 excusas válidas", () => {
    expect(POOL_EXCUSAS.length).toBeGreaterThanOrEqual(15);
    for (const e of POOL_EXCUSAS) {
      expect([1, 2, 3]).toContain(e.nivel);
      expect(e.texto.length).toBeGreaterThan(20);
    }
  });
  it("cubre los tres niveles", () => {
    expect([...new Set(POOL_EXCUSAS.map((e) => e.nivel))].sort()).toEqual([1, 2, 3]);
  });
});
