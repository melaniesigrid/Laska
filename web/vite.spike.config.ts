import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Throwaway config for the SEO SSG de-risk spike (T1). Keeps the real app's
// vite.config.ts untouched. Uses spike.html as the HTML entry (its module
// script points at src/spike/entry.tsx, the ViteReactSSG entry).
//
// NOTE: ssr.noExternal is intentionally OMITTED for the first build, to observe
// the *natural* behaviour of the raw-TS engine import under vite-react-ssg's
// SSR pass. Add `ssr: { noExternal: [/src/] }` only if the build externalizes
// the .ts engine import.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-spike',
    emptyOutDir: true,
  },
  ssgOptions: {
    htmlEntry: 'spike.html',
    dirStyle: 'nested', // dist-spike/<route>/index.html
  },
});
