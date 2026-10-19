# Excusotron 3000

[![CI](https://github.com/Ogires/excusotron/actions/workflows/ci.yml/badge.svg)](https://github.com/Ogires/excusotron/actions/workflows/ci.yml)

Generador de excusas épicas para no ir a trabajar, con streaming palabra a palabra y coste de producción: 0 €.

<p align="center"><img src="docs/demo.gif" alt="Demo del Excusotron"/></p>

## ¿Qué es?

Una unidad experimental española de los años 80 (según su placa) que genera excusas laborales a demanda. Eliges el nivel de verosimilitud —absurdo épico, sci-fi plausible o casi creíble— y la máquina compone la excusa en streaming, palabra a palabra. Y si la IA tiene un mal día, no pasa nada: hay un cargador de reserva con 21 excusas calibradas. La demo nunca se queda en blanco.

## Arquitectura

```
┌──────────┐   POST /api/excusa    ┌───────────────────────────────┐    HTTPS     ┌─────────────┐
│ Navegador│──────────────────────▶│       Cloudflare Worker       │─────────────▶│ Groq API    │
│          │◀──────────────────────│ · rate limit 10/min/IP (KV)   │   (stream)   │ (LLM, free) │
└──────────┘    SSE {"t":"..."}    │ · prompt con semilla aleatoria│◀─────────────└─────────────┘
     │                             │ · traduce el stream de Groq   │
     │   GET /  (assets estáticos) │ · plan B: pool de 21 excusas  │
     └────────────────────────────▶└───────────────────────────────┘
```

Decisiones de diseño:

- **Un único Worker** sirve el frontend estático (`public/`) y la API: sin servidor aparte, sin build del frontend, sin sorpresas en la factura.
- **Groq en free tier** para la inferencia: rápido, gratuito y con el modelo intercambiable en `wrangler.jsonc`.
- **Rate limit de 10 peticiones/min/IP** guardado en KV: suficiente para una demo y difícil de esquilmar. Al pasarse, la máquina se pone "en huelga" 60 segundos.
- **Pool de 21 excusas de reserva**: si Groq cae o la key caduca, el Worker sirve una excusa del cargador (marcada como `reserva` en el stream). La demo nunca se queda en blanco.
- **Tests sobre el runtime real de Workers** con `@cloudflare/vitest-pool-workers` (14 tests, sin mocks del entorno).
- **Coste total: 0 €** (Workers free tier + Groq free tier).

## Endpoints

| Método | Ruta          | Qué hace                                                            | Respuestas                                    |
| ------ | ------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `GET`  | `/api/stats`  | Total de excusas dispensadas desde el arranque                      | `200 {"total": 42}`                           |
| `POST` | `/api/excusa` | Genera una excusa en streaming para el `nivel` pedido               | `200` SSE · `400` nivel inválido · `429` huelga |

Cuerpo de `POST /api/excusa`:

```json
{ "nivel": 1 }
```

`nivel` admite `1` (absurdo épico), `2` (sci-fi plausible) o `3` (casi creíble). La respuesta `200` es un stream SSE con eventos `data: {"t":"fragmento"}` y cierre con `data: [DONE]`. El `429` avisa de cuántos segundos de huelga quedan.

## Desarrollo local

```bash
npm install
# crea .dev.vars con tu key de https://console.groq.com/keys
echo "GROQ_API_KEY=gsk_AQUI_TU_KEY" > .dev.vars
npm run dev    # http://localhost:8787
npm test       # 14 tests sobre el runtime real de Workers
```

## Despliegue

Resumen rápido con wrangler:

```bash
npx wrangler login
npx wrangler kv namespace create KV     # pega el id devuelto en wrangler.jsonc
npx wrangler secret put GROQ_API_KEY    # key de console.groq.com/keys
npm run deploy                          # https://excusotron.<subdominio>.workers.dev
```

La guía completa (CI/CD con GitHub Actions, secrets, checklist de producción) está en [`docs/plans/2026-10-19-excusotron-mv1.md`](docs/plans/2026-10-19-excusotron-mv1.md).

## Hecho con

Un Cloudflare Worker, Groq y muy poco juicio.

## Licencia

[MIT](LICENSE)
