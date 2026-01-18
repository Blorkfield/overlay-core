# Astro Example

Basic integration of @blorkfield/overlay-core with Astro.

## Setup

```bash
pnpm install
pnpm dev
```

## What This Example Shows

This example demonstrates:

1. Creating a fullscreen overlay scene
2. Adding text obstacles with pressure thresholds
3. Setting up a rain effect for continuous object spawning
4. Handling window resize
5. Mouse tracking for interactive behavior
6. Button controls for spawning objects and releasing obstacles

## Bundled Fonts

The package includes three default fonts (block, handwritten, Roboto) that work automatically. No setup required.

## Adding Custom Fonts

To add your own fonts, create directories in `public/fonts/` and update `public/fonts/fonts.json`.

For PNG fonts, add individual character images (A.png, B.png, etc.).

For TTF fonts, add the font file and reference it in the manifest:

```json
{
  "fonts": [
    {
      "name": "MyFont",
      "type": "ttf",
      "characters": "*",
      "fontUrl": "/fonts/MyFont/MyFont.ttf"
    }
  ]
}
```

## Project Structure

```
src/
  pages/
    index.astro    # Main page with overlay scene
public/
  fonts/           # Copied from package or custom fonts
    fonts.json     # Font manifest
    block/         # PNG font
    handwritten/   # PNG font
    Roboto/        # TTF font
```
