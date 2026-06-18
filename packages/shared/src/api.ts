// ── Respuestas de la API de promoritz ──

import type { Producto } from "./lote.js";

/**
 * El endpoint de login solo devuelve Set-Cookie; este tipo
 * existe por completitud pero normalmente no se parsea.
 */
export interface LoginResponse {
  ok?: boolean;
}

export interface LoteEnviado {
  brand: string;
  product: Producto;
  lote: string;
  username: string;
  userId: string;
  whatsapp: boolean;
  isReemplazo: boolean;
  referredBy: string | null;
  id: string;
  createdAt: string;
}

export interface LimiteAlcanzado {
  limite: true;
  total: number;
  message: "limit";
}

/**
 * Snapshot leído de GET /ec/perfil.
 * El número actual de lotes del día está en un `<div>` con
 * clase `bg-[#F5F5F5]` y `text-2xl` en la SSR del perfil.
 */
export interface PerfilSnapshot {
  lotesHoy: number;
  limite: number; // 12
  username?: string;
  nombres?: string;
  apellidos?: string;
  cedula?: string;
}