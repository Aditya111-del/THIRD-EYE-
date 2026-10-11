// TanStack Start configuration for THIRD EYE
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  server: {
    port: 3000,
    host: "0.0.0.0",
    strictPort: false,
  },
  vite: {
    server: {
      port: 3000,
      host: "0.0.0.0",
      strictPort: false,
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts
    server: { entry: "server" },
  },
});

