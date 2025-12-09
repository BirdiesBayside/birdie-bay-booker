import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Vite config specifically for Electron bay controller build
// This creates a minimal build with only the bay controller functionality
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "./",
  build: {
    outDir: "dist-electron-app",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "bay-controller": path.resolve(__dirname, "bay-controller.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
