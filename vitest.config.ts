import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [ react() ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [ "./src/test/setup.ts" ],
    globals: true,
    // Excludes stray `.claude/worktrees/*` checkouts left by prior agent sessions
    // from being picked up as duplicate test suites alongside the real ones.
    exclude: [ "**/node_modules/**", "**/.claude/worktrees/**" ],
    coverage: {
      provider: "v8",
      include: [ "src/**/*.{ts,tsx}" ],
      exclude: [ "src/test/**", "src/**/*.d.ts" ],
      reporter: [ "text", "html" ],
    },
  },
})
