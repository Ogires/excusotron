// src/rate-limit.ts
export interface RateResult {
  allowed: boolean;
  retryAfter: number;
}

// Binding de Rate Limiting de Workers (límite y periodo en wrangler.jsonc). El contador
// anterior en KV no frenaba nada en producción: KV no es atómico y cachea las lecturas
// (40 peticiones seguidas dejaban el contador en 6). retryAfter es una estimación:
// el binding no informa de cuándo se libera.
export async function checkRateLimit(
  limiter: RateLimit,
  ip: string,
  windowSec = 60,
  ahoraMs = Date.now()
): Promise<RateResult> {
  const { success } = await limiter.limit({ key: ip });
  if (success) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: windowSec - (Math.floor(ahoraMs / 1000) % windowSec) };
}
