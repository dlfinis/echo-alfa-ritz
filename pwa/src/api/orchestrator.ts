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
  delayMinMs?: number;
  delayMaxMs?: number;
  /** Limita cuántos items enviar de la cola calculada (1-12). Por defecto todos. */
  maxCount?: number;
  onProgress?: (resultado: InjectionResult, index: number) => void;
  onCancel?: () => void;
}

export class ExecutionOrchestrator {
  private readonly rotationRule: IRotationRule;
  private readonly injector: IInjectionStrategy;
  private readonly logWriter: LogWriter;
  private readonly delayMinMs: number;
  private readonly delayMaxMs: number;
  private readonly maxCount: number;
  private readonly onProgress?: (
    r: InjectionResult,
    i: number,
  ) => void;
  private readonly onCancel?: () => void;
  private cancelled = false;

  constructor(config: OrchestratorConfig) {
    this.rotationRule = config.rotationRule;
    this.injector = config.injector;
    this.logWriter = config.logWriter;
    this.delayMinMs = config.delayMinMs ?? 3000;
    this.delayMaxMs = config.delayMaxMs ?? 7000;
    this.maxCount = config.maxCount ?? 12;
    this.onProgress = config.onProgress;
    this.onCancel = config.onCancel;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async executeDailyRotation(lotesActivos: Lote[]): Promise<InjectionResult[]> {
    this.cancelled = false;
    const cola = this.rotationRule.calcularCola(lotesActivos).slice(0, this.maxCount);
    const resultados: InjectionResult[] = [];
    let limiteAlcanzado = false;

    for (let i = 0; i < cola.length; i++) {
      if (this.cancelled || limiteAlcanzado) {
        // Marcar los restantes como SKIPPED para que quede registro
        const restantes = cola.slice(i);
        for (const item of restantes) {
          const skip: InjectionResult = {
            loteId: item.lote.id,
            numero: item.lote.numero,
            status: INJECTION_RESULT.SKIPPED,
            mensaje: limiteAlcanzado
              ? "Límite diario alcanzado — el servidor rechazó el lote anterior"
              : "Cancelado por el usuario",
            timestamp: new Date().toISOString(),
          };
          resultados.push(skip);
          await this.logWriter.write({
            id: crypto.randomUUID(),
            loteId: item.lote.id,
            numero: item.lote.numero,
            fecha: skip.timestamp,
            resultado: skip.status,
            mensaje: skip.mensaje ?? "",
            estrategia: this.injector.nombre,
          });
          this.onProgress?.(skip, i);
        }
        this.onCancel?.();
        break;
      }

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
        limiteAlcanzado = true;
        // El bucle iterará y entrará en el if de arriba
        // para marcar el resto como SKIPPED sin llamar a la API
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