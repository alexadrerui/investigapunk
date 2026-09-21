import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const webgpu = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "node_modules/three/build/three.webgpu.js",
);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^three$/, replacement: webgpu },
      { find: /^three\/webgpu$/, replacement: webgpu },
    ],
  },
  server: {
    port: 3000,
    host: true,
  },
  preview: {
    port: 3000,
  },
});
