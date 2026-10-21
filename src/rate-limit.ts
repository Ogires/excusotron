// src/rate-limit.ts
export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

// Ventana fija por minuto (clave con el nº de ventana): el contador anterior
// renovaba el TTL en cada petición y con tráfico continuo nunca se reiniciaba.
// KV es eventualmente consistente: para una demo con límite holgado es suficiente
export async function checkRateLimit(
  kv: KVNamespace,
  ip: string,
  limit = 10,
  windowSec = 60,
  ahoraMs = Date.now()
): Promise<RateResult> {
  const segundos = Math.floor(ahoraMs / 1000);
  const key = `rl:${ip}:${Math.floor(segundos / windowSec)}`;
  const retryAfter = windowSec - (segundos % windowSec);
  const actual = parseInt((await kv.get(key)) ?? "0", 10);
  if (actual >= limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }
  // TTL mínimo de KV = 60 s; dos ventanas de margen
  await kv.put(key, String(actual + 1), { expirationTtl: Math.max(60, windowSec * 2) });
  return { allowed: true, remaining: limit - actual - 1, retryAfter: 0 };
}
