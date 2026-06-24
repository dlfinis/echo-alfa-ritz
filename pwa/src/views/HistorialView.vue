<template>
  <div>
    <h2 class="text-2xl font-semibold mb-4 flex items-center gap-2">
      <span>📋</span> Historial de Cargas
    </h2>

    <div v-if="historial.loading.value" class="text-gray-400">Cargando…</div>
    <div v-else-if="historial.logs.value.length === 0" class="text-gray-400">
      Sin ejecuciones registradas todavía.
    </div>
    <div v-else class="bg-white rounded-lg shadow overflow-x-auto">
      <table class="w-full text-sm min-w-[480px]">
        <thead class="text-left text-gray-500 border-b">
          <tr>
            <th class="py-2 px-3">Fecha</th>
            <th>Lote</th>
            <th>Resultado</th>
            <th>Mensaje</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in historial.logs.value" :key="log.id" class="border-b last:border-0">
            <td class="py-2 px-3 font-mono text-xs whitespace-nowrap">{{ formatFecha(log.fecha) }}</td>
            <td class="font-mono whitespace-nowrap">{{ log.numero }}</td>
            <td>
              <span :class="badgeClass(log.resultado)">{{ log.resultado }}</span>
            </td>
            <td class="text-gray-600 text-xs">{{ log.mensaje }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHistorial } from "../composables/useHistorial.js";
import type { InjectionResultStatus } from "@echo-alfa-ritz/shared";

const historial = useHistorial();

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString("es-EC");
}

function badgeClass(r: InjectionResultStatus) {
  if (r === "success") return "bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-semibold";
  if (r === "failed") return "bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-semibold";
  return "bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-semibold";
}
</script>
