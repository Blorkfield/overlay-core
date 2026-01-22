import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dir: string, baseDir: string = dir): Promise<{ path: string; relativePath: string }[]> {
  const files: { path: string; relativePath: string }[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllFiles(fullPath, baseDir));
    } else {
      files.push({
        path: fullPath,
        relativePath: relative(baseDir, fullPath)
      });
    }
  }

  return files;
}

/**
 * Vite plugin that serves bundled assets from the package.
 * Serves fonts at /fonts/ and public assets at root level.
 *
 * During build, emits all assets to the output directory.
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
  let isBuild = false;

  return {
    name: 'overlay-core-assets',

    configResolved(config) {
      isBuild = config.command === 'build';

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

    async generateBundle() {
      if (!isBuild) return;

      // Emit font files
      try {
        const fontsDirStat = await stat(fontsDir).catch(() => null);
        if (fontsDirStat?.isDirectory()) {
          const fontFiles = await getAllFiles(fontsDir);
          for (const file of fontFiles) {
            const content = await readFile(file.path);
            this.emitFile({
              type: 'asset',
              fileName: `fonts/${file.relativePath}`,
              source: content
            });
          }
        }
      } catch (err) {
        console.warn('[overlay-core-assets] Failed to emit font files:', err);
      }

      // Emit public files
      try {
        const publicDirStat = await stat(publicDir).catch(() => null);
        if (publicDirStat?.isDirectory()) {
          const publicFiles = await getAllFiles(publicDir);
          for (const file of publicFiles) {
            const content = await readFile(file.path);
            this.emitFile({
              type: 'asset',
              fileName: file.relativePath,
              source: content
            });
          }
        }
      } catch (err) {
        console.warn('[overlay-core-assets] Failed to emit public files:', err);
      }
    }
  };
}

export default overlayFontsPlugin;
