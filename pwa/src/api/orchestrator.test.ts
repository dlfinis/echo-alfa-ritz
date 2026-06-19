import { describe, it, expect } from "vitest";
import { ExecutionOrchestrator } from "./index.js";
import type {
  IRotationRule,
  IInjectionStrategy,
  LogInscripcion,
  LogWriter,
  Lote,
  InjectionResult,
  QueueItem,
} from "@echo-alfa-ritz/shared";
import {
  LOTE_ESTADO,
  INJECTION_RESULT,
  RotacionCiclicaRule,
} from "@echo-alfa-ritz/shared";

class MockLogWriter implements LogWriter {
  public logs: LogInscripcion[] = [];
  async write(log: LogInscripcion): Promise<void> {
    this.logs.push(log);
  }
  async list(): Promise<LogInscripcion[]> {
    return this.logs;
  }
}

class ScriptedInjector implements IInjectionStrategy {
  readonly nombre = "scripted";
  private seq: InjectionResult[];

  constructor(results: InjectionResult[]) {
    this.seq = results;
  }

  async inyectar(lote: Lote): Promise<InjectionResult> {
    return (
      this.seq.shift() ?? {
        loteId: lote.id,
        numero: lote.numero,
        status: INJECTION_RESULT.FAILED,
        mensaje: "Sin respuesta",
        timestamp: new Date().toISOString(),
      }
    );
  }
  async validarSesion(): Promise<boolean> {
    return true;
  }
  async renovarSesion(): Promise<boolean> {
    return true;
  }
}

function successResult(loteId: string, numero: string): InjectionResult {
  return {
    loteId,
    numero,
    status: INJECTION_RESULT.SUCCESS,
    mensaje: "ok",
    timestamp: new Date().toISOString(),
  };
}

describe("ExecutionOrchestrator", () => {
  it("ejecuta las 12 inscripciones y persiste todos los logs", async () => {
    const lotes: Lote[] = Array.from({ length: 15 }, (_, i) => ({
      id: `${i + 1}`,
      numero: `${String(i + 1).padStart(3, "0")}`,
      estado: LOTE_ESTADO.ACTIVO,
      producto: "Mini Ritz",
    }));

    const injector = new ScriptedInjector(
      Array.from({ length: 12 }, (_, i) =>
        successResult(`${i + 1}`, `${String(i + 1).padStart(3, "0")}`),
      ),
    );
    const logWriter = new MockLogWriter();
    const rule: IRotationRule = new RotacionCiclicaRule();

    const orch = new ExecutionOrchestrator({
      rotationRule: rule,
      injector,
      logWriter,
      delayMinMs: 1,
      delayMaxMs: 1,
    });

    const resultados = await orch.executeDailyRotation(lotes);

    expect(resultados).toHaveLength(12);
    expect(resultados.every((r) => r.status === INJECTION_RESULT.SUCCESS)).toBe(true);
    expect(logWriter.logs).toHaveLength(12);
    expect(logWriter.logs[0].estrategia).toBe("scripted");
  });

  it("respeta el orden de la cola en la inyección", async () => {
    const lotes: Lote[] = ["A", "B", "C", "D"].map((n, i) => ({
      id: `${i + 1}`,
      numero: n,
      estado: LOTE_ESTADO.ACTIVO,
      producto: "Mini Ritz",
    }));

    const injector = new ScriptedInjector(
      Array.from({ length: 12 }, (_, i) =>
        successResult(`${(i % 4) + 1}`, ["A", "B", "C", "D"][i % 4]),
      ),
    );

    const orch = new ExecutionOrchestrator({
      rotationRule: new RotacionCiclicaRule(),
      injector,
      logWriter: new MockLogWriter(),
      delayMinMs: 1,
      delayMaxMs: 1,
    });

    const resultados = await orch.executeDailyRotation(lotes);
    const numeros = resultados.map((r) => r.numero);
    expect(numeros).toEqual([
      "A", "B", "C", "D",
      "A", "B", "C", "D",
      "A", "B", "C", "D",
    ]);
  });

  it("detiene la rotación al recibir SKIPPED y marca el resto como SKIPPED", async () => {
    const lotes: Lote[] = Array.from({ length: 15 }, (_, i) => ({
      id: `${i + 1}`,
      numero: `${i + 1}`,
      estado: LOTE_ESTADO.ACTIVO,
      producto: "Mini Ritz",
    }));

    // Las primeras 3 SUCCESS, la 4ta SKIPPED
    const injector = new ScriptedInjector([
      successResult("1", "1"),
      successResult("2", "2"),
      successResult("3", "3"),
      {
        loteId: "4",
        numero: "4",
        status: INJECTION_RESULT.SKIPPED,
        mensaje: "Límite diario alcanzado (12)",
        timestamp: new Date().toISOString(),
      },
    ]);

    const logWriter = new MockLogWriter();
    const orch = new ExecutionOrchestrator({
      rotationRule: new RotacionCiclicaRule(),
      injector,
      logWriter,
      delayMinMs: 1,
      delayMaxMs: 1,
    });

    const resultados = await orch.executeDailyRotation(lotes);
    // Debe devolver 12 (3 success + 1 skip real + 8 skip automáticos)
    expect(resultados).toHaveLength(12);
    // resultados[3] es el SKIPPED original del límite
    expect(resultados[3].status).toBe(INJECTION_RESULT.SKIPPED);
    expect(resultados[3].mensaje).toContain("Límite diario");
    // Los últimos 8 deben decir "Límite diario alcanzado — el servidor..."
    expect(resultados[11].mensaje).toContain("Límite diario alcanzado");
    // Todos los logs registrados (12 logs)
    expect(logWriter.logs).toHaveLength(12);
  });

  it("devuelve array vacío si no hay lotes activos", async () => {
    const logWriter = new MockLogWriter();
    const orch = new ExecutionOrchestrator({
      rotationRule: new RotacionCiclicaRule(),
      injector: new ScriptedInjector([]),
      logWriter,
      delayMinMs: 1,
      delayMaxMs: 1,
    });

    const resultados = await orch.executeDailyRotation([]);
    expect(resultados).toHaveLength(0);
    expect(logWriter.logs).toHaveLength(0);
  });

  it("invoca onProgress por cada resultado", async () => {
    const lotes: Lote[] = Array.from({ length: 15 }, (_, i) => ({
      id: `${i + 1}`,
      numero: `${i + 1}`,
      estado: LOTE_ESTADO.ACTIVO,
      producto: "Mini Ritz",
    }));

    const injector = new ScriptedInjector(
      Array.from({ length: 12 }, (_, i) => successResult(`${i + 1}`, `${i + 1}`)),
    );
    const progress: number[] = [];
    const orch = new ExecutionOrchestrator({
      rotationRule: new RotacionCiclicaRule(),
      injector,
      logWriter: new MockLogWriter(),
      delayMinMs: 1,
      delayMaxMs: 1,
      onProgress: (_r, i) => progress.push(i),
    });

    await orch.executeDailyRotation(lotes);
    // Con 15 lotes activos, N>=12 → primeros 12 del pool
    expect(progress).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});