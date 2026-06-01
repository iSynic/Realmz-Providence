import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
          if (normalizedId.includes("/src/editor/browser/")) {
            return "browser-runtime";
          }
          if (normalizedId.includes("/src/editor/projectCommands")) {
            return "project-commands";
          }
          if (normalizedId.includes("/src/editor/generated/")) {
            return "editor-generated";
          }
          return undefined;
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5178,
    strictPort: true,
    fs: {
      allow: [
        ".",
        "F:/Realmz Scenario Utility/assets/realmz/resources/pictures",
        "F:/Realmz Scenario Utility/assets/realmz/resources/icons"
      ]
    },
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  }
});
