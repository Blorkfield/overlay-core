# Astro + Svelte Example

Integration of @blorkfield/overlay-core using a Svelte component within Astro.

## Setup

```bash
pnpm install
pnpm dev
```

## What This Example Shows

This example demonstrates:

1. Wrapping OverlayScene in a reusable Svelte component
2. Passing props from Astro to control the scene
3. Reactive updates when props change (rain toggle, spawn rate)
4. Using `client:load` to hydrate the component on page load
5. Svelte lifecycle hooks (`onMount`, `onDestroy`) for proper cleanup
6. ResizeObserver for responsive canvas sizing
7. Two way binding for interactive controls

## The Svelte Component

`OverlayCanvas.svelte` encapsulates the overlay scene and exposes props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | "Hello Svelte" | Text to display as obstacles |
| `rainEnabled` | boolean | true | Enable or disable rain effect |
| `spawnRate` | number | 3 | Objects spawned per second |

## Reactive Updates

The component uses Svelte's reactive statements to update the effect when props change:

```svelte
$: if (scene) {
  updateRainEffect();
}
```

This means changing the `spawnRate` slider immediately updates the rain effect.

## Project Structure

```
src/
  components/
    OverlayCanvas.svelte   # Reusable overlay component
  pages/
    index.astro            # Page using the component
public/
  fonts/
    fonts.json             # Font manifest
```

## Adding Fonts

Copy font directories into `public/fonts/` and update `public/fonts/fonts.json`:

```json
{
  "fonts": [
    {
      "name": "MyFont",
      "type": "ttf",
      "characters": "*",
      "fontUrl": "/fonts/MyFont.ttf"
    }
  ]
}
```
