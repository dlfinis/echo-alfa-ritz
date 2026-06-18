# Plan de Implementación — Echo-Alfa-Ritz

> **Arquitectura actual**: PWA pura, sin backend. Deploy target: Cloudflare Pages.

## Estado al cierre del refactor

- ✅ pnpm workspace con 2 paquetes (`packages/shared/`, `pwa/`)
- ✅ `packages/shared`: dominio cohesivo, `RotacionCiclicaRule` con 9 tests
- ✅ `pwa/src/api/`: `InMemoryCookieJar`, `HttpInjector`, `ProfileReader`, `ExecutionOrchestrator`, `SupabaseLogWriter`
- ✅ `pwa/src/composables/`: `useSupabase`, `useConfiguracion`, `usePoolLotes`, `useHistorial`, `useRotationRunner`
- ✅ `pwa/src/views/`: Dashboard, Historial, Configuración funcionales (Realtime + Supabase)
- ✅ `supabase/migrations/001_initial_schema.sql`: 3 tablas + Realtime + RLS
- ⏳ **Pendiente**: aplicar migration SQL en Supabase; primer login real contra promoritz

## Diagrama de la nueva arquitectura

```
                 ┌─────────────────────────────────────────────┐
                 │            Cloudflare Pages                 │
                 │           (static + edge SSR)               │
                 │                                             │
                 │   ┌─────────────────────────────────────┐   │
                 │   │  PWA (Vue 3 SPA)                    │   │
                 │   │                                     │   │
                 │   │  src/api/                           │   │
                 │   │   • HttpInjector ──┐                │   │
                 │   │   • ProfileReader ─┤                │   │
                 │   │   • Orchestrator   │                │   │
                 │   │   • CookieJar      │                │   │
                 │   │                    │ HTTPS          │   │
                 │   │  src/composables/  │ (CORS OK?)     │   │
                 │   │   • useRotationRunner              │   │
                 │   │   • usePoolLotes   │                │   │
                 │   │   • useConfig       │                │   │
                 │   │   • useHistorial   │                │   │
                 │   │                    │                │   │
                 │   └─────────────┬──────┴────────────────┘   │
                 │                 │                           │
                 └─────────────────┼───────────────────────────┘
                                   │
                ┌──────────────────┴───────────────────┐
                ▼                                      ▼
   ┌────────────────────────┐            ┌────────────────────────┐
   │  promoritz.com/ec      │            │  Supabase              │
   │  /api/users/login      │            │  • pool_lotes          │
   │  /api/lotes            │            │  • configuracion       │
   │  /perfil (SSR)         │            │  • logs_inscripcion    │
   │                        │            │  + Realtime pub/sub    │
   └────────────────────────┘            └────────────────────────┘
```

## Stack final

| Capa | Tecnología | Razón |
|------|-----------|-------|
| Build | pnpm + Vite + TypeScript estricto | monorepo simple, TS atrapó bugs temprano |
| UI | Vue 3 (Composition API) + PrimeVue + Tailwind v4 | PrimeVue da componentes listos, Tailwind utility-first |
| Persistencia | Supabase (Postgres + Realtime) | sin backend propio, realtime nativo |
| Deploy | Cloudflare Pages | edge global, gratis, SSL automático |
| Tests | Vitest + fetch mockeado | mismo runner para unit/integration, sin red |

## Estructura de carpetas

```
echo-alfa-ritz/
├── pnpm-workspace.yaml
├── package.json                 # root scripts (dev, build, test)
├── tsconfig.base.json
├── .env.example / .env.local    # Supabase URL + key
├── docs/
│   └── PLAN.md                  # este archivo
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── lote.ts          # Lote, Producto, PRODUCTOS_VALIDOS, validadores
│       │   ├── api.ts           # LoteEnviado, LimiteAlcanzado, PerfilSnapshot
│       │   ├── injection.ts     # InjectionResult, QueueItem, INJECTION_RESULT enum
│       │   ├── interfaces.ts    # IInjectionStrategy, IRotationRule, LogWriter
│       │   ├── distribution.ts  # RotacionCiclicaRule (pure logic)
│       │   ├── types.ts         # ConfiguracionSistema, LogInscripcion
│       │   ├── index.ts         # barrel
│       │   └── distribution.test.ts
│       ├── package.json
│       └── tsconfig.json
└── pwa/
    ├── index.html
    ├── package.json
    ├── vite.config.ts           # vue + tailwind + alias
    ├── tsconfig.json
    ├── env.d.ts
    ├── src/
    │   ├── main.ts              # createApp + PrimeVue + router + style
    │   ├── App.vue              # shell con header navy
    │   ├── router.ts
    │   ├── style.css            # tailwind + primary color
    │   ├── api/
    │   │   ├── cookieJar.ts
    │   │   ├── httpInjector.ts + .test.ts
    │   │   ├── profileReader.ts
    │   │   ├── orchestrator.ts + .test.ts
    │   │   ├── supabaseLogWriter.ts
    │   │   └── index.ts
    │   ├── composables/
    │   │   ├── useSupabase.ts
    │   │   ├── useConfiguracion.ts
    │   │   ├── usePoolLotes.ts
    │   │   ├── useHistorial.ts
    │   │   └── useRotationRunner.ts
    │   └── views/
    │       ├── DashboardView.vue
    │       ├── HistorialView.vue
    │       └── ConfiguracionView.vue
```

## Principios SOLID en juego

| Principio | Aplicación |
|-----------|-----------|
| **S (Responsabilidad Única)** | Cada archivo `api/*` hace una cosa. Cada composable encapsula una preocupación. `RotacionCiclicaRule` solo calcula; `HttpInjector` solo inyecta; `ExecutionOrchestrator` solo orquesta. |
| **O (Abierto/Cerrado)** | `IRotationRule` y `IInjectionStrategy` permiten nuevas reglas (`RotacionPorFechaRule`) o estrategias (`PlaywrightInjector`) sin tocar el orquestador. |
| **L (Liskov)** | Cualquier `IInjectionStrategy` sustituye a otra sin que el orquestador lo note. |
| **I (Segregación)** | `CookieJar` y `LogWriter` son interfaces mínimas; cada implementación solo expone lo que necesita. |
| **D (Inversión)** | `useRotationRunner` recibe `HttpInjector` y `SupabaseLogWriter` por composición (vía factory interno). Tests usan `ScriptedInjector` y `MockLogWriter` sin tocar red ni DB. |

## Lo que falta para terminar

### Tareas inmediatas

1. **Aplicar migration en Supabase**
   - Abrir SQL Editor en el dashboard de Supabase
   - Pegar contenido de `supabase/migrations/001_initial_schema.sql`
   - Verificar que las 3 tablas existen: `pool_lotes`, `configuracion`, `logs_inscripcion`

2. **Configurar fila inicial de configuración**
   - La migration siembra una fila vacía
   - Ir a Configuración en la PWA y completar el email

3. **Probar login real contra promoritz**
   - Abrir Dashboard con DevTools
   - Ejecutar carga
   - Verificar en Network tab:
     - `POST /ec/api/users/login` → 200 OK + Set-Cookie
     - `POST /ec/api/lotes` → ¿qué status? ¿CORS error?
   - Si hay CORS error → evaluar Cloudflare Worker como proxy

### Features pendientes

- [ ] **Importar pool desde CSV** (botón en Dashboard que lee un archivo con números)
- [ ] **Botón de pausar** durante una rotación larga
- [ ] **Notificación push** cuando se completa una rotación (PWA install + service worker)
- [ ] **Scheduler** (Web Worker en el browser que dispara la tarea a la hora configurada)

### Riesgos activos

| Riesgo | Mitigación |
|--------|-----------|
| CORS bloqueado por promoritz en producción | Migrar a Cloudflare Worker como proxy |
| Cookies httpOnly (no capturables desde JS) | Misma mitigación: Worker server-side |
| Límite de tiempo de ejecución en el browser (pestaña cerrada) | Service Worker con Background Sync API |
| Realtime desconectado por timeout | Reconexión automática que Supabase maneja, pero revisar logs |

## Cómo arrancar

```bash
# 1. instalar deps
pnpm install

# 2. levantar PWA en dev
pnpm dev
# → http://localhost:3000

# 3. tests
pnpm test
# → shared: 9, pwa/api: 14+ tests

# 4. typecheck
pnpm typecheck
```