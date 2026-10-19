// tests/setup.ts — outbound fetch real por defecto; cada test decide cuándo mockear
import { fetchMock } from "cloudflare:test";
fetchMock.dontMock();
