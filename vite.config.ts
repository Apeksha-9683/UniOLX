import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Proxy the API and the chat socket to the local FastAPI backend so the
      // frontend and the API share one origin during development.
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/ws': {
          target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8000',
          changeOrigin: true,
          ws: true,
        },
        '/uploads': {
          target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
