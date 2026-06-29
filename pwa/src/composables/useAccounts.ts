import { ref } from "vue";
import type { Account } from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";

interface AccountRow {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

// ── Singleton: una sola suscripción Realtime al canal accounts ──
let _initialized = false;
const _accounts = ref<Account[]>([]);
const _loading = ref(true);
const _error = ref<string | null>(null);

export function useAccounts() {
  const sb = useSupabase();

  if (!_initialized) {
    _initialized = true;
    refresh();
    subscribe();
  }

  async function refresh() {
    _loading.value = true;
    const { data, error: e } = await sb
      .from("accounts")
      .select("*")
      .order("created_at");
    if (e) {
      _error.value = e.message;
    } else {
      _accounts.value = (data ?? []).map((r) => fromRow(r as AccountRow));
      _error.value = null;
    }
    _loading.value = false;
  }

  /** Agrega una cuenta nueva (solo email, sin login automático). */
  async function addAccount(email: string, displayName?: string): Promise<Account> {
    const { data, error: e } = await sb
      .from("accounts")
      .insert({ email, display_name: displayName ?? null })
      .select()
      .single();
    if (e) throw e;
    const acc = fromRow(data as AccountRow);
    // Actualizar lista local
    if (!_accounts.value.find((a) => a.id === acc.id)) {
      _accounts.value = [..._accounts.value, acc].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
    }
    return acc;
  }

  /** Quita una cuenta. NO permite quitar la activa. */
  async function removeAccount(id: string): Promise<void> {
    const { error: e } = await sb.from("accounts").delete().eq("id", id);
    if (e) throw e;
    _accounts.value = _accounts.value.filter((a) => a.id !== id);
  }

  function getById(id: string): Account | undefined {
    return _accounts.value.find((a) => a.id === id);
  }

  function subscribe() {
    sb
      .channel("accounts_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accounts" },
        () => refresh(),
      )
      .subscribe();
  }

  return {
    accounts: _accounts,
    loading: _loading,
    error: _error,
    refresh,
    addAccount,
    removeAccount,
    getById,
  };
}
