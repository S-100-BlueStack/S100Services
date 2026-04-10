import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";

export default defineConfig({
  plugins: [mkcert()],
  server: {
    port: 5173,
    https: true,
  },
  build: {
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["@arcgis/core"],
  },
});
