import { ref } from "vue";
import type { ConfiguracionSistema } from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";

export interface ConfigRow {
  id: string;
  email: string;
  delay_min_segundos: number;
  delay_max_segundos: number;
  updated_at: string;
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

    const { error: e } = await sb
      .from("configuracion")
      .update(update)
      .eq("id", _config.value.id);
    if (e) throw e;
    await refresh();
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

  return { config: _config, loading: _loading, error: _error, refresh, update };
}
