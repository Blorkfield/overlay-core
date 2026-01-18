import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import { overlayFontsPlugin } from '@blorkfield/overlay-core/vite';

export default defineConfig({
  integrations: [svelte()],
  vite: {
    plugins: [overlayFontsPlugin()]
  }
});
