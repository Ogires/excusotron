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
