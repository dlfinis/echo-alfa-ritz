// API layer: todo lo que la PWA necesita para hablar con promoritz
// y para persistir logs en Supabase.

export { InMemoryCookieJar } from "./cookieJar.js";
export type { CookieJar } from "./cookieJar.js";

export { HttpInjector } from "./httpInjector.js";
export type { HttpInjectorConfig } from "./httpInjector.js";

export { ProfileReader } from "./profileReader.js";
export type { ProfileReaderConfig } from "./profileReader.js";

export { ExecutionOrchestrator } from "./orchestrator.js";
export type { OrchestratorConfig } from "./orchestrator.js";

export { SupabaseLogWriter } from "./supabaseLogWriter.js";