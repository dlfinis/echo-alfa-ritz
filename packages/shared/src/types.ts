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
//
// NOTA: multi-cuenta — el email pertenece a una `Account`. La cuenta
// activa se referencia por `activeAccountId` en `configuracion`.

export interface Account {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface ConfiguracionSistema {
  id?: string;
  email: string; // email de la cuenta activa (denormalizado para queries rápidas)
  delayMinSegundos: number; // 3
  delayMaxSegundos: number; // 7
  activeAccountId: string | null; // FK a accounts; null cuando se borra la activa
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
  /** ID de la cuenta que hizo el log. Null en logs legacy pre-multi-cuenta. */
  accountId?: string | null;
}

/**
 * Abstracción para persistir logs de inscripción (Supabase, console, etc.).
 * Implementación inyectable por composición (D de SOLID).
 */
export interface LogWriter {
  write(log: LogInscripcion): Promise<void>;
  list(limit?: number): Promise<LogInscripcion[]>;
}
