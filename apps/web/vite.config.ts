import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { primePieceAsset } from "../../tools/render-prime-piece.ts";
import { resourcePackPlugin } from "../../tools/resource-pack.ts";
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
export default defineConfig({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(version) },
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    primePieceAsset(),
    resourcePackPlugin(process.env.NOMAD_RESOURCE_PACK_URL),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
