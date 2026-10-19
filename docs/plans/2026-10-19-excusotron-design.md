# Diseño: Excusotron 3000
**Fecha:** 2026-10-19 · **Estado:** aprobado para planificación
**Contexto:** idea #1 del backlog (`../../ideas-brainstorming.md`). Primera app de "la factoría": valida la arquitectura común (Worker + assets + IA gratis + rate limit) que reutilizarán las demás.

## 1. Visión

Generador de excusas épicas para no ir a trabajar. El usuario elige el **nivel de verosimilitud** y recibe una excusa única, con efecto streaming tipo chat. Suficientemente chorra para compartirse, suficientemente bien hecha para enseñarla en una entrevista.

## 2. Alcance

**MV1 (una tarde 🟢)**
- UI de una página: selector de nivel (1: Absurdo épico / 2: Ciencia-ficción plausible / 3: Casi creíble), botón generar, excusa con streaming SSE, botón copiar, contador global de excusas generadas.
- Rate limit por IP (KV): 10 generaciones/minuto.

**MV2 (un finde 🟡)**
- Galería pública "Top excusas" (D1): el usuario puede publicar la última generada (opt-in).
- Compartir por URL corta (`/e/{slug}`) que muestra la excusa en una tarjeta bonita.
- Fallback automático Groq → Workers AI si la cuota de Groq falla.
- Turnstile opcional anti-abuso.
- i18n ES/EN.

**Fuera de alcance:** usuarios, login, app móvil, historial por usuario.

## 3. Arquitectura

Un único **Cloudflare Worker con assets estáticos** (un solo proyecto, un solo deploy, un solo `*.workers.dev`):

```
┌──────────────── Browser ────────────────┐
│  index.html + app.js (vanilla, sin build│
│  o build mínimo)                        │
└──────┬────────────────────▲─────────────┘
   POST /api/excusa     SSE stream
       │ {nivel: 1|2|3}     │
┌──────▼────────────────────┴─────────────┐
│  Cloudflare Worker                      │
│  · rate limit por IP (KV: rl:{ip})      │
│  · contador global (KV: stats:total)    │
│  · prompt builder (nivel + semilla      │
│    aleatoria de 3 elementos)            │
│  · fetch a Groq (stream) → reemite SSE  │
│  · [MV2] fallback Workers AI, D1 galería│
└──────┬──────────────────────────────────┘
       │ API compatible OpenAI
   GROQ API (llama-3.3-70b o similar, free tier)
```

**Decisiones clave:**
- **Vanilla JS sin framework en MV1**: cero build, deploy instantáneo, el repo se entiende de un vistazo (esto ES la demo).
- **Groq como proveedor primario** (1.000 req/día gratis, rapidísimo) con `GROQ_API_KEY` como secret. Fallback Workers AI en MV2.
- **Semilla de variedad**: el prompt incluye 3 elementos aleatorios (animal, objeto, evento) para que dos generaciones seguidas no se parezcan.
- **El 429 propio con gracia**: si te pasas de rate limit, la UI muestra "El Excusotron está en huelga 60 segundos". Nada de errores crudos.

## 4. Modelo de datos

- **KV (MV1):** `rl:{ip}` → contador con TTL 60s · `stats:total` → contador global.
- **D1 (MV2):** tabla `excusas (id TEXT PK, slug TEXT UNIQUE, texto TEXT, nivel INT, created_at INT)`.

## 5. Diseño del prompt

System (esquema): "Eres el Excusotron 3000. Generas UNA excusa en español para no ir a trabajar. Nivel {1|2|3}: 1 = absurdo épico con {animal}, {objeto} y {evento}; 2 = ciencia-ficción plausible; 3 = creíble y aburrida. Máximo 80 palabras. Sin introducción ni cerradura: solo la excusa."
Temperatura alta (0.9-1.0), max_tokens ~200. La semilla aleatoria evita repeticiones y hace la demo rejugable.

## 6. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Rate limit IP (429) | Respuesta simpática + countdown en UI |
| Groq caído / sin cuota (429/5xx) | MV1: pool de ~20 excusas pregeneradas servidas al azar (la demo NUNCA se queda en blanco). MV2: fallback Workers AI → luego pool |
| `nivel` inválido | 400 con mensaje claro |
| Cliente sin JS / falla fetch | Estado vacío elegante con botón reintentar |

## 7. Estrategia de tests

- **Unitarios (Vitest + `@cloudflare/vitest-pool-workers`):** rate limiter (TTL, límites), prompt builder (nivel → texto esperado, semilla presente), validación de request, contador global. Groq mockeado (MSW o fetch stub).
- **Integración:** handler `/api/excusa` completo con KV real de test (miniflare) y Groq mockeado → afirma SSE con formato correcto y cabeceras.
- **E2E humo (Playwright, opcional):** carga → click → aparece texto → botón copiar funcional.
- Regla práctica: todo lo que sea lógica pura (limiter, prompts, slugs) tiene test; el CSS no.

## 8. Despliegue y CI/CD

- Repo GitHub público `sergio/excusotron` (README: GIF de demo, diagrama, badges, "arquitectura de 0 €" linkando los informes).
- `wrangler.jsonc` con `assets` (frontend) + binding KV (+ D1 en MV2).
- Secret: `wrangler secret put GROQ_API_KEY`.
- **GitHub Actions (gratis):** PR → `pnpm test` + lint. Push a `main` → deploy con `cloudflare/wrangler-action`.
- URL inicial: `excusotron.<subdominio>.workers.dev`. Dominio propio: opcional después.

## 9. Criterios de éxito

- Primera palabra visible en < 1 s (streaming), excusa completa P95 < 5 s.
- Coste: 0 €. Un usuario no puede gastar más de 10 generaciones/min.
- El README + demo se explican solos ante un reclutador en 30 segundos.
