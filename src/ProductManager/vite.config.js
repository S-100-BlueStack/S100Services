import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";

export default defineConfig({
  plugins: [mkcert()],
  server: {
    port: 5173,
    https: true,
    proxy: {
      "/api": {
        target: "https://localhost:7271",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    sourcemap: true,
  },

  optimizeDeps: {
    exclude: ["@arcgis/core"],
  },
});
