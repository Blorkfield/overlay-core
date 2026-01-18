import { defineConfig } from 'astro/config';
import { overlayFontsPlugin } from '@blorkfield/overlay-core/vite';

export default defineConfig({
  vite: {
    plugins: [overlayFontsPlugin()]
  }
});
