import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const basePath = (process.env.VITE_BASE_PATH || "/featherlab").replace(/\/?$/, "/");

export default defineConfig({
  plugins: [vue()],
  base: basePath,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
