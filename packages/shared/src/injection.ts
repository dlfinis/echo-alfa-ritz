import type { Lote } from "./lote.js";

// ── Inyección (Injection) ──

export const INJECTION_RESULT = {
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type InjectionResultStatus =
  (typeof INJECTION_RESULT)[keyof typeof INJECTION_RESULT];

export interface InjectionResult {
  loteId: string;
  numero: string;
  status: InjectionResultStatus;
  mensaje?: string;
  timestamp: string;
}

// ── Cola de Ejecución (Distribution) ──

export interface QueueItem {
  lote: Lote;
  orden: number; // 1-12
}