import { ref } from "vue";
import {
  HttpInjector,
  InMemoryCookieJar,
  ExecutionOrchestrator,
  SupabaseLogWriter,
} from "../api/index.js";
import {
  RotacionCiclicaRule,
  INJECTION_RESULT,
  type InjectionResult,
  type Lote,
} from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";
import { useConfiguracion } from "./useConfiguracion.js";

export interface ExecuteState {
  running: boolean;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  current: number;
  resultados: InjectionResult[];
  error?: string;
}

/**
 * Composable principal: ejecuta la rotación diaria.
 * Usa InMemoryCookieJar compartido + HttpInjector + SupabaseLogWriter.
 */
export function useRotationRunner() {
  const sb = useSupabase();
  const { config } = useConfiguracion();
  const jar = new InMemoryCookieJar();
  const state = ref<ExecuteState>({
    running: false,
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    current: 0,
    resultados: [],
  });

  async function fetchPool(): Promise<Lote[]> {
    const { data, error } = await sb
      .from("pool_lotes")
      .select("*")
      .eq("estado", "activo");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      numero: r.numero,
      producto: r.producto,
      estado: r.estado,
    }));
  }

  async function execute(lotesActivos?: Lote[]) {
    if (state.value.running) return;
    state.value = {
      running: true,
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      current: 0,
      resultados: [],
    };

    try {
      const pool = lotesActivos ?? (await fetchPool());
      if (!config.value?.email) {
        throw new Error("Email no configurado. Ve a Configuración.");
      }

      const injector = new HttpInjector({
        email: config.value.email,
        cookieJar: jar,
      });
      const logWriter = new SupabaseLogWriter(sb);
      const orch = new ExecutionOrchestrator({
        rotationRule: new RotacionCiclicaRule(),
        injector,
        logWriter,
        delayMinMs: (config.value.delayMinSegundos ?? 3) * 1000,
        delayMaxMs: (config.value.delayMaxSegundos ?? 7) * 1000,
        onProgress: (r, i) => {
          state.value.current = i + 1;
          state.value.total = Math.max(state.value.total, i + 1);
          if (r.status === INJECTION_RESULT.SUCCESS) state.value.success++;
          else if (r.status === INJECTION_RESULT.FAILED) state.value.failed++;
          else if (r.status === INJECTION_RESULT.SKIPPED) state.value.skipped++;
        },
      });

      state.value.resultados = await orch.executeDailyRotation(pool);
    } catch (e) {
      state.value.error = e instanceof Error ? e.message : String(e);
    } finally {
      state.value.running = false;
    }
  }

  return { state, execute };
}