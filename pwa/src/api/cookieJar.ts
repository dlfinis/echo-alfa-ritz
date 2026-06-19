/**
 * Cookie Jar en memoria.
 *
 * Responsabilidad única (SRP): capturar Set-Cookie de respuestas
 * y serializarlas para enviarlas en requests subsiguientes.
 *
 * En el browser, las cookies httpOnly no son accesibles desde JS;
 * las cookies de promoritz parece que NO son httpOnly (login con
 * email-only), por lo que este jar funciona. Si descubrimos que
 * SÍ son httpOnly en producción, hay que cambiar a un backend.
 *
 * Estrategia de captura:
 * 1. `getSetCookie()` (método nativo del browser, Chrome 110+)
 * 2. Fallback: header custom `x-set-cookie` (inyectado por Vite proxy)
 *    como URI-encoded string con delimitador `||`
 */
export interface CookieJar {
  cookies: Record<string, string>;
  setFromResponse(headers: Headers): void;
  toCookieHeader(): string;
  hasSession(): boolean;
}

export class InMemoryCookieJar implements CookieJar {
  cookies: Record<string, string> = {};

  setFromResponse(headers: Headers): void {
    const setCookies = this.tryGetSetCookie(headers);
    if (setCookies.length > 0) {
      for (const sc of setCookies) this.parseOne(sc);
    }
  }

  /** Intenta múltiples estrategias para obtener las Set-Cookie. */
  private tryGetSetCookie(headers: Headers): string[] {
    // 1. Método nativo del browser
    const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === "function") {
      const vals = anyHeaders.getSetCookie();
      if (vals && vals.length > 0) return vals;
    }

    // 2. Fallback: header custom x-set-cookie (Vite proxy workaround)
    const xVal = headers.get("x-set-cookie");
    if (xVal) {
      const decoded = decodeURIComponent(xVal);
      return decoded.split("||").filter(Boolean);
    }

    return [];
  }

  private parseOne(sc: string): void {
    const [pair] = sc.split(";");
    const [name, ...rest] = pair.split("=");
    if (name && rest.length) {
      this.cookies[name.trim()] = rest.join("=").trim();
    }
  }

  toCookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  hasSession(): boolean {
    return Object.keys(this.cookies).length > 0;
  }

  clear(): void {
    this.cookies = {};
  }
}
