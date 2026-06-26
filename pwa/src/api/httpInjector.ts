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
    // Reintentar hasta 3 veces si promoritz tira 5xx (rate limit intermitente).
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.fetchImpl(`${this.baseUrl}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: this.email }),
      });

      if (res.status >= 200 && res.status < 300) {
        // CRÍTICO: limpiar cookies viejas ANTES de capturar las nuevas.
        //
        // Si el jar ya tiene cookies (de localStorage o un login previo
        // expirado), hasSession() devolvería true y el body fallback se
        // saltaría — el jar quedaría con cookies viejas y el primer
        // inyectar fallaría con 307 (sesión expirada) → Worker 401.
        this.jar.clear();

        // Camino 1: leer cookies del response (vía x-set-cookie custom header
        // del Worker — depende de Access-Control-Expose-Headers).
        this.jar.setFromResponse(res.headers);

        // Camino 2 (fallback robusto): si por algún motivo las cookies no
        // llegaron vía headers, parsear el token directamente del body JSON.
if (!this.jar.hasSession()) {
        try {
          const body = (await res.clone().json()) as {
            token?: string;
            id?: string;
            email?: string;
            name?: string;
            lastname?: string;
          };
          console.log("[login] response body keys:", Object.keys(body));
          console.log("[login] token starts with:", (body.token ?? "").slice(0, 30));
          console.log("[login] body.id:", body.id);
          if (body.token) {
            this.jar.cookies["token"] = body.token;
            this.jar.cookies["user"] = encodeURIComponent(
              JSON.stringify({
                id: body.id,
                name: body.name,
                lastname: body.lastname,
                email: body.email,
              }),
            );
            console.log("[login] synthesized cookies:", Object.keys(this.jar.cookies));
            console.log("[login] cookies.token len:", this.jar.cookies["token"]?.length);
          } else {
            console.log("[login] NO TOKEN in body!");
          }
        } catch (e) {
          console.log("[login] body parse failed:", String(e));
        }
      }

        return this.jar.hasSession();
      }

      // Si es 5xx, esperar un poco y reintentar. Si es 4xx (no 429), abortar.
      if (res.status >= 500 && res.status < 600 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      return false;
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
      console.log("[inyectar] jar vacío, llamando login()");
      const logged = await this.login();
      if (!logged) return this.fail(lote, "Sin sesión activa y login falló");
      console.log("[inyectar] login() OK, jar tiene:", Object.keys(this.jar.cookies));
    } else {
      console.log("[inyectar] jar ya tiene sesión, cookies:", Object.keys(this.jar.cookies));
    }

    let res = await this.postLote(lote);
    console.log(`[inyectar] postLote inicial → HTTP ${res.status}, cookie enviado: ${this.jar.toCookieHeader().slice(0, 80)}...`);

    // Auto-recovery robusto:
    //   - 401 o 3xx → sesión expirada, relogin + retry una vez
    //   - 5xx → promoritz/cloudflare intermitente, login fresh + retry
    //   - 4xx (no 401) → error definitivo del server, no reintentar
    const needsRelogin =
      res.status === 401 ||
      (res.status >= 300 && res.status < 400) ||
      (res.status >= 500 && res.status < 600);

    if (needsRelogin) {
      console.log(`[inyectar] needsRelogin=true, llamando login() para refrescar`);
      const reLogged = await this.login();
      if (!reLogged) {
        console.log(`[inyectar] relogin falló, abortando`);
        return this.fail(lote, `Sesión o server caído (HTTP ${res.status}) y relogin falló`);
      }
      console.log("[inyectar] relogin OK, jar después:", Object.keys(this.jar.cookies));
      res = await this.postLote(lote);
      console.log(`[inyectar] postLote retry → HTTP ${res.status}, cookie enviado: ${this.jar.toCookieHeader().slice(0, 80)}...`);
    }

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

    console.log(`[inyectar] postLote final → HTTP ${res.status}, mensaje del server:`, await res.clone().text().catch(() => "(no body)"));
    return this.fail(lote, `HTTP ${res.status}`);
  }

  private async postLote(lote: Lote): Promise<Response> {
    // IMPORTANTE: las cookies (token, user) están en InMemoryCookieJar
    // (variables JS), NO en document.cookie. Si las mandamos en el
    // header Cookie, el browser las REEMPLAZA con las cookies del origin
    // (CF_AppSession, CF_Authorization de Cloudflare Access). Por eso
    // mandamos token y user como CUSTOM HEADERS — el Worker los extrae y
    // construye la Cookie header para promoritz.
    return this.fetchImpl(`${this.baseUrl}/api/lotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Promoritz-Token": this.jar.cookies["token"] ?? "",
        "X-Promoritz-User": this.jar.cookies["user"] ?? "",
      },
      credentials: "include",
      body: JSON.stringify({ lote: lote.numero, product: lote.producto }),
    });
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