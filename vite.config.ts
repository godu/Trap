import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "demo",
  build: {
    outDir: resolve(__dirname, "demo-dist"),
    emptyOutDir: true,
  },
});
