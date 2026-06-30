import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    // Resuelve el alias "@/..." (igual que tsconfig) para poder testear módulos
    // que lo usan internamente (p. ej. lib/supabase/queries.ts → @/lib/logistica).
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
})
