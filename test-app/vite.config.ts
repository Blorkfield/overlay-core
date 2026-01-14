import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // Use the root public folder for static assets
  publicDir: path.resolve(__dirname, '../public'),
});
