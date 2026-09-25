import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

// PS-05c — tests unitaires des chemins critiques : appariement élèves connus,
// annulation de commande, page de confirmation. Environnement node : on teste de la
// logique et des route handlers, pas du rendu React.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
