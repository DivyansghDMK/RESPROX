import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Which build a service engineer is looking at, for error reports: the commit
// Vercel built, else the local commit, else "dev".
function buildId() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD__: JSON.stringify(buildId()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  server: {
    proxy: {
      '/api-proxy': {
        target: 'https://52ct9sbsu3.execute-api.us-east-1.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
      },
    },
  },
  build: {
    // Route splitting alone still leaves every shared dependency duplicated
    // across route chunks. Pinning the big libraries to their own chunks means
    // each is downloaded and parsed at most once, and only by the routes that
    // actually reach for it.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // recharts drags in the whole d3 scale/shape/array family.
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('gsap') || id.includes('lenis')) return 'motion';
          if (id.includes('lucide-react')) return 'icons-lucide';
          if (id.includes('@mui')) return 'icons-mui';
          return 'vendor';
        },
      },
    },
    // Chunks are deliberately small now; warn only on genuine regressions.
    chunkSizeWarningLimit: 400,
  },
});
