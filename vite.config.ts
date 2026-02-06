import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "demo",
  base: "/Trap/",
  esbuild: {
    jsx: "automatic",
  },
  build: {
    outDir: resolve(__dirname, "demo-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "demo/index.html"),
        transition: resolve(__dirname, "demo/transition.html"),
        scenario: resolve(__dirname, "demo/scenario.html"),
      },
    },
  },
});
