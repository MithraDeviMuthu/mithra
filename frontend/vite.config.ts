import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const flaskTarget = "http://127.0.0.1:5000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": flaskTarget,
      "/predict": flaskTarget,
      "/predict-status": flaskTarget,
      "/health": flaskTarget,
      "/fields": flaskTarget,
      "/fields-status": flaskTarget,
    },
  },
});
