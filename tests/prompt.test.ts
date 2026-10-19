// tests/prompt.test.ts
import { describe, expect, it } from "vitest";
import { ANIMALES, buildPrompt, EVENTOS, OBJETOS, validarNivel } from "../src/prompt";

describe("validarNivel", () => {
  it("acepta 1, 2 y 3 (número o string)", () => {
    expect(validarNivel(1)).toBe(1);
    expect(validarNivel("2")).toBe(2);
    expect(validarNivel(3)).toBe(3);
  });
  it("rechaza el resto", () => {
    expect(validarNivel(0)).toBeNull();
    expect(validarNivel(4)).toBeNull();
    expect(validarNivel("alto")).toBeNull();
    expect(validarNivel(undefined)).toBeNull();
    expect(validarNivel(null)).toBeNull();
  });
});

describe("buildPrompt", () => {
  it("incluye el nivel y una semilla de cada lista", () => {
    const p = buildPrompt(2);
    expect(p.user).toContain("nivel 2");
    expect(ANIMALES.some((a) => p.user.includes(a))).toBe(true);
    expect(OBJETOS.some((o) => p.user.includes(o))).toBe(true);
    expect(EVENTOS.some((e) => p.user.includes(e))).toBe(true);
  });
  it("el system limita longitud y prohíbe preámbulos", () => {
    expect(buildPrompt(1).system).toContain("máximo 80 palabras");
    expect(buildPrompt(1).system).toContain("sin introducciones");
  });
});
