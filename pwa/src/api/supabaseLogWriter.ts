import type { LogInscripcion, LogWriter } from "@echo-alfa-ritz/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * LogWriter que persiste en Supabase (tabla logs_inscripcion).
 * Acepta un accountId opcional que se persiste en cada log para que las
 * queries de loadBatchCounts filtren por cuenta activa.
 */
export class SupabaseLogWriter implements LogWriter {
  private readonly accountId: string | null;

  constructor(
    private readonly sb: SupabaseClient,
    accountId: string | null = null,
  ) {
    this.accountId = accountId;
  }

  async write(log: LogInscripcion): Promise<void> {
    const { error } = await this.sb.from("logs_inscripcion").insert({
      id: log.id,
      lote_id: log.loteId,
      numero: log.numero,
      fecha: log.fecha,
      resultado: log.resultado,
      mensaje: log.mensaje,
      estrategia: log.estrategia,
      account_id: log.accountId ?? this.accountId ?? null,
    });
    if (error) {
      console.error("[SupabaseLogWriter] error al escribir log:", error);
      throw error;
    }
  }

  async list(limit = 50): Promise<LogInscripcion[]> {
    const { data, error } = await this.sb
      .from("logs_inscripcion")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[SupabaseLogWriter] error al listar logs:", error);
      return [];
    }
    return (data ?? []).map((r) => ({
      id: r.id,
      loteId: r.lote_id,
      numero: r.numero,
      fecha: r.fecha,
      resultado: r.resultado,
      mensaje: r.mensaje,
      estrategia: r.estrategia,
      accountId: r.account_id ?? null,
    }));
  }
}