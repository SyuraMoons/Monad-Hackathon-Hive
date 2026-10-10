import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The `@/` path alias, as in tsconfig, so store and component code can be imported in tests.
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } } });
