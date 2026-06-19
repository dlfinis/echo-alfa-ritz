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
import type { CookieJar } from "./cookieJar.js";

/**
 * URL base de la API de promoritz.
 *
 * - DEV: usa el proxy de Vite (`/api/promoritz/*` → `https://promoritz.com/ec/*`)
 *        para evitar CORS en el browser.
 * - PROD (Cloudflare Pages): el Worker expone la misma ruta, o se cambia
 *        al endpoint del worker.
 *
 * El HttpInjector recibe `baseUrl` opcional en su config por si querés
 * overridear por entorno.
 */
export const DEFAULT_BASE_URL = "/api/promoritz";

export interface HttpInjectorConfig {
  baseUrl?: string;
  email: string;
  fetchImpl?: typeof fetch;
  cookieJar: CookieJar;
}

/**
 * Inyector HTTP directo contra promoritz.com/ec.
 *
 * Discovery (website-info.md):
 * - Login: POST /ec/api/users/login { email } → Set-Cookie
 * - Envío: POST /ec/api/lotes { lote, product }
 *   · 200 + JSON → éxito
 *   · { limite: true, total: 12, message: "limit" } → SKIPPED
 *   · 400 → FAILED con mensaje del servidor
 *
 * Validación temprana de formato (2 letras + 9 dígitos) y producto
 * (whitelist) ANTES de gastar un roundtrip HTTP.
 */
export class HttpInjector implements IInjectionStrategy {
  readonly nombre = "http";

  private readonly baseUrl: string;
  private readonly email: string;
  private readonly fetchImpl: typeof fetch;
  private readonly jar: CookieJar;

  constructor(config: HttpInjectorConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.email = config.email;
    // IMPORTANTE: fetch debe mantener el this=globalThis; si se destructura
    // y se invoca sin contexto, tira "Illegal invocation".
    this.fetchImpl = (config.fetchImpl ?? fetch).bind(globalThis);
    this.jar = config.cookieJar;
  }

  /** Ejecuta login y guarda cookies. */
  async login(): Promise<boolean> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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
      if (!logged) return this.fail(lote, "Sin sesión activa y login falló");
    }

    const res = await this.fetchImpl(`${this.baseUrl}/api/lotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: this.jar.toCookieHeader(),
      },
      credentials: "include",
      body: JSON.stringify({ lote: lote.numero, product: lote.producto }),
    });

    this.jar.setFromResponse(res.headers);

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
        mensaje: `Inyectado (id: ${(body as LoteEnviado).id})`,
        timestamp: new Date().toISOString(),
      };
    }

    if (res.status === 400) {
      return this.fail(lote, `Validación rechazada (400): ${await res.text()}`);
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