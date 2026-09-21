import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    modulePreload: {
      // Route imports already fetch their own module and dependencies. Preloading every
      // transitive JS chunk creates a 20–40 request burst on each first navigation,
      // which can stall badly through the Australian CDN edge. Keep only styles in the
      // preload list so the browser can prioritise the requested page module itself.
      resolveDependencies: (_filename, dependencies) =>
        dependencies.filter((dependency) => dependency.endsWith(".css")),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
