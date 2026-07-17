import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  { ignores: ["src/routeTree.gen.ts", "worker-configuration.d.ts"] },
  ...tanstackConfig,
]
