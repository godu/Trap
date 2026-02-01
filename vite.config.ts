import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "demo",
  base: "/Trap/",
  build: {
    outDir: resolve(__dirname, "demo-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "demo/index.html"),
        escalation: resolve(__dirname, "demo/escalation.html"),
      },
    },
  },
});
