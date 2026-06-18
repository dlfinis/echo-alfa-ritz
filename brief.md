# BRIEF DE PROYECTO: ECHO-ALFA-RITZ
**Versión:** 1.1 (Actualizado)  
**Fecha:** 18 de Junio de 2026  
**Arquitectura:** Backend + Supabase + PWA

---

## 1. Contexto y Justificación

Actualmente, la gestión de lotes en `promoritz.com/ec` se realiza de forma manual. La plataforma permite ingresar un máximo de **12 números de lote por día**. El usuario posee un pool acotado de aproximadamente **30 números**, los cuales deben ser rotados cíclicamente para asegurar una distribución equitativa en el tiempo.

El proceso manual es tedioso, propenso a errores (duplicados, omisiones) y consume tiempo valioso. Se requiere un sistema autónomo que gestione la cola, calcule la distribución diaria y ejecute la carga en segundo plano, ya sea por orden del usuario o mediante una tarea programada.

**Restricción clave:** No se busca un sistema de inferencia predictiva (AI/ML). La "investigación" se limitará a la fase de desarrollo para descubrir el mecanismo de envío de datos de la web objetivo. Una vez descubierto, la operación es puramente lógica y secuencial.

---

## 2. Objetivos del Proyecto

1. **Automatizar la carga diaria**: Distribuir automáticamente los lotes disponibles para cumplir con el cupo de 12 ingresos diarios.
2. **Centralizar la gestión**: Proveer una PWA que sirva como tablero de control único para visualizar el estado de los lotes y configurar el sistema.
3. **Garantizar la equidad**: Aplicar un algoritmo de rotación que asegure que todos los lotes del pool sean inscritos la misma cantidad de veces a lo largo del ciclo.
4. **Asegurar la mantenibilidad**: Diseñar la arquitectura del backend bajo principios **SOLID** para facilitar futuras extensiones o cambios en la lógica de negocio sin afectar el núcleo del sistema.

---

## 3. Alcance del Proyecto (In/Out)

**Dentro del alcance:**
- Desarrollo de una PWA instalable.
- Configuración de un backend agente alojado en Homelab.
- Implementación de la lógica de rotación (máx 30 lotes, límite 12/día).
- Modo de ejecución manual (botón) y automático (programado a las 00:00 AM).
- Panel de configuración (activar/desactivar tarea, delay, fecha de fin).
- Almacenamiento de histórico de cargas.

**Fuera del alcance:**
- Reconocimiento óptico de caracteres (OCR) o captura de datos desde PDFs.
- Conexión con otros sistemas externos (bancos, ERP).
- Escalabilidad para más de 100 lotes (el diseño está pensado para el pool limitado a ~30).

---

## 4. Reglas de Negocio (La Lógica del Pool)

El sistema operará bajo un pool de **máximo 30 números de lote activos**.

- **Cálculo de la Cuota Diaria (12)**: 
  - Sea `N` = número total de lotes activos en el pool.
  - Si `N >= 12`: Se seleccionan los primeros 12 de la lista (orden de prioridad) y se inscriben **1 vez** cada uno.
  - Si `N < 12`: Se calcula la distribución exacta para llegar a 12.
    - `Repeticiones Base = 12 / N` (división entera).
    - `Sobrantes = 12 % N`.
    - Los primeros `Sobrantes` lotes recibirán `Repeticiones Base + 1` inscripciones.
    - El resto recibirá `Repeticiones Base` inscripciones.

- **Orden de Ejecución (Secuencial)**: La cola de inscripciones se genera en orden estricto y cíclico. 
  - *Ejemplo*: Pool = [A, B, C, D] (N=4). Repeticiones = 3. La cola será: A, B, C, D, A, B, C, D, A, B, C, D.
  - *Ejemplo con sobrantes*: Pool = [1,2,3,4,5,6,7] (N=7). Base=1, Sobrantes=5. Cola: 1,2,3,4,5,6,7,1,2,3,4,5 (12 items).

- **Estado y Rotación**: El sistema no almacena un índice de "último usado" para el día siguiente. La lógica de distribución se aplica desde el principio del pool cada día, asegurando que todos los activos tengan la misma oportunidad de inscripción a lo largo del tiempo (rotación pura).

---

## 5. Fase de Investigación - Descubrimiento de Endpoints (COMPLETADO)

La fase de investigación ha concluido exitosamente. Se ha confirmado que `promoritz.com/ec` utiliza **API REST convencional** y no Server Actions de Next.js para las operaciones críticas.

### Hallazgos Clave

**1. Autenticación**
- **Endpoint**: `POST /ec/api/users/login`
- **Payload**: `{ "email": "tu@email.com" }`
- **Mecanismo**: Autenticación basada en cookies de sesión.
- **Comportamiento**: Login simple sin contraseña. La cookie de sesión es el único mecanismo de autenticación para operaciones posteriores.

**2. Envío de Lotes**
- **Endpoint**: `POST /ec/api/lotes`
- **Headers requeridos**: 
  - `Content-Type: application/json`
  - `Cookie: [cookie de sesión]`
- **Payload**: 
  ```json
  {
    "lote": "AB123456789",   // 2 letras + 9 dígitos
    "product": "Mini Ritz"   // nombre del producto del dropdown
  }
  ```
- **Validaciones observadas**:
  - ✅ Formato: 2 letras + 9 dígitos.
  - ✅ Producto: debe ser uno de los valores permitidos en el dropdown.
  - ❌ No valida duplicados (acepta el mismo lote múltiples veces).
  - ✅ Límite diario: 12 envíos por usuario.

**3. Respuestas del Servidor**
- **Éxito**:
  ```json
  {
    "brand": "Ritz",
    "product": "Mini Ritz",
    "lote": "AB123456789",
    "username": "Alfa Beta",
    "userId": "102c89f0-3006-436e-9cdc-d74c6aa8656f",
    "whatsapp": true,
    "isReemplazo": false,
    "referredBy": null,
    "id": "cd14a180-c951-4ec6-abdd-0837754b0597",
    "createdAt": "2026-06-18T23:30:32.448Z"
  }
  ```

- **Límite Alcanzado**:
  ```json
  {
    "limite": true,
    "total": 12,
    "message": "limit"
  }
  ```

- **Error**: HTTP 400 con mensaje descriptivo (formato inválido, producto incorrecto, etc.)

**4. Consulta de Lotes Registrados**
- **Método**: `GET /ec/perfil?_rsc=[hash]` (SSR - Server Side Rendering)
- **Headers requeridos**:
  ```
  rsc: 1
  next-router-state-tree: [encoded tree]
  next-url: /participar
  Cookie: [cookie de sesión]
  ```
- **Comportamiento**: Next.js renderiza la página en el servidor. Los datos del usuario (número de lotes registrados, datos personales) vienen inyectados en el HTML. No hay una llamada XHR/Fetch separada.
- **Extracción de datos**: El número de lotes registrados se encuentra en:
  ```html
  <div class="text-primary bg-[#F5F5F5] w-full h-fit py-3 font-bold flex items-center justify-center text-center text-2xl">
    6
  </div>
  ```

### Decisión Estratégica

Basado en los hallazgos:
- **Estrategia seleccionada**: **Plan A (HTTP Directo)**
- **Justificación**: La plataforma utiliza API REST con endpoints JSON claros y autenticación por cookie, lo que permite operaciones simples y rápidas sin necesidad de navegador headless.
- **Implementación**: El agente usará `requests.Session()` en Python para mantener la cookie de sesión y realizar peticiones HTTP directas.

### Endpoints Pendientes de Confirmación

Aunque la consulta de datos se realiza vía SSR, el agente intentará los siguientes endpoints para obtener datos estructurados:

| Método | URL | Propósito |
|--------|-----|-----------|
| `GET` | `/ec/api/lotes` | Listar todos los lotes del usuario |
| `GET` | `/ec/api/lotes/mis-lotes` | Alternativa para listar lotes |
| `GET` | `/ec/api/lotes/usuario` | Otra variante posible |

**Fallback**: Si los endpoints API no existen, se utilizará scraping del HTML de `/perfil` para obtener:
- Número de lotes registrados.
- Datos del usuario (nombres, cédula, email, etc.).

---

## 6. Arquitectura del Sistema (El Triángulo)

El ecosistema se compone de tres capas diferenciadas:

- **Capa de Estado y Memoria (Supabase)**:
  - Almacena el pool de lotes, el historial de cargas, las credenciales cifradas (para Promoritz), y las configuraciones de usuario (delay, fecha de fin, estado del temporizador).
  - Actúa como el "buzón" de tareas, permitiendo la comunicación asíncrona entre la PWA y el Homelab mediante cambios en tiempo real (Realtime).

- **Capa de Lógica y Ejecución (Homelab + Agente)**:
  - Servidor local (o contenedor Docker) con dominio expuesto.
  - Contiene el **Orquestador** y el **Agente Worker**.
  - Sus responsabilidades: Escuchar la cola de tareas, calcular la distribución diaria, gestionar la sesión contra Promoritz (login y renovación), y ejecutar la inyección de los lotes usando la estrategia descubierta (HTTP directo).

- **Capa de Interfaz Humana (PWA)**:
  - Aplicación web progresiva instalable en dispositivo móvil/PC.
  - Muestra el estado de los lotes, permite el disparo manual y provee el panel de configuración.

---

## 7. Especificaciones Funcionales de la PWA

La PWA será el centro de comando para el usuario:

- **Dashboard de Lotes**: 
  - Visualización en lista del pool de lotes con indicador de estado (Activo/Inactivo).
  - Indicador de "Última inscripción" o "Inscrito hoy".

- **Historial de Cargas**: 
  - Registro cronológico con fecha, lista de lotes cargados, estado (Éxito/Error) y mensajes de debug.

- **Panel de Configuración**:
  - **Interruptor General**: Activar/Desactivar la tarea programada.
  - **Hora de Ejecución**: Fija (12:00 AM), aunque se deja paramétrica por si se desea cambiar.
  - **Fecha de Caducidad**: Campo para configurar el último día de ejecución automática (ej: 31/12/2026). Pasada esta fecha, el agente ignora la tarea automática.
  - **Delay entre Registros**: Input numérico (en segundos) para pausar la ejecución entre lote y lote (Recomendado: 3-6 segundos para evitar bloqueos anti-bot).
  - **Selector de Estrategia**: Dropdown para forzar el uso de "HTTP Directo" o "Navegador" (útil si la plataforma cambia y la detección automática no es suficiente).

- **Acción Manual**: Botón grande "Ejecutar Carga Ahora". Ignora la fecha de caducidad y ejecuta la rotación al instante.

---

## 8. Aplicación de Principios SOLID (Diseño del Backend)

Para garantizar que el sistema sea mantenible y extensible, el diseño del Agente en el Homelab se basará en estos principios:

1. **S (Responsabilidad Única)**:
   - `SessionManager`: Gestiona login y cookies.
   - `DistributionCalculator`: Calcula la cola de 12 items.
   - `LoteInjector`: Envía lotes vía HTTP.
   - `SchedulerModule`: Evalúa si es hora de ejecutar.
   - `ExecutionOrchestrator`: Coordina el flujo general.

2. **O (Abierto/Cerrado)**:
   - El sistema está abierto para nuevas reglas de distribución implementando `IRotationRule`.

3. **L (Sustitución de Liskov)**:
   - `HttpInjector` y `BrowserInjector` son intercambiables. El sistema no distingue cuál está activo.

4. **I (Segregación de Interfaces)**:
   - El `Scheduler` solo conoce `IExecutable`, no detalles de implementación.

5. **D (Inversión de Dependencias)**:
   - Los módulos de alto nivel dependen de abstracciones (interfaces) y no de implementaciones concretas.

---

## 9. Flujo de Datos (Secuencia del Día a Día)

1. **Medianoche (00:00) o Click Manual**: El `Scheduler` o el usuario activan la tarea.
2. **Cálculo**: El `DistributionCalculator` consulta Supabase, obtiene los lotes activos y genera la cola exacta de 12 ítems (con sus repeticiones).
3. **Autenticación**: El `SessionManager` valida la sesión en Promoritz. Si expiró, renueva el login automáticamente (`POST /api/users/login`).
4. **Ejecución**: El `ExecutionOrchestrator` itera sobre la cola. Por cada ítem:
   - Espera el tiempo de `delay` configurado.
   - Envía el lote a `POST /api/lotes`.
   - Registra el resultado en la tabla `logs_inscripcion`.
5. **Detección de Límite**: Si recibe `{ "limite": true, "total": 12, "message": "limit" }`, detiene la ejecución.
6. **Finalización**: Actualiza los estados en Supabase. La PWA (suscrita a Realtime) muestra la actualización al instante.

---

## 10. Consideraciones de Seguridad y Estabilidad

- **Manejo de Credenciales**: Las credenciales (email) se almacenan cifradas en Supabase.
- **Tolerancia a Fallos**: Si un lote específico falla, el sistema lo registra pero **continúa con el siguiente** para no bloquear toda la carga diaria.
- **Anti-Bloqueo (Rate Limiting)**: El delay configurable (3-6 segundos) es la principal defensa.
- **Renovación de Sesión**: Si la cookie expira (detectado por 401), el agente renueva automáticamente con `POST /api/users/login`.
- **Manejo del Límite**: Al recibir `{ "limite": true }`, el agente detiene la ejecución y registra que el límite se alcanzó.

---

## 11. Resumen de Endpoints Confirmados

| Función | Método | URL | Headers | Payload | Respuesta |
|---------|--------|-----|---------|---------|-----------|
| **Login** | `POST` | `/ec/api/users/login` | `Content-Type: application/json` | `{ "email": "..." }` | Cookie de sesión |
| **Enviar Lote** | `POST` | `/ec/api/lotes` | `Content-Type: application/json` + Cookie | `{ "lote": "...", "product": "..." }` | Éxito o límite |
| **Ver Perfil** | `GET` | `/ec/perfil` | `rsc: 1` + Cookie | - | HTML con datos del usuario |

---

## 12. Glosario de Términos Técnicos

- **PWA**: Progressive Web App.
- **Supabase**: Backend-as-a-Service (PostgreSQL + Realtime + Auth).
- **Homelab**: Servidor físico o virtual dentro de la red local, expuesto con dominio público.
- **SSR (Server Side Rendering)**: Renderizado en el servidor de Next.js, los datos vienen en el HTML inicial.
- **RSC (React Server Components)**: Componentes de React que se ejecutan en el servidor.
- **REST API**: API que sigue principios REST, con endpoints claros y JSON.
- **Cookie de Sesión**: Mecanismo de autenticación basado en cookies HTTP.
- **SOLID**: Principios de diseño orientado a objetos (Single responsibility, Open-closed, Liskov substitution, Interface segregation, Dependency inversion).
