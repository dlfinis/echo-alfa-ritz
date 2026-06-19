import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Dev-only proxy: bypasses browser CORS for calls to promoritz.
      // In production (Cloudflare Pages), a Worker will do the same job.
      // The proxy is server-to-server (Node fetch), so CORS does not apply.
      "/api/promoritz": {
        target: "https://promoritz.com",
        changeOrigin: true, // rewrite Host header to match target (needed for SSL cert)
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/promoritz/, "/ec"),
        // Forward Set-Cookie headers. Browser will ignore them
        // (cross-origin from localhost) but our InMemoryCookieJar
        // captures them from response.headers in HttpInjector.
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["access-control-allow-origin"] = "*";
            proxyRes.headers["access-control-allow-credentials"] = "true";
            proxyRes.headers["access-control-allow-headers"] =
              "content-type, cookie, x-requested-with";
            proxyRes.headers["access-control-allow-methods"] =
              "GET, POST, OPTIONS";
          });
        },
      },
    },
  },
});
