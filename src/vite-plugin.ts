import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Vite plugin that serves bundled fonts from the package.
 * Add this to your vite.config.ts plugins array to automatically
 * serve the default fonts at /fonts/.
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

  return {
    name: 'overlay-core-fonts',

    configResolved() {
      // Determine the fonts directory path
      try {
        const currentFile = fileURLToPath(import.meta.url);
        const currentDir = dirname(currentFile);
        // From dist/vite-plugin.js, fonts are at ../fonts
        fontsDir = resolve(currentDir, '..', 'fonts');
      } catch {
        // Fallback for CJS where __dirname is available
        if (typeof __dirname !== 'undefined') {
          fontsDir = resolve(__dirname, '..', 'fonts');
        } else {
          throw new Error('Unable to determine fonts path');
        }
      }
    },

    async configureServer(server: ViteDevServer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sirv = (await import('sirv' as any)).default as (dir: string, opts?: Record<string, unknown>) => any;
      const serve = sirv(fontsDir, { dev: true, etag: true });
      server.middlewares.use('/fonts', serve);
    },

    async configurePreviewServer(server: PreviewServer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sirv = (await import('sirv' as any)).default as (dir: string, opts?: Record<string, unknown>) => any;
      const serve = sirv(fontsDir, { etag: true });
      server.middlewares.use('/fonts', serve);
    },
  };
}

export default overlayFontsPlugin;
