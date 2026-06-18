# 📋 WEBSITE-INFO.md - Contexto Técnico del Agente

## 🌐 Información General
- **Dominio**: `https://promoritz.com/ec`
- **Framework**: Next.js (App Router) con Turbopack
- **Base Path**: `/ec/`
- **Autenticación**: Basada en cookies de sesión (login con solo email)
- **Arquitectura**: API REST con endpoints JSON (no Server Actions)

---

## 🔐 Autenticación

### Login
- **Endpoint**: `POST /ec/api/users/login`
- **Headers**:
  ```
  Content-Type: application/json
  ```
- **Payload**:
  ```json
  {
    "email": "tu@email.com"
  }
  ```
- **Respuesta**: Devuelve una cookie de sesión (`Set-Cookie`) que el agente debe mantener en todas las peticiones posteriores.
- **Comportamiento**: Autenticación simple, solo requiere email. La cookie autentica todas las operaciones.

---

## 📦 Gestión de Lotes

### 1. Envío de Lote
- **Endpoint**: `POST /ec/api/lotes`
- **Headers**:
  ```
  Content-Type: application/json
  Cookie: [la cookie de sesión]
  ```
- **Payload**:
  ```json
  {
    "lote": "AB123456789",   // 2 letras + 9 dígitos (formato fijo)
    "product": "Mini Ritz"   // nombre del producto (debe coincidir con dropdown)
  }
  ```
- **Validaciones observadas**:
  - ✅ Formato: 2 letras + 9 dígitos.
  - ✅ Producto: debe ser uno de los valores permitidos.
  - ❌ No valida duplicados (se puede enviar el mismo lote múltiples veces).
  - ✅ Límite diario: 12 envíos por usuario.

### 2. Respuestas del Servidor

#### ✅ Éxito (lote ingresado)
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

#### ⛔ Límite Diario Alcanzado
```json
{
  "limite": true,
  "total": 12,
  "message": "limit"
}
```

#### ❌ Error (formato inválido, producto incorrecto)
- HTTP 400 con mensaje de error específico.

---

## 👤 Consulta de Lotes Registrados

### 3. Ver Perfil (HTML - SSR)
- **Endpoint**: `GET /ec/perfil`
- **Headers**:
  ```
  rsc: 1
  next-router-state-tree: [encoded tree]
  next-url: /participar
  Cookie: [la cookie de sesión]
  ```
- **Comportamiento**: Next.js renderiza la página en el servidor (SSR). Los datos vienen inyectados en el HTML, no hay una llamada XHR/Fetch separada.

### 4. Estructura HTML para extraer datos
El número de lotes registrados está en:
```html
<div class="text-primary bg-[#F5F5F5] w-full h-fit py-3 font-bold flex items-center justify-center text-center text-2xl">
  6
</div>
```

**Datos personales del usuario**:
```html
<div class="bg-[#F5F5F5] py-6 text-center rounded-bl-3xl rounded-br-3xl relative">
  <p class="font-bold text-primary">Nombres:</p>
  <p class="border-b pb-3 border-primary">Alfa</p>
  <p class="pt-4 font-bold text-primary">Apellidos:</p>
  <p class="border-b pb-3 border-primary">Beta</p>
  <p class="pt-4 font-bold text-primary">Cédula</p>
  <p class="border-b pb-3 border-primary">1805060075</p>
  <!-- ... más campos -->
</div>
```

---

## 🎯 Reglas de Negocio Conocidas

### Límite Diario
- **Máximo**: 12 envíos por día por usuario.
- **Reinicio**: Cada día a las 00:00 (hora local).
- **Detección**: El servidor responde con `{ "limite": true, "total": 12, "message": "limit" }`.

### Validaciones del Servidor
1. ✅ Formato del lote: 2 letras + 9 dígitos.
2. ✅ Producto válido (de los disponibles en dropdown).
3. ❌ No valida duplicados (se pueden repetir).

### Comportamiento del Sistema
- La cookie de sesión es **obligatoria** para todas las peticiones autenticadas.
- El login es simple (solo email).
- El sistema usa API REST (no Server Actions).

---

## 🛠️ Estrategia de Automatización

### Flujo de Trabajo del Agente
1. **Login**: Obtener cookie de sesión con `POST /api/users/login`.
2. **Validar Límite**: 
   - Opción A: Consultar endpoint GET de lotes (si existe).
   - Opción B: Scrapear HTML de `/perfil` para obtener número actual.
3. **Calcular Rotación**: Aplicar lógica de distribución de lotes (pool ≤ 30, máximo 12/día).
4. **Ejecutar Envíos**: 
   - Enviar cada lote con `POST /api/lotes`.
   - Esperar `delay` configurable entre envíos.
   - Detenerse al recibir `{ "limite": true }`.
5. **Registrar**: Guardar logs de éxito/fallo en base de datos local.

### Configuraciones desde PWA
- ✅ Activar/desactivar tarea automática.
- ✅ Delay entre envíos.
- ✅ Fecha de caducidad (opcional).

---

## 📦 Productos Válidos (Dropdown)
Los productos disponibles en el dropdown de `/participar` incluyen (ejemplos):
Aquí tienes la lista de los productos extraídos del código HTML:

* Mini Ritz
* Ritz Jalapeño 75gr
* Ritz Jalapeño 180gr
* Ritz 20g
* Ritz queso 30g
* Ritz 52.5g
* Ritz 70g
* Ritz queso 75g
* Ritz 120g
* Ritz 180g


**Nota**: El agente debe usar exactamente el nombre del producto como aparece en el dropdown.

---

## 🧪 Resumen de Endpoints Confirmados

| Función | Método | URL | Payload | Notas |
|---------|--------|-----|---------|-------|
| Login | `POST` | `/ec/api/users/login` | `{ "email": "..." }` | Devuelve cookie de sesión |
| Enviar Lote | `POST` | `/ec/api/lotes` | `{ "lote": "...", "product": "..." }` | Respuesta éxito o límite |
| Ver Perfil | `GET` | `/ec/perfil` | (vía headers RSC) | SSR, datos en HTML |

---

## ⚠️ Consideraciones para el Agente

- **Cookie Management**: Usar `requests.Session()` para mantener cookies automáticamente.
- **Rate Limiting**: Implementar delays entre peticiones (5-10 segundos recomendado).
- **Manejo de Errores**: Reintentar 2-3 veces en caso de timeout o errores transitorios pero detenerse si ya se llego al limite.
- **Detección de Límite**: Detener ejecución al recibir `{ "limite": true }`.
- **Logging**: Registrar cada envío (éxito/fallo) con timestamp.

---

## 🎯 Próximos Pasos para el Agente

1. ✅ **Login** implementado y probado.
2. ✅ **Envío de lote** implementado y probado.
3. ⏳ **Consulta de lotes** (pendiente de descubrir endpoint o scraping).
4. ⏳ **Lógica de rotación** (implementar distribución equitativa).
5. ⏳ **Tarea programada** (automatización diaria).
6. ⏳ **Integración con PWA** (configuraciones desde frontend).

---
