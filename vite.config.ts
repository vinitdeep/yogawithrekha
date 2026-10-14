import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE lets the same code deploy to a sub-folder (e.g. GitHub Pages: /yogawithrekha/).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5180 },
});
