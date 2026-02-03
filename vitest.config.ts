import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          globals: true,
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/browser/**"],
        },
      },
      {
        test: {
          name: "browser",
          globals: true,
          include: ["tests/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            headless: true,
          },
        },
      },
    ],
  },
});
