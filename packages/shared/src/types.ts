// ── Configuración del Sistema (PWA → Supabase) ──
//
// NOTA: no hay `productoDefault` global — cada lote tiene su producto
// propio (un mismo número de lote puede participar con varios productos
// según el día, o solo uno fijo). El producto se elige al crear cada lote
// en pool_lotes.
//
// NOTA: No hay campos de "tarea automática" — al ser una PWA estática en
// Cloudflare Pages, no hay cron del lado del server. La rotación la
// dispara el usuario desde el botón "Hornear Galletas".

export interface ConfiguracionSistema {
  id?: string;
  email: string; // login del usuario en promoritz
  delayMinSegundos: number; // 3
  delayMaxSegundos: number; // 7
}

// ── Logs de Inscripción ──

import type { InjectionResultStatus } from "./injection.js";

export interface LogInscripcion {
  id: string;
  loteId: string;
  numero: string;
  fecha: string;
  resultado: InjectionResultStatus;
  mensaje: string;
  estrategia: string;
}

/**
 * Abstracción para persistir logs de inscripción (Supabase, console, etc.).
 * Implementación inyectable por composición (D de SOLID).
 */
export interface LogWriter {
  write(log: LogInscripcion): Promise<void>;
  list(limit?: number): Promise<LogInscripcion[]>;
}
