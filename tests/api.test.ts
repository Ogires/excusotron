// tests/api.test.ts
// Adaptación del plan: `fetchMock` de "cloudflare:test" fue eliminado en
// @cloudflare/vitest-plugin 1.4.4. Según los tipos del propio plugin, SELF
// ejecuta el worker "in the same isolate/context as tests", así que parchear
// globalThis.fetch aquí intercepta el fetch saliente de src/groq.ts.
import { afterEach, describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const fetchReal = globalThis.fetch.bind(globalThis);

afterEach(() => {
  globalThis.fetch = fetchReal;
});

// Equivalente a fetchMock.post(GROQ_URL, respuesta). Recibe una fábrica porque
// un mismo Response no puede consumirse dos veces (el test de rate limit hace
// 10 peticiones y cada una necesita un body nuevo).
function mockGroq(crear: () => Response): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === GROQ_URL) return Promise.resolve(crear());
    return fetchReal(input, init);
  }) as typeof fetch;
}

function sseGroq(trozos: string[]): Response {
  const cuerpo =
    trozos
      .map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`)
      .join("") + "data: [DONE]\n\n";
  // En workerd un Response de string puede llegar con body null: se construye
  // como stream de chunks para garantizar que el worker vea upstream.body.
  const chunks = new TextEncoder().encode(cuerpo);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunks);
      controller.close();
    },
  });
  return new Response(stream);
}

const base = "https://example.com";

describe("POST /api/excusa", () => {
  it("traduce el stream de Groq a SSE propio", async () => {
    mockGroq(() => sseGroq(["No puedo ", "venir: lémur."]));
    const r = await SELF.fetch(`${base}/api/excusa`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "1.1.1.1" },
      body: JSON.stringify({ nivel: 2 }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const texto = await r.text();
    expect(texto).toContain('"t":"No puedo "');
    expect(texto).toContain('"t":"venir: lémur."');
    expect(texto).toContain("data: [DONE]");
  });

  it("rechaza nivel inválido con 400", async () => {
    const r = await SELF.fetch(`${base}/api/excusa`, {
      method: "POST",
      headers: { "cf-connecting-ip": "2.2.2.2" },
      body: JSON.stringify({ nivel: 7 }),
    });
    expect(r.status).toBe(400);
  });

  it("si Groq falla, sirve excusa de reserva marcada", async () => {
    mockGroq(() => new Response("boom", { status: 500 }));
    const r = await SELF.fetch(`${base}/api/excusa`, {
      method: "POST",
      headers: { "cf-connecting-ip": "3.3.3.3" },
      body: JSON.stringify({ nivel: 1 }),
    });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('"t":"reserva"');
  });

  it("bloquea con 429 a la 11ª petición de la misma IP", async () => {
    mockGroq(() => sseGroq(["ok"]));
    for (let i = 0; i < 10; i++) {
      const r = await SELF.fetch(`${base}/api/excusa`, {
        method: "POST",
        headers: { "cf-connecting-ip": "4.4.4.4" },
        body: JSON.stringify({ nivel: 3 }),
      });
      expect(r.status).toBe(200);
    }
    const bloqueada = await SELF.fetch(`${base}/api/excusa`, {
      method: "POST",
      headers: { "cf-connecting-ip": "4.4.4.4" },
      body: JSON.stringify({ nivel: 3 }),
    });
    expect(bloqueada.status).toBe(429);
  });
});
