import { defineConfig, type ViteDevServer } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

function corsHeadersPlugin(): {
  name: string;
  configureServer: (server: ViteDevServer) => void;
} {
  return {
    name: "cors-headers",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        // CORS headers para todas las responses (incluidas las del proxy).
        // Sin esto, el browser puede no exponer Set-Cookie al JS.
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "content-type, cookie, x-requested-with",
        );
        res.setHeader("Access-Control-Allow-Credentials", "true");
        // Exponer Set-Cookie para que response.headers.getSetCookie() funcione
        res.setHeader("Access-Control-Expose-Headers", "set-cookie");
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), corsHeadersPlugin()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api/promoritz": {
        target: "https://promoritz.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/promoritz/, "/ec"),
      },
    },
  },
});
