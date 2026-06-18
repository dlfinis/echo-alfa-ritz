import type { PerfilSnapshot } from "@echo-alfa-ritz/shared";
import type { CookieJar } from "./cookieJar.js";

const BASE_URL = "https://promoritz.com/ec";

export interface ProfileReaderConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  cookieJar: CookieJar;
}

/**
 * Lee GET /ec/perfil y parsea el SSR para obtener
 * el conteo de lotes inscritos hoy y datos del usuario.
 *
 * Headers requeridos (Next.js RSC):
 *   rsc: 1
 *   next-url: /participar
 *   next-router-state-tree: <encoded>
 *
 * Estructura HTML objetivo (website-info.md):
 *   <div class="text-primary bg-[#F5F5F5] w-full h-fit py-3 font-bold
 *               flex items-center justify-center text-center text-2xl">N</div>
 */
export class ProfileReader {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly jar: CookieJar;

  constructor(config: ProfileReaderConfig) {
    this.baseUrl = config.baseUrl ?? BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.jar = config.cookieJar;
  }

  async leer(): Promise<PerfilSnapshot> {
    const res = await this.fetchImpl(`${this.baseUrl}/perfil`, {
      method: "GET",
      headers: {
        rsc: "1",
        "next-url": "/participar",
        "next-router-state-tree": "%5B%22%22%2C%7B%22children%22%3A%5B%22perfil%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
        Cookie: this.jar.toCookieHeader(),
      },
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`GET /perfil → HTTP ${res.status}`);
    }

    this.jar.setFromResponse(res.headers);
    const html = await res.text();

    // Parsear el contador de "lotes hoy" del HTML SSR
    const lotesHoy = this.parseLotesHoy(html);
    const campos = this.parseCamposUsuario(html);

    return {
      lotesHoy,
      limite: 12,
      ...campos,
    };
  }

  /**
   * Busca el primer <div class="...bg-[#F5F5F5]...text-2xl">N</div>
   */
  private parseLotesHoy(html: string): number {
    const match = html.match(
      /bg-\[#F5F5F5\][^>]*text-2xl[^>]*>\s*(\d+)\s*</,
    );
    if (!match) return 0;
    const n = Number.parseInt(match[1], 10);
    return Number.isFinite(n) ? n : 0;
  }

  private parseCamposUsuario(html: string): {
    username?: string;
    nombres?: string;
    apellidos?: string;
    cedula?: string;
  } {
    const findField = (label: string): string | undefined => {
      // Tolerante: el label puede tener ":" o no ("Nombres:" vs "Cédula")
      const re = new RegExp(
        `font-bold[^>]*>${label}[:<]?\\s*</p>\\s*<p[^>]*>\\s*([^<]+?)\\s*</p>`,
        "i",
      );
      const m = html.match(re);
      return m?.[1]?.trim();
    };

    return {
      nombres: findField("Nombres"),
      apellidos: findField("Apellidos"),
      cedula: findField("Cédula"),
    };
  }
}