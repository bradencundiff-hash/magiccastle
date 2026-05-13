import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Use `npm run build:pages` for GitHub Pages (repo name: magiccastle).
export default defineConfig({
  plugins: [react()],
  base: "/",
});
