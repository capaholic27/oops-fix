import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    port: 8080,
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
    // Single-origin wiring: the Supabase client calls /rest, /functions, /auth,
    // /realtime on the page's own origin. Vite proxies them to the local Fotmob
    // API service so the browser never makes a cross-origin request.
    proxy: {
      "/rest": { target: "http://api:8080", changeOrigin: true },
      "/functions": { target: "http://api:8080", changeOrigin: true },
      "/auth": { target: "http://api:8080", changeOrigin: true },
      "/realtime": { target: "http://api:8080", changeOrigin: true, ws: true },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
