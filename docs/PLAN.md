# Plan de Implementación — Echo-Alfa-Ritz

> Estado al cierre del bootstrap. **20/20 tests pasan, typecheck verde.**

## Principio rector

Cada módulo es responsable de UNA cosa (S de SOLID). Los módulos de alto nivel (`Orquestador`, `Agente`) dependen de **interfaces**, no de implementaciones concretas (D de SOLID). Esto permite:
- Tests sin red real (inyección de mocks)
- Cambiar `HttpInjector` por `BrowserInjector` (cuando exista) sin tocar el orquestador
- Cambiar Supabase por otra persistencia sin tocar la lógica

## Mapa de módulos

```
                                ┌──────────────────────┐
                                │   PWA (Vue 3)        │
                                │   Realtime UI        │
                                └─────────┬────────────┘
                                          │ (Realtime subs)
                                          ▼
                                ┌──────────────────────┐
                                │   Supabase           │
                                │   · task_queue       │
                                │   · config           │
                                │   · lotes_snapshots  │
                                │   · logs_inscripcion │
                                │   · secrets (vault)  │
                                └─────────┬────────────┘
                                          │ (Realtime pub/sub)
                                          ▼
                                ┌──────────────────────┐
                                │   Agent (Node.js)    │
                                │   Loop principal     │
                                └─────────┬────────────┘
                                          │
            ┌──────────────┬──────────────┼──────────────┬─────────────┐
            ▼              ▼              ▼              ▼             ▼
       Scheduler     ProfileReader  Orquestador   SessionManager  LogWriter
       (¿cuándo?)   (¿cuántos hoy?) (¿qué inyectar?)(¿quién soy?) (¿qué pasó?)
            │              │              │              │             │
            │              │              ▼              │             │
            │              │     IInjectionStrategy      │             │
            │              │              │              │             │
            │              │              ▼              │             │
            │              │       HttpInjector         │             │
            │              └──────► (promoritz API) ◄────┘             │
            │                                  │                       │
            └──────────────────────────────────┴───────────────────────┘
```

## Módulos a construir (con orden de dependencias)

### Fase 1 — Núcleo de inyección (✅ HECHO)

| Módulo | Archivo | Estado | Tests |
|--------|---------|--------|-------|
| `RotacionCiclicaRule` | `packages/shared/src/distribution.ts` | ✅ | 9 |
| `IInjectionStrategy` | `packages/shared/src/interfaces.ts` | ✅ | — |
| `HttpInjector` | `agent/src/injectors.ts` | ✅ | 6 |
| `MockInjector` | `agent/src/injectors.ts` | ✅ | — |
| `ExecutionOrchestrator` | `agent/src/orchestrator.ts` | ✅ | 3 |
| `InMemoryCookieJar` | `agent/src/injectors.ts` | ✅ | 2 |
| `PRODUCTOS_VALIDOS` + validadores | `packages/shared/src/lote.ts` | ✅ | 0* |

\* Validadores están en `lote.ts` pero no tienen test directo. **TODO: agregar.**

### Fase 2 — Observabilidad y robustez (PRÓXIMO)

| Módulo | Responsabilidad (SRP) | Interfaz | Tests target |
|--------|----------------------|----------|--------------|
| `RetryPolicy` | Reintentos con backoff exponencial + jitter | `retry<T>(fn, policy): Promise<T>` | 4 |
| `RandomDelay` | Espera aleatoria entre min/max (Regla 4 del context) | `sleep(min, max): Promise<void>` | 2 |
| `ProfileReader` | Lee `GET /ec/perfil`, parsea SSR, devuelve `PerfilSnapshot` | `leer(): Promise<PerfilSnapshot>` | 3 |
| `LogWriter` (interfaz) | Persiste `LogInscripcion` en Supabase | `write(log: LogInscripcion)` | mock |

### Fase 3 — Persistencia y orquestación

| Módulo | Responsabilidad | Interfaz | Depende de |
|--------|----------------|----------|-----------|
| `SupabaseClient` (factory) | Construye cliente desde env | `createClient(url, key)` | `@supabase/supabase-js` |
| `SupabaseTaskQueue` | Lee/escribe `task_queue`, transiciones de estado | `ITaskQueue` | `SupabaseClient` |
| `SupabaseLogWriter` | Implementa `LogWriter` con tabla `logs_inscripcion` | `LogWriter` | `SupabaseClient` |
| `SupabaseConfigRepository` | Lee/escribe `configuracion` (PWA↔Agent) | `IConfigRepository` | `SupabaseClient` |
| `SupabaseSecretsRepository` | Lee credenciales cifradas de `secrets` | `ISecretsRepository` | `SupabaseClient` |
| `SessionManager` | Encapsula login + renovación + persistencia de cookie | `ISessionManager` | `ISecretsRepository`, `HttpInjector` |

### Fase 4 — Triggers y automatización

| Módulo | Responsabilidad | Depende de |
|--------|----------------|-----------|
| `RealtimeListener` | Suscribe a `task_queue` Realtime (PWA → Agent) | `SupabaseTaskQueue` |
| `Scheduler` | Cron interno: evalúa hora de ejecución, fecha de caducidad, tarea activada | `SupabaseConfigRepository` |
| `AgentLoop` | FSM: IDLE → WAKING → EXECUTING → IDLE | Todos los anteriores |

### Fase 5 — PWA integración

| Componente | Responsabilidad |
|-----------|----------------|
| `useRealtimeLotes()` (composable) | Suscribe a `lotes_snapshots` Realtime |
| `useRealtimeConfig()` | Suscribe a `configuracion` |
| `useManualTrigger()` | POST a `task_queue` con `type=EXECUTE_ROTATION` |
| `DashboardView` enriquecido | Muestra pool real desde Supabase |
| `ConfiguracionView` funcional | Lee/escribe config desde Supabase |
| `HistorialView` funcional | Lista `logs_inscripcion` |
| Manifest + Service Worker | PWA instalable |

## Reglas arquitectónicas (NO ROMPER)

1. **El Orquestador NUNCA importa Supabase directamente.** Solo recibe dependencias por constructor (DIP).
2. **`HttpInjector` no conoce Supabase.** Solo habla con promoritz. La persistencia es responsabilidad de `LogWriter`.
3. **`SessionManager` es el único que lee `secrets`.** Ningún otro módulo accede a credenciales.
4. **Los módulos del `agent` no importan de la PWA.** Y viceversa. Solo comparten `@echo-alfa-ritz/shared`.
5. **El `shared` no importa nada del agent ni de la PWA.** Solo tipos, interfaces, reglas puras.
6. **`RetryPolicy` y `RandomDelay` son utilidades puras** (sin estado, sin I/O). Testables sin mocks.

## Riesgos identificados

- **No tenemos un proyecto Supabase real todavía.** El `secrets`, `task_queue` etc. son tipos en shared; las tablas reales se crean en otro paso. **Bloqueador para Fase 3+** (necesitamos URL + anon key).
- **No hemos probado contra promoritz real.** El `HttpInjector` está validado contra el contrato (website-info.md) y mockeado. La primera ejecución real puede revelar:
  - Nombre exacto de la cookie de sesión
  - CSRF tokens rotativos
  - Rate limits reales del servidor
- **El login usa solo email** — sin contraseña. Esto depende del flujo real; si el servidor cambió a OAuth/2FA, hay que descubrir.

## Orden de implementación recomendado

1. **Tests faltantes de validadores** (`esProductoValido`, `esFormatoLoteValido`) — 30 min
2. **`RetryPolicy` + `RandomDelay`** — 1 hora (testeable sin red)
3. **`ProfileReader`** — 1.5 horas (testeable con fetch mockeado)
4. **Decidir sobre Supabase**: ¿existe ya el proyecto? ¿Credenciales disponibles? — bloqueador
5. **Si sí Supabase**: Fase 3 completa + Realtime listener
6. **Si no Supabase**: trabajar con SQLite local + driver simple, dejar Supabase como capa posterior (DIP ya está)
7. **PWA enriquecida**: composables + vistas reales

## Métrica de éxito

- Tests: >40 (actuales 20)
- Cobertura: >80% en módulos de inyección/distribución (testeable)
- Typecheck verde en los 3 paquetes
- Una ejecución real exitosa end-to-end (login + leer perfil + calcular cola + 1 inyección + log)