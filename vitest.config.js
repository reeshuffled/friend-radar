import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
    alias: {
      "@": "/Users/rees/Documents/friend-radar/client/src",
    },
  },
});
