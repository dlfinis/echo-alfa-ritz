import { describe, it, expect } from "vitest";
import { HttpInjector, InMemoryCookieJar } from "./injectors.js";
import { LOTE_ESTADO, INJECTION_RESULT } from "@echo-alfa-ritz/shared";
import type { Lote } from "@echo-alfa-ritz/shared";

// Mock fetch global estilo real (no fake perfecto): graba lo que se le pide y responde según un plan
function crearFetchMock(
  plan: Array<{
    status: number;
    body?: unknown;
    setCookies?: string[];
  }>,
): { fetch: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
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

describe("HttpInjector", () => {
  it("hace login, captura cookie y la envía en /api/lotes", async () => {
    const { fetch: mockFetch, calls } = crearFetchMock([
      {
        status: 200,
        setCookies: ["session=abc123; Path=/; HttpOnly"],
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
        },
      },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
    });

    const resultado = await injector.inyectar(loteBase);

    // Login primero, luego envío
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toMatch(/\/api\/users\/login$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: "test@example.com",
    });

    expect(calls[1].url).toMatch(/\/api\/lotes$/);
    const headers = new Headers(calls[1].init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("cookie")).toBe("session=abc123");
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      lote: "AB123456789",
      product: "Mini Ritz",
    });

    expect(resultado.status).toBe(INJECTION_RESULT.SUCCESS);
    expect(resultado.mensaje).toContain("lote-uuid");
  });

  it("detecta límite diario y marca como SKIPPED", async () => {
    const { fetch: mockFetch } = crearFetchMock([
      {
        status: 200,
        setCookies: ["session=xyz"],
      },
      {
        status: 200,
        body: { limite: true, total: 12, message: "limit" },
      },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
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
        },
      },
    ]);

    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
    });
    // Sin llamar login() manualmente
    await injector.inyectar(loteBase);
    expect(calls).toHaveLength(2);
  });

  it("FALLA sin hacer fetch si el formato del lote es inválido", async () => {
    const { fetch: mockFetch, calls } = crearFetchMock([]); // 0 respuestas planificadas
    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
    });

    const resultado = await injector.inyectar({
      id: "x",
      numero: "MAL",
      estado: LOTE_ESTADO.ACTIVO,
      producto: "Mini Ritz",
    });

    expect(resultado.status).toBe(INJECTION_RESULT.FAILED);
    expect(resultado.mensaje).toContain("Formato inválido");
    expect(calls).toHaveLength(0); // ninguna llamada HTTP
  });

  it("FALLA sin hacer fetch si el producto no es de la whitelist", async () => {
    const { fetch: mockFetch, calls } = crearFetchMock([]);
    const injector = new HttpInjector({
      email: "test@example.com",
      fetchImpl: mockFetch,
    });

    const resultado = await injector.inyectar({
      id: "x",
      numero: "AB123456789",
      estado: LOTE_ESTADO.ACTIVO,
      producto: "Producto Inventado" as never, // fuerza un valor fuera de la whitelist
    });

    expect(resultado.status).toBe(INJECTION_RESULT.FAILED);
    expect(resultado.mensaje).toContain("Producto inválido");
    expect(calls).toHaveLength(0);
  });
});

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
});