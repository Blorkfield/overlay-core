// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import overlayFonts from '@blorkfield/overlay-core/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  vite: {
    plugins: [overlayFonts()]
  }
});
