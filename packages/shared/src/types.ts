// ── Tareas (task_queue de Supabase) ──

export const TASK_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  DEFERRED: "DEFERRED",
  FAILED: "FAILED",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const TASK_TYPE = {
  FETCH_LOTES: "FETCH_LOTES",
  ACTION_UPDATE: "ACTION_UPDATE",
  EXECUTE_ROTATION: "EXECUTE_ROTATION",
  MAINTENANCE: "MAINTENANCE",
} as const;

export type TaskType = (typeof TASK_TYPE)[keyof typeof TASK_TYPE];

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  payload: Record<string, unknown>;
  assignedTo: string;
  createdAt: string;
  processedAt?: string;
  log?: string;
}

// ── Logs de Ejecución ──

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

// ── Estado del Agente (FSM del brief) ──

export const AGENT_STATE = {
  IDLE: "IDLE",
  WAKING: "WAKING",
  EXECUTING: "EXECUTING",
  INVESTIGATING: "INVESTIGATING",
  MAINTENANCE: "MAINTENANCE",
} as const;

export type AgentStateType = (typeof AGENT_STATE)[keyof typeof AGENT_STATE];

// ── Configuración del Sistema (PWA → Supabase → Agent) ──

export interface ConfiguracionSistema {
  tareaActivada: boolean;
  horaEjecucion: string; // "00:00"
  fechaCaducidad: string; // "2026-12-31"
  delaySegundos: number; // 3-7
  estrategiaForzada: "HTTP" | "BROWSER" | "AUTO";
}

// ── Sesión ──

export interface SessionData {
  cookies: Record<string, string>;
  email: string;
  expiresAt?: string;
}