import type {
  IInjectionStrategy,
  InjectionResult,
  IRotationRule,
  Lote,
  LogInscripcion,
  LogWriter,
} from "@echo-alfa-ritz/shared";
import { INJECTION_RESULT } from "@echo-alfa-ritz/shared";

export interface OrchestratorConfig {
  rotationRule: IRotationRule;
  injector: IInjectionStrategy;
  logWriter: LogWriter;
  /**
   * Delay aleatorio entre inyecciones (ms).
   * Regla 4 del context: entre 3 y 7 segundos para mimetizar uso humano.
   */
  delayMinMs?: number;
  delayMaxMs?: number;
  onProgress?: (resultado: InjectionResult, index: number) => void;
}

export class ExecutionOrchestrator {
  private readonly rotationRule: IRotationRule;
  private readonly injector: IInjectionStrategy;
  private readonly logWriter: LogWriter;
  private readonly delayMinMs: number;
  private readonly delayMaxMs: number;
  private readonly onProgress?: (
    r: InjectionResult,
    i: number,
  ) => void;
  private cancelled = false;

  constructor(config: OrchestratorConfig) {
    this.rotationRule = config.rotationRule;
    this.injector = config.injector;
    this.logWriter = config.logWriter;
    this.delayMinMs = config.delayMinMs ?? 3000;
    this.delayMaxMs = config.delayMaxMs ?? 7000;
    this.onProgress = config.onProgress;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async executeDailyRotation(lotesActivos: Lote[]): Promise<InjectionResult[]> {
    this.cancelled = false;
    const cola = this.rotationRule.calcularCola(lotesActivos);
    const resultados: InjectionResult[] = [];

    for (let i = 0; i < cola.length; i++) {
      if (this.cancelled) break;

      const item = cola[i];

      // Delay aleatorio entre ítems (Regla 4 del context)
      if (i > 0) {
        await this.randomSleep();
      }

      const resultado = await this.injector.inyectar(item.lote);
      resultados.push(resultado);

      // Persistir log
      await this.logWriter.write({
        id: crypto.randomUUID(),
        loteId: item.lote.id,
        numero: item.lote.numero,
        fecha: resultado.timestamp,
        resultado: resultado.status,
        mensaje: resultado.mensaje ?? "",
        estrategia: this.injector.nombre,
      });

      this.onProgress?.(resultado, i);

      // Si el servidor reportó límite, paramos el ciclo
      if (resultado.status === INJECTION_RESULT.SKIPPED) {
        break;
      }
    }

    return resultados;
  }

  private randomSleep(): Promise<void> {
    const ms =
      this.delayMinMs +
      Math.floor(Math.random() * (this.delayMaxMs - this.delayMinMs));
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}