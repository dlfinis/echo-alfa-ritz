<template>
  <div>
    <h2 class="text-2xl font-semibold mb-4">Dashboard de Lotes</h2>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Lotes Activos</p>
        <p class="text-3xl font-bold">{{ lotesActivos }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Inscritos Hoy</p>
        <p class="text-3xl font-bold text-green-600">{{ inscritosHoy }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Cupo Diario</p>
        <p class="text-3xl font-bold">12</p>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <h3 class="text-lg font-semibold mb-3">Pool de Lotes</h3>
      <p class="text-sm text-gray-400 mb-4">
        Conectando con el agente Echo-Alfa para datos en tiempo real...
      </p>
    </div>

    <div class="flex justify-center">
      <button
        class="bg-primary text-white font-bold py-3 px-8 rounded-full text-lg hover:bg-primary/90 transition shadow-lg"
        @click="ejecutarCarga"
      >
        Ejecutar Carga Ahora
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const lotesActivos = ref(0);
const inscritosHoy = ref(0);

function ejecutarCarga() {
  // TODO: Conectar con Supabase Realtime y disparar tarea
  alert("Carga manual — pendiente de integración con el agente");
}
</script>
