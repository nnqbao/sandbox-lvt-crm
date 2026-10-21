// Vite config for the user-guide screenshot harness.
//
// Renders the REAL app (src/main.jsx) with `convex/react` and
// `@convex-dev/auth/react` swapped for in-memory mocks that serve fictional
// fixture data. Nothing here talks to a Convex deployment or to /api.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import baseConfig from '../../vite.config.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const harnessHtml = '/scripts/guide-shots/harness/index.html';

/** SPA fallback to the harness page; /api is answered locally (never proxied). */
function harnessRouting() {
  return {
    name: 'guide-harness-routing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '/';
        if (url.startsWith('/api/')) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end('{"error":"guide harness has no backend"}');
          return;
        }
        const pathname = url.split('?')[0];
        const isAsset = /\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith('/@') || pathname.startsWith('/node_modules/');
        if (!isAsset && (req.headers.accept || '').includes('text/html')) {
          req.url = harnessHtml;
        }
        next();
      });
    },
  };
}

export default {
  ...baseConfig,
  root: repoRoot,
  configFile: false,
  logLevel: 'warn',
  clearScreen: false,
  plugins: [...(baseConfig.plugins || []), harnessRouting()],
  define: {
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify('https://guide-harness.invalid'),
  },
  resolve: {
    alias: [
      { find: /^convex\/react$/, replacement: resolve(here, 'harness/mockConvexReact.jsx') },
      { find: /^@convex-dev\/auth\/react$/, replacement: resolve(here, 'harness/mockConvexAuth.jsx') },
    ],
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    hmr: false,
    // node_modules may be a symlink to a sibling checkout; allow its real path.
    fs: { allow: [repoRoot, realpathSync(resolve(repoRoot, 'node_modules'))] },
  },
  optimizeDeps: {
    entries: [resolve(here, 'harness/index.html')],
  },
};
