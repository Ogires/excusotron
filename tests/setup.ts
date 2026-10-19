// tests/setup.ts — con @cloudflare/vitest-plugin el outbound fetch es real por
// defecto: fetchMock ya no existe (Cloudflare recomienda @msw/cloudflare para
// mockear peticiones salientes). Este setup queda como punto de enganche para
// configuración global de tests futuros.
