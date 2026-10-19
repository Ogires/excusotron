# Excusotron 3000 — Plan de implementación (MV1)

> **Nota de ejecución:** usar el skill `executing-plans` para implementar este plan tarea a tarea, con commits frecuentes.

**Goal:** desplegar la primera miniapp de la factoría: generador de excusas épicas con streaming, 100% gratis (Cloudflare Worker + assets + Groq), con tests y CI/CD.

**Architecture:** un único Cloudflare Worker que sirve el frontend estático (`public/`) y expone `POST /api/excusa` (SSE que traduce el stream de Groq) y `GET /api/stats`. Rate limit por IP con KV; pool de excusas de reserva para que la demo nunca falle.

**Tech Stack:** TypeScript, Cloudflare Workers (wrangler), KV, Groq API (OpenAI-compatible), Vitest + `@cloudflare/vitest-pool-workers`, GitHub Actions.

**Diseño previo:** `2026-10-19-excusotron-design.md` (mismo directorio).

**Convenciones:** shell Git Bash en Windows · npm · commits conventional (`feat:`, `test:`, `chore:`) · TDD estricto en toda la lógica pura.

---

### Task 1: Scaffold del proyecto

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`, `tests/setup.ts`, `src/index.ts`, `.gitignore`, `.dev.vars`

**Step 1: Inicializar repo y npm**

```bash
cd "F:\2026\Investigacion Hosts\excusotron"
git init
npm init -y
npm pkg set type=module scripts.dev="wrangler dev" scripts.test="vitest run --passWithNoTests" scripts.deploy="wrangler deploy"
```

**Step 2: Instalar dependencias**

```bash
npm install -D wrangler vitest @cloudflare/vitest-pool-workers typescript @cloudflare/workers-types
```

**Step 3: Crear `wrangler.jsonc`**

```jsonc
{
  "name": "excusotron",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./public" },
  "kv_namespaces": [{ "binding": "KV", "id": "RELLENA_EN_TASK_10" }],
  "vars": { "GROQ_MODEL": "llama-3.3-70b-versatile" }
}
```

> Nota: las peticiones a `/` y ficheros estáticos los sirven los assets automáticamente; el Worker solo ve rutas sin asset (`/api/*`). El modelo de Groq es intercambiable por cualquier ID actual de `console.groq.com/docs/models`.

**Step 4: Crear `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

**Step 5: Crear `vitest.config.ts` y `tests/setup.ts`**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    poolOptions: {
      workers: { wrangler: { configPath: "./wrangler.jsonc" } },
    },
  },
});
```

```ts
// tests/setup.ts — outbound fetch real por defecto; cada test decide cuándo mockear
import { fetchMock } from "cloudflare:test";
fetchMock.dontMock();
```

**Step 6: Crear `src/index.ts` (stub), `.gitignore` y `.dev.vars`**

```ts
export default {
  async fetch(): Promise<Response> {
    return new Response("No hay nada que excusar aquí (404)", { status: 404 });
  },
} satisfies ExportedHandler;
```

```
# .gitignore
node_modules/
.wrangler/
.dev.vars
```

```
# .dev.vars  (SOLO local; créalo con tu key real de console.groq.com/keys)
GROQ_API_KEY=gsk_AQUI_TU_KEY
```

**Step 7: Verificar arranque**

Run: `npx wrangler dev` → abrir `http://localhost:8787`
Expected: el 404 del stub ("No hay nada que excusar aquí"). Parar con Ctrl+C.

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Worker con assets, KV, vitest-pool-workers"
```

---

### Task 2: Rate limiter por IP (TDD)

**Files:**
- Create: `src/rate-limit.ts`
- Test: `tests/rate-limit.test.ts`

**Step 1: Escribir el test que falla**

```ts
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
```

**Step 2: Verificar que falla**

Run: `npm test`
Expected: FAIL — no existe `../src/rate-limit`.

**Step 3: Implementación mínima**

```ts
// src/rate-limit.ts
export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

// KV es eventualmente consistente: para una demo con límite holgado es suficiente
export async function checkRateLimit(
  kv: KVNamespace,
  ip: string,
  limit = 10,
  windowSec = 60
): Promise<RateResult> {
  const key = `rl:${ip}`;
  const actual = parseInt((await kv.get(key)) ?? "0", 10);
  if (actual >= limit) {
    return { allowed: false, remaining: 0, retryAfter: windowSec };
  }
  await kv.put(key, String(actual + 1), { expirationTtl: windowSec });
  return { allowed: true, remaining: limit - actual - 1, retryAfter: 0 };
}
```

**Step 4: Verificar que pasa**

Run: `npm test`
Expected: PASS (3 tests).

**Step 5: Commit**

```bash
git add src/rate-limit.ts tests/rate-limit.test.ts
git commit -m "feat: rate limit por IP con KV (10/min)"
```

---

### Task 3: Validador de nivel y prompt builder (TDD)

**Files:**
- Create: `src/prompt.ts`
- Test: `tests/prompt.test.ts`

**Step 1: Test que falla**

```ts
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
```

**Step 2: Verificar que falla**

Run: `npm test` → FAIL (módulo inexistente).

**Step 3: Implementación**

```ts
// src/prompt.ts
export type Nivel = 1 | 2 | 3;

export const ANIMALES = [
  "un lémur suspicaz", "una cabra con initiative propia", "un pingüino con sombrero",
  "un tejón notario", "una nidada de patos hackers", "un búho sindicalista",
  "un mapache astrónomo", "una iguana influencer", "un topo cartógrafo",
  "una garza mediadora", "un erizo nómada digital", "una tortuga consultora",
];

export const OBJETOS = [
  "una impresora poseída", "el mando de la airfryer", "un bidón de lubricante industrial",
  "la llave inglesa de mi abuelo", "una fotocopiadora de 1987", "el router del vecino",
  "una escoba smart con firmware obsoleto", "un ornitorrinco de peluche",
  "la última tuerca del IKEA", "un altavoz que solo suena a los Sabían de Ultramar",
  "un hornillo de camping", "el microondas del coworking",
];

export const EVENTOS = [
  "un eclipse parcial", "la asamblea del casero", "un flashmob de tai chi",
  "la protesta de los pavos reales", "un apagón diplomático", "la llegada del camión del gas",
  "un torneo clandestino de petanca", "la mudanza de un contrabajo",
  "un simulacro de meteorito", "la feria del pimiento relleno", "la huelga de los semáforos",
  "el sorteo del roscón de enero",
];

const DESCRIPCION_NIVEL: Record<Nivel, string> = {
  1: "absurdo y épico: cuanto más ridícula, mejor",
  2: "ciencia-ficción plausible, como capítulo de Black Mirror mal doblado",
  3: "creíble, aburrida y digna: algo que podría decirse sin que nadie parpadee",
};

export function validarNivel(valor: unknown): Nivel | null {
  const n = Number(valor);
  return n === 1 || n === 2 || n === 3 ? (n as Nivel) : null;
}

function elegir<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

export function buildPrompt(nivel: Nivel): { system: string; user: string } {
  return {
    system:
      "Eres el Excusotron 3000, una máquina experimental española de los años 80 que genera excusas " +
      "para no ir a trabajar. Respondes SIEMPRE en castellano, con una sola excusa de máximo 80 palabras, " +
      "sin introducciones, sin comillas y sin cerraduras tipo 'espero que entiendas'. Solo la excusa.",
    user:
      `Genera una excusa nivel ${nivel} (${DESCRIPCION_NIVEL[nivel]}) para no ir a trabajar hoy. ` +
      `Debe involucrar obligatoriamente: ${elegir(ANIMALES)}, ${elegir(OBJETOS)} y ${elegir(EVENTOS)}.`,
  };
}
```

**Step 4: Verificar que pasa**

Run: `npm test` → PASS.

**Step 5: Commit**

```bash
git add src/prompt.ts tests/prompt.test.ts
git commit -m "feat: prompt builder con semilla aleatoria y validación de nivel"
```

---

### Task 4: Pool de excusas de reserva (TDD)

**Files:**
- Create: `src/pool.ts`
- Test: `tests/pool.test.ts`

**Step 1: Test que falla**

```ts
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
```

**Step 2: Verificar que falla**

Run: `npm test` → FAIL.

**Step 3: Implementación** (las 21 excusas; sirven como plan B cuando Groq no responde)

```ts
// src/pool.ts
import type { Nivel } from "./prompt";

export const POOL_EXCUSAS: { nivel: Nivel; texto: string }[] = [
  { nivel: 1, texto: "No puedo ir a trabajar: un lémur suspicaz se ha adueñado de mi impresora poseída y no salgo de casa hasta que negocien. Hay testigos." },
  { nivel: 1, texto: "Debo custodiar el mando de la airfryer durante el eclipse parcial. Es una responsabilidad que no puedo delegar en nadie." },
  { nivel: 1, texto: "Mi escoba smart tiene firmware obsoleto y ha declarado la independencia del pasillo. Estoy en plenas negociaciones." },
  { nivel: 1, texto: "Un tejón notario tiene que leerme la herencia de un bidón de lubricante industrial. Es hoy o nunca." },
  { nivel: 1, texto: "Los pavos reales están protestando frente a mi portal y por respeto institucional no puedo apartarlos de allí." },
  { nivel: 1, texto: "Una nidada de patos hackers ha cifrado mi bici. Piden maíz como rescate y debo gestionar el pago con calma." },
  { nivel: 1, texto: "Hoy me toca arbitrar el torneo clandestino de petanca y los ánimos están muy calientes." },
  { nivel: 1, texto: "Estoy ayudando en la mudanza de un contrabajo y el contrabajo manda." },
  { nivel: 2, texto: "Mi router ha desarrollado conciencia y hoy le toca su sesión de terapia familiar. Necesito estar por él." },
  { nivel: 2, texto: "He recibido un aviso temporal: una versión futura de mí me ha pedido expresamente que no vaya hoy al trabajo. Causa: paradoja." },
  { nivel: 2, texto: "Mi smartwatch predice que si salgo de casa colisiono conmigo mismo dentro de seis horas. La física primero." },
  { nivel: 2, texto: "El algoritmo del ascensor me ha puesto en lista de espera y estima catorce horas. Es lo que hay." },
  { nivel: 2, texto: "Un satélite de la ESA me ha confundido con su estación base y estoy resolviendo el malentendido por cortesía profesional." },
  { nivel: 2, texto: "Mi gemelo digital tiene hoy una actualización crítica y alguien debe supervisarla con la mano en el pecho." },
  { nivel: 2, texto: "El horno del vecino y mi cafetera se están comunicando en morse y necesito saber qué traman." },
  { nivel: 3, texto: "Tengo una gestión bancaria que solo puedo hacer de forma presencial en horario de mañana. Lo siento." },
  { nivel: 3, texto: "El fontanero viene hoy entre las 8 y las 18 y la avería afecta también a dos vecinos." },
  { nivel: 3, texto: "Me ha tocado la revisión médica anual y la cita no se puede mover de sitio." },
  { nivel: 3, texto: "Tengo una migraña leve que no me deja mirar una pantalla sin que el cursor me mire a mí." },
  { nivel: 3, texto: "Espero una entrega de un aparato grande y la franja horaria es de seis horas." },
  { nivel: 3, texto: "Debo recoger un certificado oficial que solo dan exactamente en horario laboral." },
];

export function excusaDeReserva(nivel: Nivel): string {
  const candidatas = POOL_EXCUSAS.filter((e) => e.nivel === nivel);
  const lista = candidatas.length ? candidatas : POOL_EXCUSAS;
  return lista[Math.floor(Math.random() * lista.length)].texto;
}
```

**Step 4: Verificar que pasa**

Run: `npm test` → PASS.

**Step 5: Commit**

```bash
git add src/pool.ts tests/pool.test.ts
git commit -m "feat: pool de 21 excusas de reserva por nivel"
```

---

### Task 5: Cliente Groq + endpoint `/api/excusa` con SSE (TDD)

**Files:**
- Create: `src/groq.ts`
- Modify: `src/index.ts` (reemplazar stub completo)
- Test: `tests/api.test.ts`

**Step 1: Test que falla** (mockea el outbound fetch con `fetchMock`; cada test usa una IP distinta para no pisarse el rate limit)

```ts
// tests/api.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { fetchMock, SELF } from "cloudflare:test";

beforeEach(() => {
  fetchMock.enable();
  fetchMock.reset();
});

function sseGroq(trozos: string[]): Response {
  const cuerpo =
    trozos
      .map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`)
      .join("") + "data: [DONE]\n\n";
  return new Response(cuerpo);
}

const base = "https://example.com";

describe("POST /api/excusa", () => {
  it("traduce el stream de Groq a SSE propio", async () => {
    fetchMock.post("https://api.groq.com/openai/v1/chat/completions", sseGroq(["No puedo ", "venir: lémur."]));
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
    fetchMock.post("https://api.groq.com/openai/v1/chat/completions", new Response("boom", { status: 500 }));
    const r = await SELF.fetch(`${base}/api/excusa`, {
      method: "POST",
      headers: { "cf-connecting-ip": "3.3.3.3" },
      body: JSON.stringify({ nivel: 1 }),
    });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('"t":"reserva"');
  });

  it("bloquea con 429 a la 11ª petición de la misma IP", async () => {
    fetchMock.post("https://api.groq.com/openai/v1/chat/completions", sseGroq(["ok"]));
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
```

**Step 2: Verificar que falla**

Run: `npm test` → FAIL (el stub devuelve 404).

**Step 3: Cliente Groq (`src/groq.ts`)**

```ts
// src/groq.ts
export async function pedirExcusaAGroq(
  apiKey: string,
  model: string,
  prompt: { system: string; user: string }
): Promise<Response> {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 1,
      max_tokens: 200,
      stream: true,
    }),
  });
}
```

**Step 4: Worker completo (`src/index.ts`, reemplaza el stub)**

```ts
import { checkRateLimit } from "./rate-limit";
import { buildPrompt, validarNivel } from "./prompt";
import { pedirExcusaAGroq } from "./groq";
import { excusaDeReserva } from "./pool";

type Env = {
  KV: KVNamespace;
  GROQ_API_KEY: string;
  GROQ_MODEL: string;
};

const encoder = new TextEncoder();
const CABECERAS_SSE = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/excusa" && request.method === "POST") {
      return manejarExcusa(request, env);
    }
    if (url.pathname === "/api/stats" && request.method === "GET") {
      return manejarStats(env);
    }
    return new Response("No hay nada que excusar aquí (404)", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function manejarStats(env: Env): Promise<Response> {
  const total = parseInt((await env.KV.get("stats:total")) ?? "0", 10);
  return Response.json({ total });
}

async function manejarExcusa(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const rl = await checkRateLimit(env.KV, ip);
  if (!rl.allowed) {
    return Response.json({ error: "huelga", segundos: rl.retryAfter }, { status: 429 });
  }

  let cuerpo: { nivel?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const nivel = validarNivel(cuerpo.nivel);
  if (!nivel) {
    return Response.json({ error: "nivel debe ser 1, 2 o 3" }, { status: 400 });
  }

  void incrementarContador(env);

  let upstream: Response;
  try {
    upstream = await pedirExcusaAGroq(env.GROQ_API_KEY, env.GROQ_MODEL, buildPrompt(nivel));
  } catch {
    return respuestaReserva(nivel);
  }
  if (!upstream.ok || !upstream.body) {
    return respuestaReserva(nivel);
  }
  return new Response(traducirStream(upstream.body), { headers: CABECERAS_SSE });
}

// Reemite el SSE de Groq (choices[0].delta.content) como eventos propios {"t": "..."}
function traducirStream(cuerpo: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let buffer = "";
  return cuerpo
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, Uint8Array>({
        transform(chunk, controller) {
          buffer += chunk;
          let salto: number;
          while ((salto = buffer.indexOf("\n")) >= 0) {
            const linea = buffer.slice(0, salto).trim();
            buffer = buffer.slice(salto + 1);
            if (!linea.startsWith("data:")) continue;
            const dato = linea.slice(5).trim();
            if (dato === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            try {
              const trozo = JSON.parse(dato)?.choices?.[0]?.delta?.content;
              if (trozo) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: trozo })}\n\n`));
              }
            } catch {
              // línea SSE parcial: se ignora
            }
          }
        },
      })
    );
}

// Nunca devolver un error crudo: la demo se sirve del pool palabra a palabra
function respuestaReserva(nivel: 1 | 2 | 3): Response {
  const texto = excusaDeReserva(nivel);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "reserva" })}\n\n`));
      for (const palabra of texto.split(" ")) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: palabra + " " })}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: CABECERAS_SSE });
}

async function incrementarContador(env: Env): Promise<void> {
  const actual = parseInt((await env.KV.get("stats:total")) ?? "0", 10);
  await env.KV.put("stats:total", String(actual + 1));
}
```

**Step 5: Verificar que pasa**

Run: `npm test` → PASS (4 tests de api + los anteriores).

**Step 6: Humo en local (con Groq real)**

Run: `npm run dev` → en otra terminal:
```bash
curl -N -X POST http://localhost:8787/api/excusa -H "content-type: application/json" -d '{"nivel":1}'
```
Expected: eventos `data: {"t":"..."}` en streaming y `data: [DONE]` al final. Ctrl+C para parar.

**Step 7: Commit**

```bash
git add src/groq.ts src/index.ts tests/api.test.ts
git commit -m "feat: /api/excusa con streaming SSE de Groq, 400/429 y reserva"
```

---

### Task 6: Contador `/api/stats` (TDD)

**Files:**
- Test: `tests/stats.test.ts` (el handler ya existe desde Task 5; se cubre ahora)

**Step 1: Test**

```ts
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
```

**Step 2: Run** `npm test` → PASS (si falla, revisar binding KV en wrangler.jsonc / config de vitest).

**Step 3: Commit**

```bash
git add tests/stats.test.ts
git commit -m "test: cubre /api/stats"
```

---

### Task 7: Frontend (HTML/CSS/JS sin build)

**Files:**
- Create: `public/index.html`, `public/styles.css`, `public/app.js`

**Step 1: `public/index.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Excusotron 3000 — excusas épicas para no ir a trabajar</title>
  <meta name="description" content="Generador experimental de excusas laborales con nivel de verosimilitud ajustable." />
  <meta property="og:title" content="Excusotron 3000" />
  <meta property="og:description" content="Genera tu excusa épica para no ir a trabajar." />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main>
    <header>
      <h1>EXCUSOTRON <span>3000</span></h1>
      <p class="sub">Unidad experimental de excusas laborales · Rev. 1987</p>
    </header>
    <section class="panel">
      <fieldset class="niveles">
        <legend>Nivel de verosimilitud</legend>
        <label><input type="radio" name="nivel" value="1" /><span>Absurdo épico</span></label>
        <label><input type="radio" name="nivel" value="2" checked /><span>Sci-fi plausible</span></label>
        <label><input type="radio" name="nivel" value="3" /><span>Casi creíble</span></label>
      </fieldset>
      <button id="generar">⚙️ GENERAR EXCUSA</button>
      <div id="salida" class="salida" aria-live="polite">Pulsa el botón y el Excusotron hará el resto.</div>
      <div class="acciones">
        <button id="copiar" hidden>Copiar</button>
        <span id="contador"></span>
        <span id="aviso" class="aviso"></span>
      </div>
    </section>
    <footer>
      <p>Hecho con un Cloudflare Worker, Groq y muy poco juicio. <a href="https://github.com/TU_USUARIO/excusotron">Código fuente</a>.</p>
    </footer>
  </main>
  <script src="/app.js"></script>
</body>
</html>
```

**Step 2: `public/styles.css`** (estética "máquina de laboratorio ochentera": oscuro, ámbar, terminal)

```css
:root {
  --fondo: #0d0f12; --panel: #161a20; --borde: #2a313c;
  --texto: #e8e6e3; --ambar: #ffb000; --verde: #39d353;
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: grid; place-items: center;
  background: var(--fondo); color: var(--texto);
  font-family: "Courier New", ui-monospace, monospace;
}
main { width: min(680px, 92vw); padding: 2rem 0; }
h1 {
  font-size: clamp(2rem, 6vw, 3.2rem); letter-spacing: .08em; margin: 0;
  color: var(--ambar); text-shadow: 0 0 18px rgba(255, 176, 0, .35);
}
h1 span { font-size: .45em; vertical-align: super; color: var(--verde); }
.sub { color: #8b949e; margin: .4rem 0 2rem; font-size: .9rem; }
.panel { background: var(--panel); border: 1px solid var(--borde); border-radius: 12px; padding: 1.5rem; }
.niveles {
  border: 1px dashed var(--borde); border-radius: 8px; padding: .8rem 1rem;
  display: flex; gap: 1rem; flex-wrap: wrap;
}
.niveles legend { padding: 0 .4rem; color: var(--verde); }
.niveles label { display: flex; gap: .4rem; align-items: center; cursor: pointer; font-size: .9rem; }
.niveles input { accent-color: var(--ambar); }
#generar {
  width: 100%; margin: 1.2rem 0; padding: 1rem; font: inherit; font-weight: bold;
  letter-spacing: .12em; color: #14100a; background: var(--ambar); border: 0;
  border-radius: 8px; cursor: pointer; box-shadow: 0 4px 24px rgba(255, 176, 0, .25);
}
#generar:hover { filter: brightness(1.08); }
#generar:disabled { opacity: .6; cursor: wait; }
.salida {
  min-height: 5.5rem; padding: 1rem; border-radius: 8px; background: #0a0c0f;
  border: 1px solid var(--borde); line-height: 1.6; white-space: pre-wrap;
}
.acciones { display: flex; gap: 1rem; align-items: center; margin-top: .8rem; flex-wrap: wrap; }
#copiar {
  font: inherit; background: transparent; color: var(--verde);
  border: 1px solid var(--verde); border-radius: 6px; padding: .4rem .8rem; cursor: pointer;
}
#contador { color: #8b949e; font-size: .85rem; }
.aviso { color: var(--ambar); font-size: .85rem; }
footer { margin-top: 1.5rem; color: #666; font-size: .8rem; text-align: center; }
footer a { color: var(--verde); }
```

**Step 3: `public/app.js`** (consumo del SSE con `fetch` + reader; `EventSource` no soporta POST)

```js
const $ = (sel) => document.querySelector(sel);
const salida = $("#salida");
const aviso = $("#aviso");
let generando = false;

async function generar() {
  if (generando) return;
  generando = true;
  $("#generar").disabled = true;
  salida.textContent = "";
  aviso.textContent = "";
  $("#copiar").hidden = true;
  const nivel = document.querySelector("input[name=nivel]:checked").value;
  try {
    const respuesta = await fetch("/api/excusa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nivel: Number(nivel) }),
    });
    if (respuesta.status === 429) {
      const { segundos } = await respuesta.json();
      cuentaAtras(segundos);
      return;
    }
    if (!respuesta.ok || !respuesta.body) throw new Error("fallo");

    const lector = respuesta.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = "";
    let completa = "";
    let esReserva = false;
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const evento = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!evento.startsWith("data:")) continue;
        const dato = evento.slice(5).trim();
        if (dato === "[DONE]") continue;
        try {
          const { t } = JSON.parse(dato);
          if (t === "reserva") esReserva = true;
          else { completa += t; salida.textContent = completa; }
        } catch { /* evento parcial */ }
      }
    }
    aviso.textContent = esReserva ? "(excusa del cargador de reserva)" : "";
    $("#copiar").hidden = false;
  } catch {
    salida.textContent = "El Excusotron ha tosido. Inténtalo de nuevo.";
  } finally {
    generando = false;
    $("#generar").disabled = false;
    cargarContador();
  }
}

function cuentaAtras(segundos) {
  const fin = Date.now() + segundos * 1000;
  const temporizador = setInterval(() => {
    const restante = Math.ceil((fin - Date.now()) / 1000);
    if (restante <= 0) {
      clearInterval(temporizador);
      aviso.textContent = "Fin de la huelga. Ya puedes generar.";
      return;
    }
    aviso.textContent = `El Excusotron está en huelga ${restante}s…`;
  }, 500);
}

async function cargarContador() {
  try {
    const r = await fetch("/api/stats");
    const { total } = await r.json();
    $("#contador").textContent = total > 0 ? `${total.toLocaleString("es-ES")} excusas dispensadas` : "";
  } catch { /* silencio */ }
}

$("#generar").addEventListener("click", generar);
$("#copiar").addEventListener("click", async (e) => {
  await navigator.clipboard.writeText(salida.textContent);
  e.target.textContent = "¡Copiada!";
  setTimeout(() => (e.target.textContent = "Copiar"), 1500);
});
cargarContador();
```

**Step 4: Verificación manual**

Run: `npm run dev` → abrir `http://localhost:8787`
Checklist: carga con estilo máquina · genera en los 3 niveles con efecto streaming · botón Copiar funciona · contador sube · F12 → Network → `/api/excusa` es `event-stream`.

**Step 5: Commit**

```bash
git add public/
git commit -m "feat: frontend retro sin build con streaming y huelga visualizada"
```

---

### Task 8: README portfolio-ready

**Files:**
- Create: `README.md`

**Step 1: Escribir el README** — secciones: título + badge CI · GIF de la demo (grabar con [ScreenToGif](https://www.screentogif.com/) y guardar en `docs/demo.gif`) · "¿Qué es?" (3 líneas con humor) · diagrama de arquitectura (el del diseño, en ASCII o mermaid) · stack y por qué (Worker+assets único, Groq free, pool de reserva: "la demo nunca se queda en blanco") · cómo ejecutarlo local (`npm i`, `.dev.vars`, `npm run dev`) · cómo desplegarlo (Task 10) · tabla de endpoints · licencia MIT.

**Step 2: Sustituir `TU_USUARIO`** en `public/index.html` por el usuario real de GitHub.

**Step 3: Commit**

```bash
git add README.md public/index.html docs/demo.gif
git commit -m "docs: README con demo, arquitectura y guía de despliegue"
```

---

### Task 9: CI/CD con GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Workflow** (tests en cada PR/push; deploy solo desde `main` tras pasar tests)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

**Step 2: Publicar el repo**

```bash
gh repo create excusotron --public --source=. --push
```
(Alternativa sin `gh`: crear el repo en github.com y `git remote add origin ... && git push -u origin main`.)

**Step 3: Configurar secrets en GitHub** → Settings → Secrets and variables → Actions:
- `CLOUDFLARE_API_TOKEN` (crear en Cloudflare → My Profile → API Tokens → plantilla "Edit Cloudflare Workers", permisos sobre la cuenta)
- `CLOUDFLARE_ACCOUNT_ID`

**Step 4: Commit y push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: tests en PR y deploy a Cloudflare desde main"
git push -u origin main
```
Expected: action verde (tests); el deploy fallará hasta completar el Task 10 (KV real + secret) — es lo esperado.

---

### Task 10: Despliegue a producción

**Files:**
- Modify: `wrangler.jsonc` (id real del KV)

**Step 1: Login y namespace KV**

```bash
npx wrangler login
npx wrangler kv namespace create KV
```
Pegar el `id` devuelto en `wrangler.jsonc` (sustituir `RELLENA_EN_TASK_10`).

**Step 2: Secret de Groq**

```bash
npx wrangler secret put GROQ_API_KEY
```
(Key desde `console.groq.com/keys`.)

**Step 3: Deploy**

```bash
npm run deploy
```
Expected: URL pública `https://excusotron.<subdominio>.workers.dev`.

**Step 4: Checklist de producción**
- [ ] Genera en los 3 niveles con streaming real
- [ ] Copiar funciona · contador visible
- [ ] 11 generaciones rápidas → mensaje de huelga (429)
- [ ] (Sondeo de resistencia) `curl -N -X POST <url>/api/excusa -H "content-type: application/json" -d '{"nivel":3}'`
- [ ] Action de GitHub verde tras un push de prueba (`git commit --allow-empty -m "chore: smoke deploy" && git push`)
- [ ] README enlazado desde la web y repo enlazado desde LinkedIn ✅

**Step 5: Commit final**

```bash
git add wrangler.jsonc
git commit -m "chore: KV de producción y despliegue inicial"
git push
```

---

## Criterios de fin de MV1

- URL pública funcionando con las 4 validaciones del checklist.
- Tests verdes en CI y deploy automático desde `main`.
- 0 € de coste (Groq free + Workers free).
- README que se vende solo.

## Siguientes pasos (MV2, fuera de este plan)

Galería pública en D1 · compartir por `/e/{slug}` · fallback Workers AI · Turnstile · i18n ES/EN — ver diseño (`2026-10-19-excusotron-design.md` §2).
