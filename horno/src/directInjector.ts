import type {
  IInjectionStrategy,
  InjectionResult,
  Lote,
  LoteEnviado,
  LimiteAlcanzado,
} from "@echo-alfa-ritz/shared";
import {
  INJECTION_RESULT,
  esProductoValido,
  esFormatoLoteValido,
} from "@echo-alfa-ritz/shared";

const BASE_URL = "https://promoritz.com";

export class DirectInjector implements IInjectionStrategy {
  readonly nombre = "http";
  private cookies: Record<string, string> = {};
  private readonly email: string;

  constructor(config: { email: string }) {
    this.email = config.email;
  }

  async login(): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${BASE_URL}/ec/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: this.email }),
        redirect: "manual",
      });

      if (res.ok) {
        this.cookies = {};
        const sc = res.headers.get("set-cookie");
        if (sc) this.parseSetCookie(sc);
        return this.hasSession();
      }

      if (res.status >= 500 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      return false;
    }
    return false;
  }

  private parseSetCookie(sc: string): void {
    for (const part of sc.split(",")) {
      const [pair] = part.split(";");
      const [name, ...rest] = pair.split("=");
      if (name && rest.length) {
        this.cookies[name.trim()] = rest.join("=").trim();
      }
    }
  }

  hasSession(): boolean {
    return !!(this.cookies["token"] && this.cookies["user"]);
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

    if (!this.hasSession()) {
      const logged = await this.login();
      if (!logged) return this.fail(lote, "Sin sesión activa y login falló");
    }

    let res = await this.postLote(lote);

    const needsRelogin =
      res.status === 401 ||
      (res.status >= 300 && res.status < 400) ||
      (res.status >= 500 && res.status < 600);

    if (needsRelogin) {
      const reLogged = await this.login();
      if (!reLogged) {
        return this.fail(
          lote,
          `Sesión o server caído (HTTP ${res.status}) y relogin falló`,
        );
      }
      res = await this.postLote(lote);
    }

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
        mensaje: `Inyectado (id: ${(body as LoteEnviado).id.slice(0, 8)})`,
        timestamp: new Date().toISOString(),
      };
    }

    if (res.status === 400) {
      return this.fail(
        lote,
        `Validación rechazada (400): ${await res.text()}`,
      );
    }

    return this.fail(lote, `HTTP ${res.status}`);
  }

  private async postLote(lote: Lote): Promise<Response> {
    return fetch(`${BASE_URL}/ec/api/lotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: Object.entries(this.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
      body: JSON.stringify({ lote: lote.numero, product: lote.producto }),
      redirect: "manual",
    });
  }

  async validarSesion(): Promise<boolean> {
    return this.hasSession();
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
