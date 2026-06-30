import { ref } from "vue";
import type { ConfiguracionSistema } from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";

export interface ConfigRow {
  id: string;
  email: string;
  delay_min_segundos: number;
  delay_max_segundos: number;
  updated_at: string;
  active_account_id: string | null;
}

// ── Singleton: evitar múltiples subscripciones Realtime al mismo canal ──
let _initialized = false;
let _config = ref<ConfiguracionSistema | null>(null);
let _loading = ref(true);
let _error = ref<string | null>(null);

export function useConfiguracion() {
  const sb = useSupabase();

  if (!_initialized) {
    _initialized = true;
    refresh();
    subscribe();
  }

  function fromRow(row: ConfigRow): ConfiguracionSistema {
    return {
      id: row.id,
      email: row.email,
      delayMinSegundos: row.delay_min_segundos,
      delayMaxSegundos: row.delay_max_segundos,
      activeAccountId: row.active_account_id,
    };
  }

  async function refresh() {
    _loading.value = true;
    const { data, error: e } = await sb
      .from("configuracion")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (e) {
      _error.value = e.message;
    } else if (data) {
      _config.value = fromRow(data as ConfigRow);
      _error.value = null;
    }
    _loading.value = false;
  }

  async function update(patch: Partial<ConfiguracionSistema>) {
    if (!_config.value?.id) throw new Error("Sin id de configuración");
    const update: Partial<ConfigRow> = { updated_at: new Date().toISOString() };
    if (patch.email !== undefined) update.email = patch.email;
    if (patch.delayMinSegundos !== undefined) update.delay_min_segundos = patch.delayMinSegundos;
    if (patch.delayMaxSegundos !== undefined) update.delay_max_segundos = patch.delayMaxSegundos;
    if ("activeAccountId" in patch) {
      // Permitir explícitamente null (limpiar) o string (setear)
      update.active_account_id = patch.activeAccountId ?? null;
    }

    const { error: e } = await sb
      .from("configuracion")
      .update(update)
      .eq("id", _config.value.id);
    if (e) throw e;
    await refresh();
  }

  /**
   * Activa una cuenta: setea active_account_id Y el email correspondiente
   * en una sola operación atómica. Si la cuenta no existe, NO hace nada
   * (devuelve null) para evitar emails huérfanos.
   */
  async function setActiveAccount(
    accountId: string,
  ): Promise<{ email: string } | null> {
    const { data: acc, error: e } = await sb
      .from("accounts")
      .select("id, email")
      .eq("id", accountId)
      .maybeSingle();
    if (e) throw e;
    if (!acc) return null;
    await update({ activeAccountId: accountId, email: acc.email });
    return { email: acc.email };
  }

  /**
   * Limpia el estado de cuenta activa (active_account_id y email).
   * Usar cuando se borra la cuenta activa o cuando el email no corresponde
   * a ninguna cuenta activa (corrupto).
   */
  async function clearActiveAccount(): Promise<void> {
    await update({ activeAccountId: null, email: "" });
  }

  /**
   * Verifica que el email de configuracion.matchee el email del
   * active_account_id. Si no, lo corrige. Útil al montar la app o
   * después de cambios en accounts.
   */
  async function validateAndFixEmail(): Promise<void> {
    if (!_config.value) return;
    const id = _config.value.activeAccountId;
    if (!id) {
      // No hay activa. Si hay email, limpiarlo.
      if (_config.value.email) {
        await update({ email: "" });
      }
      return;
    }
    const { data: acc, error: e } = await sb
      .from("accounts")
      .select("email")
      .eq("id", id)
      .maybeSingle();
    if (e) {
      console.warn("validateAndFixEmail error:", e);
      return;
    }
    if (!acc) {
      // La activa no existe. Limpiar.
      await clearActiveAccount();
      return;
    }
    if (acc.email !== _config.value.email) {
      // El email está desincronizado. Corregir.
      await update({ email: acc.email });
    }
  }

  function subscribe() {
    sb
      .channel("configuracion_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "configuracion" },
        () => refresh(),
      )
      .subscribe();
  }

  return {
    config: _config,
    loading: _loading,
    error: _error,
    refresh,
    update,
    setActiveAccount,
    clearActiveAccount,
    validateAndFixEmail,
  };
}
