import type { Lote } from "./lote.js";
import type {
  LimiteAlcanzado,
  LoteEnviado,
} from "./api.js";
import type { InjectionResult, QueueItem } from "./injection.js";

export type InyeccionResponse =
  | { kind: "exito"; data: LoteEnviado }
  | { kind: "limite"; data: LimiteAlcanzado }
  | { kind: "error"; mensaje: string };

/**
 * Estrategia de inyección de lotes en la plataforma objetivo.
 *
 * Principio O (Open/Closed) de SOLID:
 * - Abierto para nuevas implementaciones (HttpInjector, BrowserInjector).
 * - Cerrado para modificaciones (el Orquestador depende de esta abstracción).
 */
export interface IInjectionStrategy {
  readonly nombre: string;

  /** Intenta inyectar un número de lote en la plataforma. */
  inyectar(lote: Lote): Promise<InjectionResult>;

  /** Valida que la sesión esté activa antes de ejecutar. */
  validarSesion(): Promise<boolean>;

  /** Renueva la sesión usando credenciales almacenadas. */
  renovarSesion(): Promise<boolean>;
}

/**
 * Regla de rotación para calcular la cola diaria de 12 ítems.
 *
 * Principio O (Open/Closed) de SOLID:
 * - Abierto para nuevas reglas (priorización por fecha, etc.).
 * - Cerrado para modificaciones en el núcleo del orquestador.
 */
export interface IRotationRule {
  readonly nombre: string;

  /** Calcula la cola de ejecución a partir de los lotes activos. */
  calcularCola(lotesActivos: Lote[]): QueueItem[];
}
