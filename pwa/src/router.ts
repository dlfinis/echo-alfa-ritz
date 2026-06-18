import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: () => import("./views/DashboardView.vue"),
    },
    {
      path: "/historial",
      name: "historial",
      component: () => import("./views/HistorialView.vue"),
    },
    {
      path: "/configuracion",
      name: "configuracion",
      component: () => import("./views/ConfiguracionView.vue"),
    },
  ],
});

export { router };
