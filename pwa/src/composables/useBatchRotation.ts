import { ref } from "vue";
import { useAccounts } from "./useAccounts.js";
import { usePromoritzSession } from "./usePromoritzSession.js";
import { useRotationRunner } from "./useRotationRunner.js";
import { useSupabase } from "./useSupabase.js";

export interface BatchRunResult {
  success: number;
  failed: number;
  skipped: number;
}

export interface BatchExecuteState {
  running: boolean;
  accountsDone: number;
  accountsTotal: number;
  currentAccountEmail: string | null;
  results: Record<string, BatchRunResult>;
  totalSuccess: number;
  totalFailed: number;
  totalSkipped: number;
  error?: string;
}

let _canceled = false;

export function useBatchRotation() {
  const sb = useSupabase();
  const accountsApi = useAccounts();
  const session = usePromoritzSession();
  const runner = useRotationRunner();

  const batchState = ref<BatchExecuteState>({
    running: false,
    accountsDone: 0,
    accountsTotal: 0,
    currentAccountEmail: null,
    results: {},
    totalSuccess: 0,
    totalFailed: 0,
    totalSkipped: 0,
  });

  function cancel() {
    _canceled = true;
    runner.cancel();
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function executeBatch(options: {
    accountIds: string[];
    cantidadPorCuenta: number;
    fastMode: boolean;
  }): Promise<void> {
    if (batchState.value.running) return;
    if (options.accountIds.length === 0) return;

    _canceled = false;
    batchState.value = {
      running: true,
      accountsDone: 0,
      accountsTotal: options.accountIds.length,
      currentAccountEmail: null,
      results: {},
      totalSuccess: 0,
      totalFailed: 0,
      totalSkipped: 0,
    };

    try {
      for (const [index, accountId] of options.accountIds.entries()) {
        if (_canceled) break;

        const acc = accountsApi.getById(accountId);
        if (!acc) {
          batchState.value.totalFailed++;
          batchState.value.accountsDone++;
          continue;
        }
        batchState.value.currentAccountEmail = acc.email;

        // 1. Cambiar a esta cuenta: setear active_account_id + email en configuracion
        //    (setActiveAccount en useConfiguracion ya es atómico).
        const { data: accRow } = await sb
          .from("accounts")
          .select("email")
          .eq("id", accountId)
          .maybeSingle();
        if (!accRow) {
          batchState.value.totalFailed++;
          batchState.value.accountsDone++;
          continue;
        }

        // 2. Login fresh (el watch de usePromoritzSession carga sesión de la cuenta activa)
        const logged = await session.login();
        if (!logged) {
          batchState.value.totalFailed++;
          batchState.value.accountsDone++;
          continue;
        }

        // 3. Ejecutar rotación para esta cuenta
        await runner.execute(undefined, {
          externalJar: session.jar,
          fastMode: options.fastMode,
          cantidad: options.cantidadPorCuenta,
        });

        // 4. Guardar resultado
        const s = runner.state.value;
        const res: BatchRunResult = {
          success: s.success,
          failed: s.failed,
          skipped: s.skipped,
        };
        batchState.value.results[accountId] = res;
        batchState.value.totalSuccess += res.success;
        batchState.value.totalFailed += res.failed;
        batchState.value.totalSkipped += res.skipped;
        batchState.value.accountsDone++;

        // 5. Delay entre cuentas (excepto última, y solo si fastMode=false)
        if (!options.fastMode && index < options.accountIds.length - 1) {
          const delayMinMs = 3000;
          const delayMaxMs = 7000;
          const delay = delayMinMs + Math.random() * (delayMaxMs - delayMinMs);
          await sleep(delay);
        }
      }
    } catch (e) {
      batchState.value.error = e instanceof Error ? e.message : String(e);
    } finally {
      batchState.value.running = false;
    }
  }

  return { batchState, executeBatch, cancel };
}
