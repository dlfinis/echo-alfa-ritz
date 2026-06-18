import type { Lote } from "./lote.js";
import { LOTE_ESTADO } from "./lote.js";
import type { QueueItem } from "./injection.js";
import type { IRotationRule } from "./interfaces.js";

const CUPO_DIARIO = 12;

/**
 * Regla de rotación cíclica pura.
 *
 * Algoritmo (brief §4):
 * - N >= 12 → primeros 12 del pool, 1 vez cada uno.
 * - N < 12  → repeticiones = floor(12 / N), sobrantes = 12 % N.
 *             Los primeros `sobrantes` reciben +1 repetición.
 * - Orden: secuencial y cíclico (A, B, C, D, A, B, C, D...)
 *
 * NO lleva estado de "último usado". Cada día se recalcula desde
 * el principio del pool activo.
 */
export class RotacionCiclicaRule implements IRotationRule {
  readonly nombre = "rotacion-ciclica";

  calcularCola(lotesActivos: Lote[]): QueueItem[] {
    const pool = lotesActivos.filter((l) => l.estado === LOTE_ESTADO.ACTIVO);
    const n = pool.length;

    if (n === 0) return [];

    // Generar la cola cíclica de 12 posiciones
    const cola: QueueItem[] = [];

    if (n >= CUPO_DIARIO) {
      // Primeros 12 del pool, 1 vez cada uno
      for (let i = 0; i < CUPO_DIARIO; i++) {
        cola.push({ lote: pool[i], orden: i + 1 });
      }
    } else {
      const repeticionesBase = Math.floor(CUPO_DIARIO / n);
      const sobrantes = CUPO_DIARIO % n;

      let posicion = 0;
      for (let ciclo = 0; ciclo < repeticionesBase; ciclo++) {
        for (let i = 0; i < n; i++) {
          cola.push({ lote: pool[i], orden: ++posicion });
        }
      }
      // Los primeros `sobrantes` reciben 1 repetición extra
      for (let i = 0; i < sobrantes; i++) {
        cola.push({ lote: pool[i], orden: ++posicion });
      }
    }

    return cola;
  }
}

/**
 * Valida que la cola generada tenga exactamente 12 ítems.
 */
export function validarCola(cola: QueueItem[]): boolean {
  return cola.length === CUPO_DIARIO;
}
