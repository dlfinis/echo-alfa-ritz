// ── Configuración del Sistema (PWA → Supabase) ──
//
// NOTA: no hay `productoDefault` global — cada lote tiene su producto
// propio (un mismo número de lote puede participar con varios productos
// según el día, o solo uno fijo). El producto se elige al crear cada lote
// en pool_lotes.

export interface ConfiguracionSistema {
  id?: string;
  email: string; // login del usuario en promoritz
  tareaActivada: boolean;
  horaEjecucion: string; // "00:00"
  fechaCaducidad: string; // "2026-12-31"
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