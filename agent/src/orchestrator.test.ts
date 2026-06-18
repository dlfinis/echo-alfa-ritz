import { describe, it, expect } from "vitest";
import { ExecutionOrchestrator } from "./orchestrator.js";
import { MockInjector } from "./injectors.js";
import { RotacionCiclicaRule, validarCola } from "@echo-alfa-ritz/shared";
import { LOTE_ESTADO, INJECTION_RESULT } from "@echo-alfa-ritz/shared";
import type { Lote } from "@echo-alfa-ritz/shared";

describe("ExecutionOrchestrator", () => {
  it("ejecuta las 12 inscripciones y devuelve todos los resultados", async () => {
    const lotes: Lote[] = Array.from({ length: 15 }, (_, i) => ({
      id: `${i + 1}`,
      numero: `${String(i + 1).padStart(3, "0")}`,
      estado: LOTE_ESTADO.ACTIVO,
    }));

    const rule = new RotacionCiclicaRule();
    const injector = new MockInjector();
    const orch = new ExecutionOrchestrator(rule, injector, 1); // 1ms delay para el test

    const resultados = await orch.executeDailyRotation(lotes);

    expect(resultados).toHaveLength(12);
    expect(resultados.every((r) => r.status === INJECTION_RESULT.SUCCESS)).toBe(true);
    // Verifica que la cola previa fue válida
    const cola = rule.calcularCola(lotes);
    expect(validarCola(cola)).toBe(true);
  });

  it("respeta el orden de la cola en la inyección", async () => {
    const lotes: Lote[] = ["A", "B", "C", "D"].map((n, i) => ({
      id: `${i + 1}`,
      numero: n,
      estado: LOTE_ESTADO.ACTIVO,
    }));

    const rule = new RotacionCiclicaRule();
    const injector = new MockInjector();
    const orch = new ExecutionOrchestrator(rule, injector, 1);

    const resultados = await orch.executeDailyRotation(lotes);

    // N=4, 12 ítems: 3 ciclos A,B,C,D
    const numeros = resultados.map((r) => r.numero);
    expect(numeros).toEqual([
      "A", "B", "C", "D",
      "A", "B", "C", "D",
      "A", "B", "C", "D",
    ]);
  });

  it("devuelve array vacío si no hay lotes activos", async () => {
    const rule = new RotacionCiclicaRule();
    const injector = new MockInjector();
    const orch = new ExecutionOrchestrator(rule, injector, 1);

    const resultados = await orch.executeDailyRotation([]);
    expect(resultados).toHaveLength(0);
  });
});