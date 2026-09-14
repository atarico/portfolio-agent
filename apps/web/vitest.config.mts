import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Node is the default because almost every test here is a pure function and
    // pays nothing for a DOM. Component tests opt in per file with a
    // `@vitest-environment jsdom` docblock rather than making everyone pay.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
