import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const base = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: base,
  esbuild: { jsx: "automatic" },
  build: { outDir: path.resolve(base, "../dist/web"), emptyOutDir: true },
  server: {
    proxy: { "/api": "http://127.0.0.1:4317", "/ws": { target: "ws://127.0.0.1:4317", ws: true } },
  },
});
