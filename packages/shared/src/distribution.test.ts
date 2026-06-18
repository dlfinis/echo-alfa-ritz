import { describe, it, expect } from "vitest";
import { RotacionCiclicaRule, validarCola } from "./distribution.js";
import type { Lote, LoteEstado } from "./lote.js";
import { LOTE_ESTADO } from "./lote.js";

function crearLote(id: string, numero: string, estado: LoteEstado = LOTE_ESTADO.ACTIVO): Lote {
  return { id, numero, estado };
}

describe("RotacionCiclicaRule", () => {
  const rule = new RotacionCiclicaRule();

  it("devuelve cola vacía si no hay lotes activos", () => {
    const cola = rule.calcularCola([]);
    expect(cola).toHaveLength(0);
  });

  it("ignora lotes que no estén ACTIVOS", () => {
    const lotes: Lote[] = [
      crearLote("1", "001", LOTE_ESTADO.ACTIVO),
      crearLote("2", "002", LOTE_ESTADO.VENCIDO),
      crearLote("3", "003", LOTE_ESTADO.PAGADO),
      // Solo 11 activos necesarios para N < 12
      ...Array.from({ length: 10 }, (_, i) =>
        crearLote(`${i + 4}`, `${String(i + 4).padStart(3, "0")}`),
      ),
    ];
    // 11 activos + 1 vencido + 1 pagado = 11 activos
    // 11 < 12 → repeticiones = 1, sobrantes = 1
    const cola = rule.calcularCola(lotes);
    expect(cola).toHaveLength(12);
    // Los vencidos/pagados no deben aparecer
    const numeros = cola.map((q) => q.lote.numero);
    expect(numeros).not.toContain("002");
    expect(numeros).not.toContain("003");
  });

  describe("N >= 12 (pool grande)", () => {
    it("selecciona los primeros 12 del pool, 1 vez cada uno", () => {
      const lotes = Array.from({ length: 15 }, (_, i) =>
        crearLote(`${i + 1}`, `${String(i + 1).padStart(3, "0")}`),
      );
      const cola = rule.calcularCola(lotes);

      expect(cola).toHaveLength(12);
      // Son los primeros 12, en orden
      cola.forEach((item, i) => {
        expect(item.lote.numero).toBe(String(i + 1).padStart(3, "0"));
        expect(item.orden).toBe(i + 1);
      });
    });
  });

  describe("N < 12 (pool chico)", () => {
    it("con N=4: repeticiones base = 3, ciclos exactos", () => {
      const lotes = ["A", "B", "C", "D"].map((n, i) =>
        crearLote(`${i + 1}`, n),
      );
      const cola = rule.calcularCola(lotes);

      expect(cola).toHaveLength(12);
      const secuencia = cola.map((q) => q.lote.numero);
      // 3 ciclos completos de A,B,C,D = 12
      expect(secuencia).toEqual([
        "A", "B", "C", "D",
        "A", "B", "C", "D",
        "A", "B", "C", "D",
      ]);
    });

    it("con N=7: base=1, sobrantes=5 (ejemplo del brief)", () => {
      const lotes = ["1", "2", "3", "4", "5", "6", "7"].map((n, i) =>
        crearLote(`${i + 1}`, n),
      );
      const cola = rule.calcularCola(lotes);

      expect(cola).toHaveLength(12);
      const secuencia = cola.map((q) => q.lote.numero);
      // 1 ciclo base (7) + 5 sobrantes (primeros 5)
      expect(secuencia).toEqual([
        "1", "2", "3", "4", "5", "6", "7",
        "1", "2", "3", "4", "5",
      ]);
    });

    it("con N=10: base=1, sobrantes=2", () => {
      const lotes = Array.from({ length: 10 }, (_, i) =>
        crearLote(`${i + 1}`, `${String(i + 1).padStart(2, "0")}`),
      );
      const cola = rule.calcularCola(lotes);

      expect(cola).toHaveLength(12);
      const secuencia = cola.map((q) => q.lote.numero);
      // 1 ciclo de 10 + sobrantes: primeros 2
      expect(secuencia).toEqual([
        "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
        "01", "02",
      ]);
    });

    it("con N=1: base=12, 12 repeticiones del único lote", () => {
      const lotes = [crearLote("1", "UNICO")];
      const cola = rule.calcularCola(lotes);

      expect(cola).toHaveLength(12);
      const secuencia = cola.map((q) => q.lote.numero);
      expect(secuencia).toEqual(Array(12).fill("UNICO"));
    });
  });
});

describe("validarCola", () => {
  it("true cuando la cola tiene exactamente 12 ítems", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      lote: crearLote(`${i}`, `${i}`),
      orden: i + 1,
    }));
    expect(validarCola(items)).toBe(true);
  });

  it("false cuando la cola tiene menos de 12", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      lote: crearLote(`${i}`, `${i}`),
      orden: i + 1,
    }));
    expect(validarCola(items)).toBe(false);
  });
});
