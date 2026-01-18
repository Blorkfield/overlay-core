import { defineConfig } from 'vite';
import path from 'path';
import { fontsPlugin } from './vite-plugin-fonts';
import sirv from 'sirv';

export default defineConfig({
  // Use the root public folder for static assets
  publicDir: path.resolve(__dirname, '../public'),
  plugins: [
    fontsPlugin({
      // Fonts are now at root /fonts directory (bundled with package)
      fontsDir: path.resolve(__dirname, '../fonts'),
    }),
    // Serve fonts from ../fonts at /fonts path
    {
      name: 'serve-fonts',
      configureServer(server) {
        const fontsPath = path.resolve(__dirname, '../fonts');
        // Use sirv to serve static files from fonts directory
        const serve = sirv(fontsPath, { dev: true, etag: true });
        server.middlewares.use('/fonts', serve);
      },
      configurePreviewServer(server) {
        const fontsPath = path.resolve(__dirname, '../fonts');
        const serve = sirv(fontsPath, { etag: true });
        server.middlewares.use('/fonts', serve);
      }
    }
  ],
  server: {
    fs: {
      // Allow serving files from the fonts directory
      allow: ['.', '../fonts'],
    },
  },
});
