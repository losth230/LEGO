import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Site projet GitHub Pages : https://losth230.github.io/LEGO/
export default defineConfig({
  base: "/LEGO/",
  plugins: [react()],
});
