import { defineConfig } from "vite";

export default defineConfig({
  root: "legacy",
  publicDir: false,
  server: {
    port: 3001,
    host: true,
  },
});
