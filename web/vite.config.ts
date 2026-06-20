import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The engine lives in ../src and is imported directly as TypeScript source, so
// the web app and a future server share one verified rules implementation.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
});
