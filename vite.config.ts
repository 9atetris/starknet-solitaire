import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const publicAppUrl = env.VITE_PUBLIC_APP_URL || '';
  const hmrHost = publicAppUrl ? new URL(publicAppUrl).hostname : '';

  return {
  plugins: [react(), wasm(), topLevelAwait()],
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  server: {
    host: true,
    // Development-only: allow all hosts (tunnel URLs change on restart).
    allowedHosts: true,
    ...(hmrHost
      ? {
          hmr: {
            host: hmrHost,
            protocol: 'wss',
            clientPort: 443,
          },
        }
      : {}),
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: ['eventemitter3'],
    needsInterop: ['eventemitter3'],
    exclude: [
      '@cartridge/connector',
      '@cartridge/connector/controller',
      '@cartridge/controller',
      '@cartridge/controller-wasm',
    ],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  };
});
