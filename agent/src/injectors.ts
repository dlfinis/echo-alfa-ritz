import type {
  IInjectionStrategy,
  InjectionResult,
  Lote,
  LimiteAlcanzado,
  LoteEnviado,
} from "@echo-alfa-ritz/shared";
import {
  INJECTION_RESULT,
  esProductoValido,
  esFormatoLoteValido,
} from "@echo-alfa-ritz/shared";

const BASE_URL = "https://promoritz.com/ec";

export interface HttpInjectorConfig {
  baseUrl?: string;
  email: string;
  fetchImpl?: typeof fetch;
  /** Inyecta cookies de sesión (producidas por login()) */
  cookieJar?: CookieJar;
}

export interface CookieJar {
  cookies: Record<string, string>;
  setFromResponse(headers: Headers): void;
  toCookieHeader(): string;
  hasSession(): boolean;
}

export class InMemoryCookieJar implements CookieJar {
  cookies: Record<string, string> = {};

  setFromResponse(headers: Headers) {
    // Node fetch expone set-cookie como varios valores; Headers#getSetCookie existe en Node 20+
    const setCookies =
      typeof (headers as unknown as { getSetCookie?: () => string[] })
        .getSetCookie === "function"
        ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : (headers.get("set-cookie") ?? "")
            .split(/,(?=[^ ])/)
            .filter(Boolean);

    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const [name, ...rest] = pair.split("=");
      if (name && rest.length) {
        this.cookies[name.trim()] = rest.join("=").trim();
      }
    }
  }

  toCookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  hasSession(): boolean {
    // El nombre exacto de la cookie se obtiene en login(); heurística: cualquiera presente
    return Object.keys(this.cookies).length > 0;
  }
}

/**
 * Inyector HTTP real contra promoritz.com/ec.
 *
 * Basado en el discovery (website-info.md):
 * - Login: POST /ec/api/users/login { email } → Set-Cookie
 * - Envío: POST /ec/api/lotes { lote, product }
 *   · 200 + JSON → éxito
 *   · { limite: true, total: 12, message: "limit" } → corte
 *   · 400 → error de validación
 */
export class HttpInjector implements IInjectionStrategy {
  readonly nombre = "http";

  private readonly baseUrl: string;
  private readonly email: string;
  private readonly fetchImpl: typeof fetch;
  private readonly jar: CookieJar;

  constructor(config: HttpInjectorConfig) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.email = config.email;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.jar = config.cookieJar ?? new InMemoryCookieJar();
  }

  /** Ejecuta el login y guarda cookies. Devuelve true si la API respondió 200. */
  async login(): Promise<boolean> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email }),
    });
    if (res.status >= 200 && res.status < 300) {
      this.jar.setFromResponse(res.headers);
      return this.jar.hasSession();
    }
    return false;
  }

  async inyectar(lote: Lote): Promise<InjectionResult> {
    if (!esFormatoLoteValido(lote.numero)) {
      return this.fail(
        lote,
        `Formato inválido: "${lote.numero}" debe ser 2 letras + 9 dígitos`,
      );
    }
    if (!lote.producto || !esProductoValido(lote.producto)) {
      return this.fail(
        lote,
        `Producto inválido o ausente: "${lote.producto ?? ""}"`,
      );
    }

    if (!this.jar.hasSession()) {
      const logged = await this.login();
      if (!logged) {
        return this.fail(lote, "Sin sesión activa y login falló");
      }
    }

    const payload = {
      lote: lote.numero,
      product: lote.producto,
    };

    const res = await this.fetchImpl(`${this.baseUrl}/api/lotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: this.jar.toCookieHeader(),
      },
      body: JSON.stringify(payload),
    });

    // Actualizar cookies por si rotaron
    this.jar.setFromResponse(res.headers);

    // Detección de límite (200 OK con cuerpo { limite: true })
    if (res.ok) {
      const body = (await res.json()) as LoteEnviado | LimiteAlcanzado;
      if ("limite" in body && body.limite === true) {
        return {
          loteId: lote.id,
          numero: lote.numero,
          status: INJECTION_RESULT.SKIPPED,
          mensaje: `Límite diario alcanzado (${(body as LimiteAlcanzado).total})`,
          timestamp: new Date().toISOString(),
        };
      }
      return {
        loteId: lote.id,
        numero: lote.numero,
        status: INJECTION_RESULT.SUCCESS,
        mensaje: `Inyectado en promoritz (id: ${(body as LoteEnviado).id})`,
        timestamp: new Date().toISOString(),
      };
    }

    if (res.status === 400) {
      const text = await res.text();
      return this.fail(lote, `Validación rechazada (400): ${text}`);
    }

    return this.fail(lote, `HTTP ${res.status}`);
  }

  async validarSesion(): Promise<boolean> {
    return this.jar.hasSession();
  }

  async renovarSesion(): Promise<boolean> {
    return this.login();
  }

  private fail(lote: Lote, mensaje: string): InjectionResult {
    return {
      loteId: lote.id,
      numero: lote.numero,
      status: INJECTION_RESULT.FAILED,
      mensaje,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Inyector que simula la plataforma para desarrollo y testing.
 */
export class MockInjector implements IInjectionStrategy {
  readonly nombre = "mock";

  async inyectar(lote: Lote): Promise<InjectionResult> {
    return {
      loteId: lote.id,
      numero: lote.numero,
      status: INJECTION_RESULT.SUCCESS,
      mensaje: `[MOCK] Lote ${lote.numero} inyectado exitosamente`,
      timestamp: new Date().toISOString(),
    };
  }

  async validarSesion(): Promise<boolean> {
    return true;
  }

  async renovarSesion(): Promise<boolean> {
    return true;
  }
}