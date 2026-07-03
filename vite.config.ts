import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function blockWorkspaceScratchRequests() {
  const blockedPrefixes = ["/.git/", "/dist/", "/tmp/"];
  return {
    name: "providence-block-workspace-scratch-requests",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";
        if (blockedPrefixes.some((prefix) => url === prefix.slice(0, -1) || url.startsWith(prefix))) {
          response.statusCode = 404;
          response.end("Not found");
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [blockWorkspaceScratchRequests(), react()],
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
      ignored: ["**/.git/**", "**/dist/**", "**/src-tauri/**", "**/tmp/**"]
    }
  }
});
