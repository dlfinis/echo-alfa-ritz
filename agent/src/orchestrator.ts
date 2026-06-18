import type {
  IInjectionStrategy,
  InjectionResult,
  IRotationRule,
  Lote,
} from "@echo-alfa-ritz/shared";

/**
 * Orquestador principal del agente Echo-Alfa.
 *
 * Responsabilidad única (S de SOLID): coordinar el flujo de
 * ejecución — no calcula distribución, no maneja sesiones,
 * no inyecta lotes. Solo orquesta.
 */
export class ExecutionOrchestrator {
  constructor(
    private readonly rotationRule: IRotationRule,
    private readonly injector: IInjectionStrategy,
    private readonly delayMs: number = 4000,
  ) {}

  async executeDailyRotation(lotesActivos: Lote[]): Promise<InjectionResult[]> {
    const cola = this.rotationRule.calcularCola(lotesActivos);
    const resultados: InjectionResult[] = [];

    console.log(
      `[Orquestador] Ejecutando ${cola.length} inscripciones con delay ${this.delayMs}ms`,
    );

    for (const item of cola) {
      await this.sleep(this.delayMs);

      console.log(
        `[Orquestador] Inyectando lote #${item.orden}: ${item.lote.numero}`,
      );
      const resultado = await this.injector.inyectar(item.lote);
      resultados.push(resultado);
    }

    return resultados;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
