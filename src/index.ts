import { checkRateLimit } from "./rate-limit";
import { buildPrompt, validarNivel } from "./prompt";
import { pedirExcusaAGroq } from "./groq";
import { excusaDeReserva } from "./pool";

type Env = {
  KV: KVNamespace;
  RL: RateLimit;
  GROQ_API_KEY: string;
  GROQ_MODEL: string;
};

const encoder = new TextEncoder();
const CABECERAS_SSE = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/excusa" && request.method === "POST") {
      return manejarExcusa(request, env, ctx);
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

async function manejarExcusa(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const rl = await checkRateLimit(env.RL, ip);
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

  // waitUntil garantiza que el KV write sobreviva al cierre del stream de la respuesta
  ctx.waitUntil(incrementarContador(env));

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
