import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const tauriDev = process.env.TAURI_DEV === 'true';
  const isWindows = process.platform === 'win32';
  const usePollingWatcher = tauriDev || isWindows;
  return {
    server: {
      port: 3090,
      host: '0.0.0.0',
      watch: {
        usePolling: usePollingWatcher,
        interval: 300,
        ignored: ['**/node_modules/**', '**/.git/**', '**/src-tauri/target/**'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
        '/peerjs': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url && req.url.startsWith('/app')) {
            req.url = '/';
          }
          next();
        });
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
