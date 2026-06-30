<template>
  <div>
    <h2 class="text-2xl font-semibold mb-4 flex items-center gap-2">
      <span>🍪</span> Dashboard de Lotes
    </h2>

    <!-- Supabase error -->
    <div v-if="configError" class="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
      <strong>Supabase no configurado:</strong> {{ configError }}
    </div>

    <!-- Toast -->
    <div
      v-if="toast"
      :class="toast.class"
      class="fixed top-4 right-4 z-40 px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm transition-all"
    >
      <div class="flex items-start gap-2">
        <span class="flex-1">{{ toast.message }}</span>
        <button class="font-bold opacity-70 hover:opacity-100" @click="toast = null">✕</button>
      </div>
    </div>

    <!-- Confirm dialog -->
    <div v-if="showConfirm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showConfirm = false">
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
        <h3 class="text-lg font-semibold mb-3">Confirmar envío</h3>
        <div class="text-sm space-y-2 mb-4">
          <p><strong>Lotes activos:</strong> {{ preview.lotes }}</p>
          <p><strong>Cantidad a enviar:</strong> {{ cantidadAEnviar }}</p>
          <p><strong>Delay:</strong> {{ usarDelayConfig ? 'configurado (3-7s)' : 'modo rápido (100-500ms)' }}</p>
          <p v-if="preview.secuencia"><strong>Secuencia:</strong> {{ preview.secuencia }}</p>
        </div>
        <div class="flex gap-2 justify-end">
          <button class="border px-4 py-2 rounded text-sm" @click="showConfirm = false">Cancelar</button>
          <button class="bg-primary text-white px-4 py-2 rounded text-sm font-semibold" @click="ejecutarConfirmado">Confirmar y Ejecutar</button>
        </div>
      </div>
    </div>

    <!-- Edit modal -->
    <div v-if="editando" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="editando = null">
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-xs w-full">
        <h3 class="text-lg font-semibold mb-3">Editar lote</h3>
        <div class="text-sm space-y-3 mb-4">
          <div>
            <label class="text-xs text-gray-500">Número</label>
            <p class="font-mono">{{ editando.numero }}</p>
          </div>
          <div>
            <label class="text-xs text-gray-500">Producto</label>
            <select v-model="editForm.producto" class="w-full border rounded px-2 py-1">
              <option v-for="p in PRODUCTOS_VALIDOS" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500">Estado</label>
            <select v-model="editForm.estado" class="w-full border rounded px-2 py-1">
              <option value="activo">activo</option>
              <option value="inactivo">inactivo</option>
              <option value="pagado">pagado</option>
              <option value="vencido">vencido</option>
            </select>
          </div>
        </div>
        <div class="flex gap-2 justify-end">
          <button class="border px-4 py-2 rounded text-sm" @click="editando = null">Cancelar</button>
          <button class="bg-primary text-white px-4 py-2 rounded text-sm font-semibold" :disabled="editSaving" @click="guardarEdicion">{{ editSaving ? '…' : 'Guardar' }}</button>
        </div>
      </div>
    </div>

    <!-- Running banner (single account) -->
    <div v-if="runner.state.value.running" class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div class="flex items-start justify-between">
        <div>
          <p class="font-semibold">Ejecutando rotación…</p>
          <p>{{ runner.state.value.current }} / {{ cantidadAEnviar }} — ✅ {{ runner.state.value.success }} · ❌ {{ runner.state.value.failed }} · ⏭️ {{ runner.state.value.skipped }}</p>
        </div>
        <button class="bg-red-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-red-700 transition" @click="runner.cancel()">Cancelar</button>
      </div>
    </div>

    <!-- Running banner (batch multi-cuenta) -->
    <div v-if="batch.batchState.value.running" class="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
      <div class="flex items-start justify-between">
        <div>
          <p class="font-semibold">Ejecutando batch ({{ batch.batchState.value.accountsDone }}/{{ batch.batchState.value.accountsTotal }} cuentas)</p>
          <p class="text-sm">
            ✅ {{ batch.batchState.value.totalSuccess }} · ❌ {{ batch.batchState.value.totalFailed }} · ⏭️ {{ batch.batchState.value.totalSkipped }}
          </p>
          <p v-if="batch.batchState.value.currentAccountEmail" class="text-xs text-gray-500 mt-1">
            Cuenta: {{ batch.batchState.value.currentAccountEmail }}
          </p>
        </div>
        <button class="bg-red-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-red-700 transition" @click="batch.cancel()">Cancelar</button>
      </div>
    </div>

    <!-- Agregar lote -->
    <div class="bg-white rounded-lg shadow p-4 mb-4">
      <h3 class="text-lg font-semibold mb-3">Agregar lote al pool</h3>
      <div class="flex flex-col sm:flex-row gap-2">
        <input v-model="nuevoNumero" type="text" placeholder="AB123456789" maxlength="11" class="flex-1 border rounded px-3 py-2 font-mono" />
        <select v-model="nuevoProducto" class="border rounded px-3 py-2 sm:w-56">
          <option v-for="p in PRODUCTOS_VALIDOS" :key="p" :value="p">{{ p }}</option>
        </select>
        <button class="bg-primary text-white px-4 py-2 rounded font-semibold hover:bg-primary/90 transition disabled:opacity-50" :disabled="!nuevoNumero || !nuevoProducto" @click="agregarLote">Agregar</button>
      </div>
    </div>

    <!-- Controles de ejecución -->
    <div class="bg-white rounded-lg shadow p-4 mb-4">
      <h3 class="text-lg font-semibold mb-3">Controles de ejecución</h3>
      <div class="flex flex-wrap items-end gap-4">
        <div>
          <label class="block text-xs text-gray-600 mb-1">Cantidad</label>
          <input v-model.number="cantidadAEnviar" type="number" min="1" max="12" class="w-20 border rounded px-3 py-2 text-center" />
        </div>
        <div class="flex items-center gap-2 pb-1">
          <input id="useDelay" type="checkbox" v-model="usarDelayConfig" class="w-4 h-4 accent-primary" />
          <label for="useDelay" class="text-sm text-gray-600 select-none">Delay configurado</label>
        </div>
        <div class="text-xs pb-1 flex items-center gap-1">
          <span class="text-base">🍪</span>
          <span :class="pool.hoyCount.value >= 12 ? 'text-red-600 font-bold' : ''">
            Enviadas hoy: {{ pool.hoyCount.value }} / 12
            <span v-if="pool.hoyCount.value >= 12" class="text-red-600"> — ¡Cupo lleno!</span>
            <span v-else class="text-gray-500"> — faltan {{ 12 - pool.hoyCount.value }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Pool de Lotes -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Tarro de Galletas ({{ pool.lotes.value.length }})</h3>
        <span class="text-xs text-gray-500">{{ pool.lotesActivos.value.length }} activas</span>
      </div>

      <!-- Batch actions -->
      <div v-if="selectedIds.size > 0" class="bg-blue-50 border border-blue-200 rounded px-3 py-2 mb-3 flex items-center gap-3 text-sm">
        <span class="font-semibold">{{ selectedIds.size }} seleccionado{{ selectedIds.size > 1 ? 's' : '' }}</span>
        <button class="text-green-700 hover:underline" @click="batchActivar">Activar</button>
        <button class="text-gray-700 hover:underline" @click="batchDesactivar">Desactivar</button>
        <button class="text-red-700 hover:underline" @click="batchBorrar">Borrar</button>
        <button class="text-gray-500 hover:underline ml-auto" @click="selectedIds.clear()">Quitar selección</button>
      </div>

      <div v-if="pool.loading.value" class="text-gray-400">Cargando…</div>
      <div v-else-if="pool.lotes.value.length === 0" class="text-center py-8">
        <div class="text-5xl mb-2 opacity-50">🍪</div>
        <p class="text-gray-500 text-sm">Tu tarro de galletas está vacío</p>
        <p class="text-gray-400 text-xs mt-1">Agregá lotes arriba para empezar a hornear</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm min-w-[480px]">
          <colgroup>
            <col class="w-8" />
            <col class="w-8" />
            <col />
            <col />
            <col class="hidden md:table-column w-16" />
            <col class="w-24" />
          </colgroup>
          <thead class="text-left text-gray-500">
            <tr>
              <th class="py-2"><input type="checkbox" :checked="todosSeleccionados" class="w-4 h-4 accent-blue-600 cursor-pointer" @change="toggleSelectAll" /></th>
              <th class="py-2"></th>
              <th class="py-2">Número</th>
              <th>Producto</th>
              <th class="text-center hidden md:table-cell">Veces</th>
              <th class="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in pool.lotes.value" :key="l.id" class="border-t">
              <td class="py-2">
                <input type="checkbox" :checked="selectedIds.has(l.id)" class="w-4 h-4 accent-blue-600 cursor-pointer" @change="toggleSelection(l.id)" />
              </td>
              <td class="py-2">
                <input type="checkbox" :checked="l.estado === 'activo'" class="w-4 h-4 accent-primary cursor-pointer" @change="(e) => toggleActivo(l.id, (e.target as HTMLInputElement).checked)" />
              </td>
              <td class="font-mono whitespace-nowrap">{{ l.numero }}</td>
              <td>{{ l.producto }}</td>
              <td class="text-center font-mono text-xs hidden md:table-cell">{{ pool.batchCount.value[l.numero] ?? 0 }}</td>
              <td class="text-right whitespace-nowrap">
                <button class="text-xs text-blue-600 hover:underline mr-2" @click="startEdit(l)">Editar</button>
                <button class="text-xs text-red-600 hover:underline" @click="borrarLote(l.id, l.numero)">Borrar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Última ejecución -->
    <div v-if="ultimosLogs.length > 0" class="bg-white rounded-lg shadow p-4 mb-6">
      <h3 class="text-lg font-semibold mb-2">Última ejecución</h3>
      <div class="space-y-1 text-xs">
        <div v-for="log in ultimosLogs.slice(0, 12)" :key="log.id" class="flex gap-2 items-center">
          <span :class="badgeClass(log.resultado)">{{ log.resultado }}</span>
          <span class="font-mono w-28">{{ log.numero }}</span>
          <span
            v-if="log.accountEmail"
            class="bg-blue-100 text-blue-700 px-1.5 rounded text-[10px] truncate max-w-[140px]"
            :title="`Cuenta: ${log.accountEmail}`"
          >
            {{ log.accountEmail }}
          </span>
          <span v-else class="text-gray-400 text-[10px]">sin cuenta</span>
          <span class="text-gray-500 flex-1 truncate">{{ log.mensaje }}</span>
          <span class="text-gray-400">{{ formatFecha(log.fecha) }}</span>
        </div>
      </div>
    </div>

    <!-- Botón ejecutar (single account) -->
    <div class="flex flex-col items-center gap-2">
      <button
        class="bg-primary text-white font-bold py-3 px-8 rounded-full text-lg hover:bg-primary/90 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        :disabled="runner.state.value.running || pool.lotesActivos.value.length === 0"
        @click="openConfirm"
      >
        <span class="text-2xl">🍪</span>
        {{ runner.state.value.running ? "Horneando…" : "Hornear Galletas" }}
      </button>

      <!-- Botón batch (multi-cuenta) -->
      <button
        v-if="accounts.accounts.value.length > 1"
        class="bg-emerald-600 text-white font-bold py-2 px-6 rounded-full text-sm hover:bg-emerald-700 transition shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        :disabled="runner.state.value.running || batch.batchState.value.running || pool.lotesActivos.value.length === 0"
        @click="openBatchConfirm"
      >
        <span class="text-xl">🍪</span>
        Hornear en {{ accounts.accounts.value.length }} cuentas
      </button>

      <p v-if="pool.lotesActivos.value.length === 0" class="text-xs text-gray-500">Sin lotes activos</p>
    </div>

    <!-- ── Batch confirm dialog ── -->
    <div v-if="showBatchConfirm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showBatchConfirm = false">
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
        <h3 class="text-lg font-semibold mb-1">Carga batch en {{ accounts.accounts.value.length }} cuentas</h3>
        <p class="text-xs text-gray-500 mb-3">
          El pool de {{ pool.lotesActivos.value.length }} lotes activos se inyectará
          en cada cuenta seleccionada.
        </p>
        <div class="space-y-2 mb-4">
          <div>
            <label class="text-xs text-gray-600">Cantidad por cuenta (1-12):</label>
            <input v-model.number="batchCantidad" type="number" min="1" max="12" class="w-20 border rounded px-2 py-1 ml-2 text-sm" />
          </div>
          <p class="text-xs font-semibold text-gray-500 uppercase">Cuentas seleccionadas ({{ batchSelectedAccounts.length }})</p>
          <ul class="text-xs max-h-40 overflow-y-auto space-y-1 border rounded p-2">
            <li v-for="acc in accounts.accounts.value" :key="acc.id">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  :checked="batchSelectedAccounts.includes(acc.id)"
                  @change="toggleBatchAccount(acc.id)"
                  class="accent-blue-600"
                />
                <span class="truncate">{{ acc.email }}</span>
              </label>
            </li>
          </ul>
          <p class="text-xs text-gray-500">
            Total estimado: ~{{ pool.lotesActivos.value.length * batchSelectedAccounts.length }} inyecciones
          </p>
        </div>
        <div class="flex gap-2 justify-end">
          <button class="border px-4 py-2 rounded text-sm" @click="showBatchConfirm = false">Cancelar</button>
          <button
            class="bg-emerald-600 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
            :disabled="batchSelectedAccounts.length === 0 || batch.batchState.value.running"
            @click="ejecutarBatch"
          >
            Ejecutar Batch
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { usePoolLotes, type LoteRow } from "../composables/usePoolLotes.js";
import { useRotationRunner } from "../composables/useRotationRunner.js";
import { usePromoritzSession } from "../composables/usePromoritzSession.js";
import { useConfiguracion } from "../composables/useConfiguracion.js";
import { useHistorial } from "../composables/useHistorial.js";
import { useAccounts } from "../composables/useAccounts.js";
import { useBatchRotation } from "../composables/useBatchRotation.js";
import { getSupabaseConfigError } from "../composables/useSupabase.js";
import {
  PRODUCTOS_VALIDOS,
  RotacionCiclicaRule,
} from "@echo-alfa-ritz/shared";

const pool = usePoolLotes();
const runner = useRotationRunner();
const session = usePromoritzSession();
const cfg = useConfiguracion();
const historial = useHistorial();
const accounts = useAccounts();
const batch = useBatchRotation();
const configError = getSupabaseConfigError();

const nuevoNumero = ref("");
const nuevoProducto = ref<(typeof PRODUCTOS_VALIDOS)[number]>("Mini Ritz");
const cantidadAEnviar = ref(12);
const usarDelayConfig = ref(false);
const ultimosLogs = historial.logs;

// ── Toast ──
interface ToastState { message: string; class: string }
const toast = ref<ToastState | null>(null);
function showToast(message: string, variant: "success" | "error" | "partial" = "success") {
  const cls = variant === "success" ? "bg-green-600 text-white"
    : variant === "error" ? "bg-red-600 text-white"
    : "bg-yellow-500 text-white";
  toast.value = { message, class: cls };
  setTimeout(() => { toast.value = null; }, 5000);
}

// ── Confirm dialog ──
const showConfirm = ref(false);
const preview = ref<{ lotes: number; secuencia: string }>({ lotes: 0, secuencia: "" });

function openConfirm() {
  const activos = pool.lotesActivos.value.length;
  const regla = new RotacionCiclicaRule();
  const cola = regla.calcularCola(pool.lotes.value.map((l) => pool.toDomain(l)));
  const tomados = cola.slice(0, Math.min(cantidadAEnviar.value, cola.length));
  preview.value = {
    lotes: activos,
    secuencia: tomados.map((q) => q.lote.numero).join(", "),
  };
  showConfirm.value = true;
}

async function ejecutarConfirmado() {
  showConfirm.value = false;
  // NO session.login() aquí: inyectar.inyectar() hace login solo si
  // el jar está vacío, y auto-relogin si recibe 401/5xx. Hacer login
  // acá duplicaba requests innecesarios.
  await runner.execute(undefined, {
    externalJar: session.jar,
    fastMode: !usarDelayConfig.value,
    cantidad: cantidadAEnviar.value,
  });
  await pool.loadBatchCounts();

  const s = runner.state.value;
  if (s.failed > 0 && s.success === 0) {
    showToast(`😢 ${s.failed} galletas se quemaron`, "error");
  } else if (s.failed > 0) {
    showToast(`🍪 ¡${s.success} horneadas! (${s.failed} fallaron, ${s.skipped} saltadas)`, "partial");
  } else {
    showToast(`🍪 ¡${s.success} galletas horneadas!${s.skipped > 0 ? ` (${s.skipped} saltadas)` : ""}`, "success");
  }
}

// ── Batch multi-cuenta ──
const showBatchConfirm = ref(false);
const batchCantidad = ref(10);
const batchSelectedAccounts = ref<string[]>([]);

function openBatchConfirm() {
  batchSelectedAccounts.value = accounts.accounts.value.map((a) => a.id);
  // Por defecto 10 por cuenta
  batchCantidad.value = Math.min(10, pool.lotesActivos.value.length);
  showBatchConfirm.value = true;
}

function toggleBatchAccount(id: string) {
  const s = new Set(batchSelectedAccounts.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  batchSelectedAccounts.value = [...s];
}

async function ejecutarBatch() {
  showBatchConfirm.value = false;
  // Guardar la cuenta activa antes del batch para restaurarla después
  const previousAccountId = cfg.config.value?.activeAccountId;

  await batch.executeBatch({
    accountIds: batchSelectedAccounts.value,
    cantidadPorCuenta: batchCantidad.value,
    fastMode: !usarDelayConfig.value,
  });

  // Restaurar la cuenta activa original. Sin esto, el contador de
  // hoyCount queda apuntando a la ÚLTIMA cuenta del batch (session.login
  // de la última iteración deja esa cuenta como activa). Al restaurar
  // la cuenta original, loadBatchCounts cuenta los lotes de esa cuenta.
  if (previousAccountId && previousAccountId !== cfg.config.value?.activeAccountId) {
    const restored = await cfg.setActiveAccount(previousAccountId);
    if (restored) {
      // Si la cuenta restaurada tiene sesión en localStorage, cargarla.
      // Si no, el usuario verá "Sin sesión activa" y deberá hacer login.
      if (!session.isLoggedIn.value) {
        // Intentar login silencioso (si el token guardado todavía sirve)
        await session.login().catch(() => {});
      }
    }
  }

  await pool.loadBatchCounts();

  const b = batch.batchState.value;
  if (b.totalFailed > 0 && b.totalSuccess === 0) {
    showToast(`😢 Batch: ${b.totalFailed} fallos en ${b.accountsDone} cuentas`, "error");
  } else if (b.totalFailed > 0) {
    showToast(
      `🍪 Batch: ${b.totalSuccess} ok, ${b.totalFailed} fail, ${b.totalSkipped} skip (${b.accountsDone} cuentas)`,
      "partial",
    );
  } else {
    showToast(
      `🍪 Batch: ${b.totalSuccess} ok${b.totalSkipped > 0 ? `, ${b.totalSkipped} skip` : ""} (${b.accountsDone} cuentas)`,
      "success",
    );
  }
}

// ── Multi-select ──
const selectedIds = ref<Set<string>>(new Set());
const todosSeleccionados = computed(() =>
  pool.lotes.value.length > 0 && selectedIds.value.size === pool.lotes.value.length,
);

// Cargar contadores al montar y al volver a la pestaña
onMounted(() => {
  pool.loadBatchCounts();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pool.loadBatchCounts();
    }
  });
});

function toggleSelection(id: string) {
  const s = new Set(selectedIds.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  selectedIds.value = s;
}

function toggleSelectAll() {
  if (todosSeleccionados.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(pool.lotes.value.map((l) => l.id));
  }
}

async function batchActivar() {
  try { await pool.batchToggle([...selectedIds.value], true); selectedIds.value.clear(); } catch {}
}
async function batchDesactivar() {
  try { await pool.batchToggle([...selectedIds.value], false); selectedIds.value.clear(); } catch {}
}
async function batchBorrar() {
  if (!confirm(`¿Borrar ${selectedIds.value.size} lotes?`)) return;
  try { await pool.batchRemove([...selectedIds.value]); selectedIds.value.clear(); await pool.loadBatchCounts(); } catch {}
}

// ── Edit ──
const editando = ref<LoteRow | null>(null);
const editForm = ref({ producto: "Mini Ritz", estado: "activo" });
const editSaving = ref(false);

function startEdit(lote: LoteRow) {
  editando.value = lote;
  editForm.value = { producto: lote.producto, estado: lote.estado };
}
async function guardarEdicion() {
  if (!editando.value) return;
  editSaving.value = true;
  try {
    await pool.updateLote(editando.value.id, editForm.value);
    editando.value = null;
    await pool.loadBatchCounts();
  } catch (e) {
    console.error(e);
  } finally {
    editSaving.value = false;
  }
}

// ── CRUD ──
async function agregarLote() {
  try {
    await pool.addLote(nuevoNumero.value, nuevoProducto.value);
    nuevoNumero.value = "";
    await pool.loadBatchCounts();
  } catch {}
}

function toggleActivo(id: string, activo: boolean) {
  pool.toggleActivo(id, activo).catch(() => {});
}

async function borrarLote(id: string, numero: string) {
  if (!confirm(`¿Borrar ${numero}?`)) return;
  try {
    await pool.removeLote(id);
    await pool.loadBatchCounts();
  } catch {}
}

// ── Helpers ──
function formatFecha(iso: string) {
  return new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function badgeClass(r: string) {
  if (r === "success") return "bg-green-100 text-green-800 px-1.5 py-0.5 rounded";
  if (r === "failed") return "bg-red-100 text-red-800 px-1.5 py-0.5 rounded";
  return "bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded";
}
</script>
