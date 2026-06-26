import { describe, it, expect } from "vitest";
import {
  HttpInjector,
  InMemoryCookieJar,
  ProfileReader,
} from "./index.js";
import {
  LOTE_ESTADO,
  INJECTION_RESULT,
  type Lote,
  type LimiteAlcanzado,
  type LoteEnviado,
} from "@echo-alfa-ritz/shared";

// ── Test fixtures ──

function crearFetchMock(
  plan: Array<{
    status: number;
    body?: unknown;
    bodyText?: string;
    setCookies?: string[];
  }>,
): {
  fetch: typeof fetch;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let idx = 0;

  const mockFetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const step = plan[idx++] ?? { status: 500, body: { error: "sin más pasos" } };

    const headers = new Headers();
    if (step.setCookies) {
      for (const c of step.setCookies) headers.append("set-cookie", c);
    }

    if (step.bodyText !== undefined) {
      headers.set("content-type", "text/html");
      return new Response(step.bodyText, { status: step.status, headers });
    }

    headers.set("content-type", "application/json");
    return new Response(
      step.body !== undefined ? JSON.stringify(step.body) : null,
      { status: step.status, headers },
    );
  }) as unknown as typeof fetch;

  return { fetch: mockFetch, calls };
}

const loteBase: Lote = {
  id: "1",
  numero: "AB123456789",
  estado: LOTE_ESTADO.ACTIVO,
  producto: "Mini Ritz",
};

// ── InMemoryCookieJar ──

describe("InMemoryCookieJar", () => {
  it("parsea Set-Cookie y los expone en toCookieHeader", () => {
    const jar = new InMemoryCookieJar();
    const headers = new Headers();
    headers.append("set-cookie", "session=abc; Path=/; HttpOnly");
    headers.append("set-cookie", "csrf=token; Path=/");

    jar.setFromResponse(headers);
    expect(jar.cookies).toEqual({ session: "abc", csrf: "token" });
    expect(jar.toCookieHeader()).toBe("session=abc; csrf=token");
    expect(jar.hasSession()).toBe(true);
  });

  it("jar vacío no tiene sesión", () => {
    const jar = new InMemoryCookieJar();
    expect(jar.hasSession()).toBe(false);
  });

  it("clear() resetea las cookies", () => {
    const jar = new InMemoryCookieJar();
    jar.setFromResponse(new Headers({ "set-cookie": "a=1" }));
    jar.clear();
    expect(jar.hasSession()).toBe(false);
  });
});

// ── HttpInjector ──

describe("HttpInjector", () => {
  it("hace login, captura cookie y la envía en /api/lotes", async () => {
    const { fetch: mockFetch, calls } = crearFetchMock([
      {
        status: 200,
        setCookies: ["token=abc123; Path=/; HttpOnly"],
        body: { ok: true },
      },
      {
        status: 200,
        body: {
          brand: "Ritz",
          product: "Mini Ritz",
          lote: "AB123456789",
          username: "Alfa Beta",
          userId: "uuid",
          whatsapp: true,
          isReemplazo: false,
          referredBy: null,
          id: "lote-uuid",
          createdAt: new Date().toISOString(),
        } satisfies LoteEnviado,
      },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const resultado = await injector.inyectar(loteBase);

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toMatch(/\/api\/users\/login$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: "test@example.com",
    });

    expect(calls[1].url).toMatch(/\/api\/lotes$/);
    const headers = new Headers(calls[1].init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-promoritz-token")).toBe("abc123");
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      lote: "AB123456789",
      product: "Mini Ritz",
    });

    expect(resultado.status).toBe(INJECTION_RESULT.SUCCESS);
    expect(resultado.mensaje).toContain("lote-uuid");
  });

  it("detecta límite diario y marca como SKIPPED", async () => {
    const { fetch: mockFetch } = crearFetchMock([
      { status: 200, setCookies: ["session=xyz"] },
      {
        status: 200,
        body: { limite: true, total: 12, message: "limit" } satisfies LimiteAlcanzado,
      },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const resultado = await injector.inyectar(loteBase);
    expect(resultado.status).toBe(INJECTION_RESULT.SKIPPED);
    expect(resultado.mensaje).toContain("12");
  });

  it("marca FAILED ante respuesta 400", async () => {
    const { fetch: mockFetch } = crearFetchMock([
      { status: 200, setCookies: ["session=ok"] },
      { status: 400, body: { error: "formato inválido" } },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const resultado = await injector.inyectar(loteBase);
    expect(resultado.status).toBe(INJECTION_RESULT.FAILED);
    expect(resultado.mensaje).toContain("400");
  });

  it("renueva sesión automáticamente si el jar está vacío", async () => {
    const { fetch: mockFetch, calls } = crearFetchMock([
      { status: 200, setCookies: ["session=renovada"] },
      {
        status: 200,
        body: {
          brand: "Ritz",
          product: "Mini Ritz",
          lote: "AB123456789",
          username: "Alfa Beta",
          userId: "uuid",
          whatsapp: true,
          isReemplazo: false,
          referredBy: null,
          id: "x",
          createdAt: "2026-06-18T00:00:00.000Z",
        } satisfies LoteEnviado,
      },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });
    await injector.inyectar(loteBase);
    expect(calls).toHaveLength(2);
  });

  it("FALLA sin hacer fetch si el formato del lote es inválido", async () => {
    const { fetch: mockFetch, calls } = crearFetchMock([]);
    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const resultado = await injector.inyectar({
      id: "x",
      numero: "MAL",
      estado: LOTE_ESTADO.ACTIVO,
      producto: "Mini Ritz",
    });

    expect(resultado.status).toBe(INJECTION_RESULT.FAILED);
    expect(resultado.mensaje).toContain("Formato inválido");
    expect(calls).toHaveLength(0);
  });

  it("FALLA sin hacer fetch si el producto no es de la whitelist", async () => {
    const { fetch: mockFetch, calls } = crearFetchMock([]);
    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const resultado = await injector.inyectar({
      id: "x",
      numero: "AB123456789",
      estado: LOTE_ESTADO.ACTIVO,
      producto: "Producto Inventado" as never,
    });

    expect(resultado.status).toBe(INJECTION_RESULT.FAILED);
    expect(resultado.mensaje).toContain("Producto inválido");
    expect(calls).toHaveLength(0);
  });

  it("hace auto-relogin y reintenta cuando el server responde 401 (sesión expirada)", async () => {
    // Plan: 1) login OK → 2) inyectar 401 (sesión expirada, mapeado por el
    // Worker desde 307 de promoritz) → 3) re-login → 4) inyectar 200 OK
    const { fetch: mockFetch, calls } = crearFetchMock([
      { status: 200, setCookies: ["token=viejoperoinvalido"] }, // 1) login
      { status: 401, body: { error: "session_expired" } },     // 2) inyectar
      { status: 200, setCookies: ["token=fresca"] },            // 3) re-login
      {                                                      // 4) inyectar retry
        status: 200,
        body: {
          brand: "Ritz",
          product: "Mini Ritz",
          lote: "AB123456789",
          username: "Alfa Beta",
          userId: "uuid",
          whatsapp: true,
          isReemplazo: false,
          referredBy: null,
          id: "lote-post-relogin",
          createdAt: new Date().toISOString(),
        } satisfies LoteEnviado,
      },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const resultado = await injector.inyectar(loteBase);

    expect(calls).toHaveLength(4);
    expect(calls[0].url).toMatch(/\/api\/users\/login$/);
    expect(calls[1].url).toMatch(/\/api\/lotes$/);          // primer inyectar (401)
    expect(calls[2].url).toMatch(/\/api\/users\/login$/);  // re-login
    expect(calls[3].url).toMatch(/\/api\/lotes$/);          // inyectar retry (200)
    // El segundo inyectar va con la cookie fresca
    const headersRetry = new Headers(calls[3].init.headers);
    expect(headersRetry.get("x-promoritz-token")).toBe("fresca");
    expect(resultado.status).toBe(INJECTION_RESULT.SUCCESS);
    expect(resultado.mensaje).toContain("lote-post-relogin");
  });

  it("marca FAILED si el re-login no logra renovar la sesión (5xx reintenta 3 veces)", async () => {
    const { fetch: mockFetch, calls } = crearFetchMock([
      { status: 200, setCookies: ["token=viejo"] },
      { status: 401, body: { error: "session_expired" } },
      // Login reintenta 3 veces ante 5xx (delay backoff 800ms, 1600ms)
      { status: 500, body: { error: "down" } },
      { status: 500, body: { error: "down" } },
      { status: 500, body: { error: "down" } },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const resultado = await injector.inyectar(loteBase);
    // 1: login inicial, 2: postLote, 3-5: tres reintentos de relogin
    expect(calls).toHaveLength(5);
    expect(resultado.status).toBe(INJECTION_RESULT.FAILED);
    expect(resultado.mensaje).toContain("relogin falló");
  });

  it("limpia cookies stale antes de capturar las nuevas (evita 401 con sesión expirada)", async () => {
    // Simula: el jar ya tiene cookies viejas (de localStorage o login
    // previo expirado). Sin el clear(), hasSession() devolvería true y
    // el body fallback se saltaría → el primer inyectar fallaría con
    // 307 → Worker 401 porque promoritz recibe las cookies viejas.
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/users/login")) {
        return new Response(
          JSON.stringify({
            id: "fresh-id",
            name: "Fresh",
            lastname: "User",
            email: "fresh@example.com",
            token: "fresh-jwt",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // inyectar recibe cookie con el token FRESCO, no el viejo
      return new Response(
        JSON.stringify({
          brand: "Ritz",
          product: "Mini Ritz",
          lote: "AB123456789",
          username: "Fresh User",
          userId: "fresh-id",
          whatsapp: true,
          isReemplazo: false,
          referredBy: null,
          id: "lote-fresh",
          createdAt: new Date().toISOString(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const jar = new InMemoryCookieJar();
    jar.cookies["token"] = "stale-jwt-expired";
    jar.cookies["user"] = "stale-user-data";

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: jar,
    });

    await injector.login();
    expect(jar.cookies["token"]).toBe("fresh-jwt"); // No "stale-jwt-expired"
  });

  it("fallback: parsea token del body JSON si los headers no traen cookies", async () => {
    // Simula un browser que NO expone x-set-cookie (CORS sin
    // Access-Control-Expose-Headers). El response no tiene set-cookie ni
    // x-set-cookie, solo el body con { token, id, ... }.
    const mockFetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/users/login")) {
        return new Response(
          JSON.stringify({
            id: "user-uuid",
            name: "Alfa",
            lastname: "Beta",
            email: "test@example.com",
            token: "jwt-from-body",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // /api/lotes — debería recibir el token del body via Cookie header
      return new Response(
        JSON.stringify({
          brand: "Ritz",
          product: "Mini Ritz",
          lote: "AB123456789",
          username: "Alfa Beta",
          userId: "uuid",
          whatsapp: true,
          isReemplazo: false,
          referredBy: null,
          id: "x",
          createdAt: new Date().toISOString(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const resultado = await injector.inyectar(loteBase);
    expect(resultado.status).toBe(INJECTION_RESULT.SUCCESS);
  });
});

// ── ProfileReader ──

describe("ProfileReader", () => {
  it("parsea el contador de lotes del HTML SSR", async () => {
    const html = `
      <div class="text-primary bg-[#F5F5F5] w-full h-fit py-3 font-bold flex items-center justify-center text-center text-2xl">7</div>
      <p class="font-bold text-primary">Nombres:</p>
      <p class="border-b pb-3 border-primary">Alfa</p>
      <p class="pt-4 font-bold text-primary">Apellidos:</p>
      <p class="border-b pb-3 border-primary">Beta</p>
      <p class="pt-4 font-bold text-primary">Cédula</p>
      <p class="border-b pb-3 border-primary">1805060075</p>
    `;
    const { fetch: mockFetch } = crearFetchMock([{ status: 200, bodyText: html }]);

    const reader = new ProfileReader({
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });

    const snap = await reader.leer();
    expect(snap.lotesHoy).toBe(7);
    expect(snap.limite).toBe(12);
    expect(snap.nombres).toBe("Alfa");
    expect(snap.apellidos).toBe("Beta");
    expect(snap.cedula).toBe("1805060075");
  });

  it("devuelve 0 si el HTML no contiene el contador", async () => {
    const { fetch: mockFetch } = crearFetchMock([
      { status: 200, bodyText: "<html><body>sin contador</body></html>" },
    ]);
    const reader = new ProfileReader({
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });
    const snap = await reader.leer();
    expect(snap.lotesHoy).toBe(0);
  });

  it("lanza error si la respuesta no es OK", async () => {
    const { fetch: mockFetch } = crearFetchMock([{ status: 401 }]);
    const reader = new ProfileReader({
      fetchImpl: mockFetch,
      cookieJar: new InMemoryCookieJar(),
    });
    await expect(reader.leer()).rejects.toThrow(/401/);
  });
});