import { ref, computed, onMounted, onUnmounted } from "vue";
import type { Lote } from "@echo-alfa-ritz/shared";
import {
  LOTE_ESTADO,
  esProductoValido,
  esFormatoLoteValido,
} from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";

export interface LoteRow {
  id: string;
  numero: string;
  producto: string;
  estado: "activo" | "pagado" | "vencido";
  created_at: string;
  updated_at: string;
}

/**
 * Composable: pool de lotes desde Supabase con suscripción Realtime.
 */
export function usePoolLotes() {
  const sb = useSupabase();
  const lotes = ref<LoteRow[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const lotesActivos = computed(() =>
    lotes.value.filter((l) => l.estado === LOTE_ESTADO.ACTIVO),
  );

  async function refresh() {
    loading.value = true;
    const { data, error: e } = await sb
      .from("pool_lotes")
      .select("*")
      .order("numero");
    if (e) {
      error.value = e.message;
    } else {
      lotes.value = data ?? [];
      error.value = null;
    }
    loading.value = false;
  }

  let channel: ReturnType<typeof sb.channel> | null = null;
  function subscribe() {
    channel = sb
      .channel("pool_lotes_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pool_lotes" },
        () => refresh(),
      )
      .subscribe();
  }
  function unsubscribe() {
    if (channel) sb.removeChannel(channel);
    channel = null;
  }

  onMounted(async () => {
    await refresh();
    subscribe();
  });
  onUnmounted(unsubscribe);

  async function addLote(numero: string, producto: string) {
    const { error: e } = await sb
      .from("pool_lotes")
      .insert({ numero, producto, estado: "activo" });
    if (e) throw e;
    await refresh();
  }

  async function toggleEstado(id: string, estado: "activo" | "pagado" | "vencido") {
    const { error: e } = await sb
      .from("pool_lotes")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (e) throw e;
    await refresh();
  }

  async function toggleActivo(id: string, activo: boolean) {
    const estado = activo ? "activo" : "inactivo";
    const { error: e } = await sb
      .from("pool_lotes")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (e) throw e;
    await refresh();
  }

  async function removeLote(id: string) {
    const { error: e } = await sb.from("pool_lotes").delete().eq("id", id);
    if (e) throw e;
    await refresh();
  }

  async function editProducto(id: string, producto: string) {
    if (!esProductoValido(producto)) {
      throw new Error(`Producto inválido: "${producto}"`);
    }
    const { error: e } = await sb
      .from("pool_lotes")
      .update({ producto, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (e) throw e;
    await refresh();
  }

  function toDomain(row: LoteRow): Lote {
    return {
      id: row.id,
      numero: row.numero,
      producto: row.producto as Lote["producto"],
      estado: row.estado as Lote["estado"],
    };
  }

  return {
    lotes,
    lotesActivos,
    loading,
    error,
    refresh,
    addLote,
    toggleEstado,
    toggleActivo,
    removeLote,
    editProducto,
    toDomain,
  };
}