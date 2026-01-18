import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Vite plugin that serves bundled assets from the package.
 * Serves fonts at /fonts/ and public assets at root level.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { overlayFontsPlugin } from '@blorkfield/overlay-core/vite';
 *
 * export default defineConfig({
 *   plugins: [overlayFontsPlugin()],
 * });
 * ```
 */
export function overlayFontsPlugin(): Plugin {
  let fontsDir: string;
  let publicDir: string;

  return {
    name: 'overlay-core-assets',

    configResolved() {
      // Determine the package root directory
      let packageRoot: string;
      try {
        const currentFile = fileURLToPath(import.meta.url);
        const currentDir = dirname(currentFile);
        // From dist/vite-plugin.js, package root is ..
        packageRoot = resolve(currentDir, '..');
      } catch {
        // Fallback for CJS where __dirname is available
        if (typeof __dirname !== 'undefined') {
          packageRoot = resolve(__dirname, '..');
        } else {
          throw new Error('Unable to determine package path');
        }
      }
      fontsDir = resolve(packageRoot, 'fonts');
      publicDir = resolve(packageRoot, 'public');
    },

    async configureServer(server: ViteDevServer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sirv = (await import('sirv' as any)).default as (dir: string, opts?: Record<string, unknown>) => any;

      // Serve fonts at /fonts/
      const serveFonts = sirv(fontsDir, { dev: true, etag: true });
      server.middlewares.use('/fonts', serveFonts);

      // Serve public assets at root level
      const servePublic = sirv(publicDir, { dev: true, etag: true });
      server.middlewares.use(servePublic);
    },

    async configurePreviewServer(server: PreviewServer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sirv = (await import('sirv' as any)).default as (dir: string, opts?: Record<string, unknown>) => any;

      // Serve fonts at /fonts/
      const serveFonts = sirv(fontsDir, { etag: true });
      server.middlewares.use('/fonts', serveFonts);

      // Serve public assets at root level
      const servePublic = sirv(publicDir, { etag: true });
      server.middlewares.use(servePublic);
    },
  };
}

export default overlayFontsPlugin;
