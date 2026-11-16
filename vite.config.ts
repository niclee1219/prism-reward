import { resolve } from 'node:path';
import { defineConfig, type Connect } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Cloudflare Pages serves /leaderboard from leaderboard/index.html; make dev and preview do the same
// instead of falling back to the game's index.html.
const PAGES = ['/leaderboard', '/board', '/admin'];
const pretty: Connect.NextHandleFunction = (req, _res, next) => {
  const [path, query = ''] = (req.url ?? '').split('?');
  if (PAGES.includes(path)) req.url = `${path}/index.html${query ? `?${query}` : ''}`;
  next();
};

export default defineConfig({
  build: {
    target: 'es2019',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        board: resolve(__dirname, 'board/index.html'),
        leaderboard: resolve(__dirname, 'leaderboard/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
  server: {
    host: true,
    // During local development the Edge Function handlers run on port 8787 (npm run backend:local).
    proxy: { '/api': { target: 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  preview: {
    proxy: { '/api': { target: 'http://localhost:8787', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  plugins: [
    {
      name: 'pretty-page-urls',
      configureServer: (server) => void server.middlewares.use(pretty),
      configurePreviewServer: (server) => void server.middlewares.use(pretty),
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      workbox: {
        // Precache the whole game so a run needs no network after the first load.
        // woff2: the bundled pixel fonts (src/ui/pixel.css), so text renders in them offline too.
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
