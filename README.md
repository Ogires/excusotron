# Excusotron 3000

[![CI](https://github.com/Ogires/excusotron/actions/workflows/ci.yml/badge.svg)](https://github.com/Ogires/excusotron/actions/workflows/ci.yml)

Generador de excusas épicas para no ir a trabajar, con streaming palabra a palabra y coste de producción: 0 €.

**▶ Demo en vivo: <https://excusotron.webninja.fyi>**

<p align="center"><img src="docs/demo.gif" alt="Demo del Excusotron"/></p>

## ¿Qué es?

Una unidad experimental española de los años 80 (según su placa) que genera excusas laborales a demanda. Eliges el nivel de verosimilitud —absurdo épico, sci-fi plausible o casi creíble— y la máquina compone la excusa en streaming, palabra a palabra. Y si la IA tiene un mal día, no pasa nada: hay un cargador de reserva con 21 excusas calibradas. La demo nunca se queda en blanco.

## Arquitectura

```
┌──────────┐   POST /api/excusa    ┌───────────────────────────────┐    HTTPS     ┌─────────────┐
│ Navegador│──────────────────────▶│       Cloudflare Worker       │─────────────▶│ Groq API    │
│          │◀──────────────────────│ · rate limit ~10/min/IP       │   (stream)   │ (LLM, free) │
└──────────┘    SSE {"t":"..."}    │ · prompt con semilla aleatoria│◀─────────────└─────────────┘
     │                             │ · traduce el stream de Groq   │
     │   GET /  (assets estáticos) │ · plan B: pool de 21 excusas  │
     └────────────────────────────▶└───────────────────────────────┘
```

Decisiones de diseño:

- **Un único Worker** sirve el frontend estático (`public/`) y la API: sin servidor aparte, sin build del frontend, sin sorpresas en la factura.
- **Groq en free tier** para la inferencia: rápido, gratuito y con el modelo intercambiable en `wrangler.jsonc`.
- **Rate limit de ~10 peticiones/min/IP** con el binding de Rate Limiting de Workers (aproximado por diseño, ver [Incidencias](#incidencias-y-decisiones)). Al pasarse, la máquina se pone "en huelga" hasta el siguiente minuto.
- **Pool de 21 excusas de reserva**: si Groq cae o la key caduca, el Worker sirve una excusa del cargador (marcada como `reserva` en el stream). La demo nunca se queda en blanco.
- **Tests sobre el runtime real de Workers** con `@cloudflare/vitest-plugin` (13 tests, sin mocks del entorno).
- **Coste total: 0 €** (Workers free tier + Groq free tier).

## Endpoints

| Método | Ruta          | Qué hace                                                            | Respuestas                                    |
| ------ | ------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `GET`  | `/api/stats`  | Total aproximado de excusas dispensadas (contador en KV)            | `200 {"total": 42}`                           |
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
npm run deploy                          # https://excusotron.webninja.fyi
```

La guía completa (CI/CD con GitHub Actions, secrets, checklist de producción) está en [`docs/plans/2026-10-19-excusotron-mv1.md`](docs/plans/2026-10-19-excusotron-mv1.md).

## Hecho con

Un Cloudflare Worker, Groq y muy poco juicio.

## Incidencias y decisiones

### 2026-10-21 · El rate limit no frenaba nada en producción

**Qué pasó.** El rate limit original guardaba un contador por IP en Cloudflare KV (`get` → `+1` → `put`). Al verificarlo en producción, 40 peticiones seguidas desde la misma IP pasaron todas, y en KV quedaron contadores de **6 y 5**.

**Por qué.** KV no es atómico y cachea las lecturas, incluso las de claves que aún no existen. Peticiones casi simultáneas leen el mismo valor viejo y se pisan los incrementos. Los tests no lo detectaban porque el KV local de miniflare sí es consistente: el mock reproducía nuestra suposición, no la realidad.

**Qué se hizo.**
1. Un primer arreglo con ventana fija (clave `rl:{ip}:{nº de ventana}`) corregía el TTL que se renovaba, pero seguía apoyado en KV y tampoco frenaba.
2. Solución actual: el [binding de Rate Limiting de Workers](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) (`ratelimits` en `wrangler.jsonc`), gratuito.

**Lo que se asume.** El binding es *aproximado por diseño*: cuenta por máquina y se sincroniza de forma asíncrona. Medido en producción: con límite 10, el primer 429 llegó en la petición 28. Frena el abuso masivo, no cuenta con exactitud. Aquí basta, porque un abuso solo agota antes la cuota de Groq, y entonces la demo sirve el pool de reserva. Para un contador exacto, la herramienta correcta es un Durable Object.

### `/api/stats` es aproximado

El contador de excusas sigue en KV y por la misma razón pierde incrementos cuando hay peticiones simultáneas. Es una cifra decorativa, así que se acepta.

## Licencia

[MIT](LICENSE)
