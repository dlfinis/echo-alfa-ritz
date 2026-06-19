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
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "content-type, cookie, x-requested-with",
        );
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Expose-Headers", "set-cookie, x-set-cookie");
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
        configure: (proxy) => {
          proxy.on("proxyRes", (_proxyRes, _req, res) => {
            // Capturar Set-Cookie de la respuesta del upstream y ponerlos
            // en un header custom que el browser NO bloquea.
            // Si el método getSetCookie() del browser no funciona, este es el fallback.
            const upstreamHeaders = _proxyRes.headers;
            const sc = upstreamHeaders["set-cookie"];
            if (sc) {
              const raw = Array.isArray(sc) ? sc.join("||") : sc;
              res.setHeader("x-set-cookie", encodeURIComponent(raw));
            }
          });
        },
      },
    },
  },
});
