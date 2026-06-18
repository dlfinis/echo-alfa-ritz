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
    // Headers#getSetCookie existe en browsers modernos (Chrome 110+, Firefox 125+, Safari 17+)
    const headersAny = headers as unknown as { getSetCookie?: () => string[] };
    const setCookies =
      typeof headersAny.getSetCookie === "function"
        ? headersAny.getSetCookie()
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
    return Object.keys(this.cookies).length > 0;
  }

  clear(): void {
    this.cookies = {};
  }
}