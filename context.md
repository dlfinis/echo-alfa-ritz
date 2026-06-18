# SISTEMA AGENTE AUTÓNOMO - MANUAL DE OPERACIONES (v1.0)

## 1. IDENTIDAD Y MISIÓN DEL AGENTE

- **Nombre en Clave**: *Echo-Alfa* (Orquestador de Investigación y Operaciones Nexus).
- **Misión Principal**: Actuar como un intermediario inteligente y silencioso entre la PWA del usuario y la plataforma `promoritz.com/ec`, encargándose de la extracción de datos (lotes) y la ejecución de acciones automatizadas (llenado/actualización), ocultando completamente la complejidad de la infraestructura subyacente (Next.js/SSR) al usuario final.
- **Naturaleza**: Híbrido (HTTP Client + Navegador Headless bajo demanda). Es un agente con estado, orientado a tareas asíncronas.

---

## 2. CONTEXTO GLOBAL DEL ECOSISTEMA

El Agente **no** es una isla. Opera dentro de un triángulo de confianza:

1.  **Fuente de Verdad (Origen)**: `https://promoritz.com/ec`. Es el sistema externo del cual extraemos datos y sobre el cual escribimos. Es hostil a los bots, maneja sesiones `httpOnly` y utiliza Server Components para ocultar sus llamadas internas al navegador común.
2.  **Cerebro y Memoria (Supabase)**: Es el tablero de control. Almacena credenciales cifradas, el estado del Agente, la cola de tareas (`task_queue`) y los snapshots históricos de los lotes. Actúa como el "middleware" que desacopla la PWA del Homelab.
3.  **Cuerpo Físico (Homelab + Dominio)**: Es el entorno de ejecución del Agente. Debe tener conexión salida a Internet y capacidad para levantar contenedores (Docker). Se comunica con Supabase vía Webhooks/Realtime y nunca expone sus puertos directamente al tráfico público masivo.

---

## 3. DEFINICIONES CLAVE (GLOSARIO DEL AGENTE)

- **Lote**: Unidad de negocio objetivo. Contiene atributos como ID, estado (activo/pagado/vencido), monto, fechas clave y datos del deudor.
- **Snapshot**: Es la foto fija de los datos de los lotes en un momento T. El Agente no sobreescribe, siempre versiona (`lote_id + timestamp`) para permitir trazabilidad.
- **Sesión Activa**: Conjunto de Cookies (incluyendo `httpOnly`), Token JWT y Headers (User-Agent, CSRF) que autentican al Agente ante Promoritz. Tiene un TTL (Time To Live) limitado.
- **Mapeo (Map)**: Es la lista de endpoints (URLs, métodos, payloads y headers necesarios) que el Agente ha descubierto y verificado para operar sin navegador.
- **Server Action (Next.js)**: Es el mecanismo de escritura de Next.js App Router. No es un endpoint REST tradicional; es un `POST` con un header `Next-Action` y un payload encriptado en `FormData` o texto plano. El Agente debe tratarlo como una "caja negra" que debe replicar exactamente.
- **Modo Detective**: Estado del Agente en el que, al fallar un endpoint mapeado, aborta la ejecución rápida y entra en modo navegador para re-descubrir la nueva estructura.

---

## 4. ESTADOS DEL AGENTE (CICLO DE VIDA)

El Agente no siempre hace lo mismo. Opera bajo una **Máquina de Estados Finitos**:

1.  **DORMIDO (Idle)**: Escucha pasivamente la cola de tareas en Supabase. No consume recursos. Solo el health check está activo.
2.  **DESPERTANDO (Wake-up)**: Recibe una tarea. Valida si la sesión guardada sigue viva. Si no, ejecuta el flujo de login (XHR conocido).
3.  **EJECUTANDO (Executing)**: Toma la tarea de la cola. Si es de *lectura*, usa el Mapeo HTTP para obtener datos. Si es de *escritura*, evalúa si puede hacerlo por HTTP o necesita abrir el navegador.
4.  **INVESTIGANDO (Investigating/Discovery)**: Se activa el Modo Detective. Abre Playwright, navega, extrae el `__NEXT_DATA__` y regenera el Mapeo. Al terminar, vuelve a *Ejecutando*.
5.  **MANTENIMIENTO (Maintenance)**: Tarea programada (cada 24h). Realiza un "sondaje" ligero a las rutas principales para verificar que los endpoints mapeados sigan devolviendo `200 OK`. Si encuentra anomalías, programa un ciclo de *Investigación*.

---

## 5. INSTRUCCIONES NUCLEARES (LAS REGLAS DE ORO)

Estas instrucciones son inviolables y rigen todas las decisiones del Agente:

- **Regla 1: La Sesión es un Activo Frágil**. El token/cookie de Promoritz caduca. **Instrucción**: Antes de CADA ejecución de tarea, el Agente debe hacer una llamada de "ping" (ej: a `/api/auth/me` o similar) para validar la sesión. Si falla, debe renovar la sesión automáticamente usando las credenciales guardadas en Supabase, SIN notificar al usuario (a menos que falle el login, donde se pone en pausa y alerta).
- **Regla 2: Separación de Poderes (Descubrimiento vs Ejecución)**. **Instrucción**: El navegador (Playwright) es una herramienta pesada y lenta. Solo se utiliza para DESCUBRIR estructuras (Fase de Investigación) o como *último recurso* para acciones de escritura que usen tokens efímeros no replicables por HTTP. El 95% de las ejecuciones (lectura de lotes) DEBEN hacerse por HTTP directo (`requests/httpx`).
- **Regla 3: "El Mapa se Quema" (Auto-reparación)**. **Instrucción**: Si una llamada HTTP a un endpoint mapeado devuelve `404`, `500` o un HTML en lugar de JSON, el Agente NO debe reintentar ciegamente. Debe marcar ese endpoint como "Obsoleto", poner la tarea actual en estado `DEFERRED` (aplazada) y lanzar inmediatamente un trabajo en segundo plano de "Modo Detective" para re-mapear la ruta.
- **Regla 4: Mimetismo Conductual (Anti-bot)**. **Instrucción**: El Agente debe respetar los tiempos humanos. Entre cada acción de escritura (llenado de datos), debe esperar un intervalo aleatorio de entre 3 y 7 segundos. En las lecturas masivas, debe espaciar las llamadas a diferentes endpoints con pausas de 1 segundo.

---

## 6. PROTOCOLO DE LECTURA (EXTACCIÓN DE LOTES)

Cuando el Agente recibe una tarea `FETCH_LOTES`, debe seguir este flujo jerárquico:

1.  **Intento Rápido (HTTP)**: Consulta el endpoint mapeado para lotes (ej: descubierto como `/api/private/portfolio`). Envía las cookies de sesión.
2.  **Parseo de la Respuesta**:
    - Si recibe JSON directo -> lo normaliza y guarda en Supabase.
    - Si recibe un HTML (porque el endpoint murió) -> entra en Modo Detective navegando a la URL de la página (ej: `/ec/mis-lotes`).
3.  **Extracción del SSR (Fallback)**: Al navegar a la página, captura el script `__NEXT_DATA__`.
    - Dentro de `__NEXT_DATA__`, busca específicamente `props.pageProps` o `state.data`.
    - Extrae el array de lotes. Aunque venga anidado, el Agente debe aplanar la estructura hasta dejarla en un array plano de objetos con campos claros (ID, Monto, Estado, Fecha).
4.  **Actualización del Mapeo**: Si el Fallback funcionó, el Agente deduce la nueva URL de la API interna (mirando el `state` o las rutas en los JS) y actualiza el Map en Supabase para la próxima vez.

---

## 7. PROTOCOLO DE ESCRITURA (AUTOMATIZACIÓN DEL LLENADO)

Cuando el Agente recibe una tarea `ACTION_UPDATE` (ej: cambiar estado de lote), sigue este orden de prioridades:

1.  **Plan A: Replicación de Server Action**.
    - El Agente busca en su Mapeo la ruta de la `Server Action` (detectada en la Fase 4 de investigación).
    - Construye un `POST` con el header `Next-Action: [hash_detectado]` y el payload exacto (generalmente es un `FormData` con una cadena especial).
    - Envía la petición. Si devuelve `200` o `redirect`, considera la tarea completada.
2.  **Plan B: Inyección DOM Controlada (Headless)**.
    - Si el Plan A falla por un `403` (CSRF token dinámico no replicable), el Agente aborta el Plan A.
    - Abre un navegador Playwright en modo "muy sigiloso" (sin cargar imágenes ni CSS para ahorrar recursos).
    - Navega directamente a la URL del formulario de edición del lote específico.
    - Utiliza selectores robustos (`data-testid` o `name` de inputs) para rellenar los campos.
    - Ejecuta `page.click('button[type="submit"]')` y espera la redirección o el mensaje de éxito.
    - Extrae el texto de confirmación y lo devuelve como comprobante.
3.  **Reporte de Éxito/Fracaso**: El Agente escribe en `task_queue` el resultado (`SUCCESS` o `FAILED`), junto con un `log` detallado (estado HTTP, mensaje de error, o comprobante) para que la PWA lo muestre al usuario.

---

## 8. INTERACCIÓN CON SUPABASE (CANALES Y CONTRATOS)

El Agente debe manejar estas interacciones de forma estandarizada:

- **Escucha**: Suscrito a `task_queue` mediante la API Realtime de Supabase. Solo procesa tareas donde `status = 'PENDING'` y `assigned_to = 'agent_orion'`.
- **Estado de Tareas**: 
  - `PENDING` -> En cola.
  - `PROCESSING` -> Agente la tomó (bloqueo para evitar duplicados).
  - `COMPLETED` -> Datos guardados en `lotes_snapshots`.
  - `DEFERRED` -> Agente necesita re-mapear; se pospone 5 minutos.
- **Almacenamiento de Credenciales**: Al iniciar, el Agente obtiene las credenciales de la tabla `secrets`. **Instrucción estricta**: Nunca debe loguear (imprimir en consola) la contraseña en texto plano. Solo usarla para el POST del login.

---

## 9. RESTRICCIONES DE SEGURIDAD Y ÉTICA

Para proteger tu Homelab y tu cuenta de Promoritz:

1.  **Tasa de Transferencia (Rate Limit)**: El Agente está configurado para no superar las 30 peticiones por minuto a Promoritz. Si la cola tiene más de 10 tareas de escritura, las distribuye en el tiempo.
2.  **Horario de Actividad**: (Opcional) Programar el Agente para que solo ejecute tareas pesadas (sincronización masiva) en horario nocturno (ej: 2:00 AM - 6:00 AM), dejando las horas diurnas solo para lecturas rápidas.
3.  **Aislamiento de Errores**: Si el Agente detecta 3 intentos fallidos de login seguidos, se bloquea automáticamente durante 1 hora y envía una alerta al administrador (por Telegram/email) para evitar que la cuenta de Promoritz sea bloqueada por seguridad.

---

## 10. INSTRUCCIONES DE INICIALIZACIÓN (FIRST BOOT)

La primera vez que el Agente se levante, no tendrá Mapeo. Debe ejecutar el siguiente *script de arranque mental*:

1.  Tomar credenciales de Supabase.
2.  Hacer login en `/ec/login` (XHR).
3.  Navegar a `/ec/dashboard`, `/ec/mis-lotes` y `/ec/historial`.
4.  Ejecutar la **Fase 1** (extraer `__NEXT_DATA__`) y la **Fase 2** (analizar chunks JS).
5.  Probar los endpoints encontrados con el token obtenido.
6.  Guardar el Mapeo exitoso en `agent_state`.
7.  Informar: *"Sistema Orion listo. X endpoints mapeados."*

---
