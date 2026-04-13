import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT || "5173";
const port = Number(rawPort);

const isProduction = process.env.NODE_ENV === "production";
const basePath = process.env.BASE_PATH || (isProduction ? "/portal-uix/" : "/");

export default {
  base: basePath,

  plugins: [
    react(),
    tailwindcss(),
  ],

  // Nota: Vite no admite la opción `esbuild.tsconfig` en la config.
  // La configuración de TypeScript queda controlada por tsconfig y Vite internamente.

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },

  root: path.resolve(import.meta.dirname),

  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },

  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
};
