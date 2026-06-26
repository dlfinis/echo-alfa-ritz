import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Cliente Supabase singleton.
 * Lee de import.meta.env (Vite inyecta VITE_SUPABASE_* desde .env.local).
 *
 * Usa la "publishable key" (formato sb_publishable_...). La "anon key"
 * (eyJ... JWT) está deprecada por Supabase — no usar.
 */
export function useSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase no configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _client;
}

export function getSupabaseConfigError(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) return "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY";
  if (!url) return "Falta VITE_SUPABASE_URL";
  if (!key) return "Falta VITE_SUPABASE_PUBLISHABLE_KEY";
  return null;
}