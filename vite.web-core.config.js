import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  plugins: [cesium()],
  build: {
    outDir: 'dist-web-core',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(process.cwd(), 'web-core.html'),
    },
  },
  server: {
    host: true,
  },
});
