# @blorkfield/overlay-core

A physics based interactive canvas library built on Matter.js. Create dynamic scenes where objects fall under gravity, stack on obstacles, and trigger collapse events when pressure thresholds are exceeded. The library is optimized for interactive text effects where letters can collapse under accumulated weight.

## Installation

```bash
npm install @blorkfield/overlay-core
```

Or with pnpm:

```bash
pnpm add @blorkfield/overlay-core
```

## Core Concepts

### The Scene

`OverlayScene` is the central class that manages the physics simulation, rendering, and object lifecycle. It wraps Matter.js to provide a simplified API for common interactive scenarios.

### Tag Based Behavior

Objects don't have fixed types. Instead, their behavior is determined by string tags. Import the tag constants to avoid magic strings:

```typescript
import { TAGS, TAG_FALLING, TAG_GRABABLE, TAG_FOLLOW_WINDOW } from '@blorkfield/overlay-core';

// Use individual constants
scene.spawnObject({ tags: [TAG_FALLING, TAG_GRABABLE], ... });

// Or destructure from TAGS object
const { FALLING, GRABABLE } = TAGS;
scene.spawnObject({ tags: [FALLING, GRABABLE], ... });
```

| Constant | Value | Behavior |
|----------|-------|----------|
| `TAG_FALLING` / `TAGS.FALLING` | `'falling'` | Object is dynamic and affected by gravity |
| `TAG_FOLLOW_WINDOW` / `TAGS.FOLLOW_WINDOW` | `'follow_window'` | Object follows mouse position when grounded |
| `TAG_GRABABLE` / `TAGS.GRABABLE` | `'grabable'` | Object can be grabbed and moved with mouse |

Without the `falling` tag, objects are static and won't move.

### Pressure System

Static obstacles track how many dynamic objects are resting on them. When the accumulated pressure reaches a threshold, the obstacle collapses (becomes dynamic and falls). You can configure:

| Option | Description |
|--------|-------------|
| Per letter thresholds | Each letter collapses independently |
| Word collapse mode | All letters in a word collapse together |
| Weighted pressure | Objects contribute configurable weight values |
| Shadows | Leave a faded copy behind when collapsing |
| Click to fall | Collapse after being clicked a specified number of times |

### Floor Segments

The floor can be divided into independent segments, each with its own pressure threshold. When a segment receives too much weight, it collapses and objects fall through.

| Option | Description |
|--------|-------------|
| `thickness` | Segment height in pixels (single value or array per segment) |
| `color` | Segment fill color (single value or array per segment) - makes floor visible |
| `minIntegrity` | Minimum segments required. When remaining segments drop below this, all collapse |
| `segmentWidths` | Proportional widths for each segment (array that sums to 1.0, e.g., `[0.2, 0.3, 0.5]`) |

Example: With 10 segments and `minIntegrity: 7`, once 4 segments have collapsed (leaving 6), all remaining segments collapse together.

## Quick Start

```typescript
import { OverlayScene } from '@blorkfield/overlay-core';

// Create container and canvas
const container = document.getElementById('container');
const { canvas, bounds } = OverlayScene.createContainer(container, {
  fullscreen: true
});

// Create scene
const scene = new OverlayScene(canvas, {
  bounds,
  gravity: { x: 0, y: 1 },
  wrapHorizontal: true,
  background: 'transparent'
});

scene.start();
```

## Spawning Objects

All objects are created through `spawnObject()` (or `spawnObjectAsync()` for images). The same config supports canvas-rendered shapes, image-based shapes, and DOM elements.

### Basic Shapes

```typescript
// Circle (dynamic, falls with gravity)
scene.spawnObject({
  x: 100,
  y: 50,
  radius: 20,
  fillStyle: '#ff0000',
  tags: ['falling']
});

// Rectangle (static, doesn't move)
scene.spawnObject({
  x: 200,
  y: 300,
  width: 100,
  height: 20,
  fillStyle: '#0000ff'
});

// Polygon shapes
scene.spawnObject({
  x: 150,
  y: 100,
  radius: 25,
  fillStyle: '#00ff00',
  tags: ['falling'],
  shape: { type: 'hexagon' }
});
```

### Image Based Objects

When you provide an `imageUrl`, the library extracts the shape from the image's alpha channel for accurate collision detection.

```typescript
const id = await scene.spawnObjectAsync({
  x: 150,
  y: 100,
  imageUrl: '/images/coin.png',
  size: 50,
  tags: ['falling', 'grabable']
});
```

### DOM Elements

Pass a DOM element via the `element` property to link it to physics. The element will move with the physics body when it becomes dynamic.

```typescript
const contentBox = document.getElementById('content-box');

scene.spawnObject({
  element: contentBox,
  x: boxX,
  y: boxY,
  width: contentBox.offsetWidth,
  height: contentBox.offsetHeight,
  tags: ['grabable'],
  pressureThreshold: { value: 50 },
  shadow: { opacity: 0.3 },
  clickToFall: { clicks: 5 }
});
```

When a DOM element collapses:
- The element's CSS transform is updated each frame to follow physics
- Shadow creates a cloned DOM element at the original position

```typescript
// Get the shadow element after collapse (if shadow was configured)
const shadowEl = scene.getDOMObstacleShadow(id);
```

### Pressure, Shadow, and Click Behavior

These options work on any spawned object (shapes, images, or DOM elements):

```typescript
scene.spawnObject({
  x: 200,
  y: 300,
  width: 150,
  height: 30,
  fillStyle: '#333',
  tags: ['grabable'],

  // Collapse when 20 units of pressure accumulate
  pressureThreshold: { value: 20 },

  // This object contributes 5 pressure when resting on something
  weight: 5,

  // Leave a faded copy when collapsed (true = 0.3 opacity default)
  shadow: { opacity: 0.3 },

  // Collapse after being clicked 3 times
  clickToFall: { clicks: 3 }
});
```

## Text Obstacles

### PNG Based Text

Uses individual letter images stored in a fonts directory. Each character's collision shape is extracted from its PNG.

```typescript
await scene.initializeFonts('/fonts/');

const result = await scene.addTextObstacles({
  text: 'Hello World',
  x: 100,
  y: 200,
  letterSize: 48,
  fontName: 'handwritten',
  letterColor: '#ff00ff',
  pressureThreshold: { value: 5 },
  weight: { value: 2 },
  shadow: { opacity: 0.3 },
  clickToFall: { clicks: 2 }
});

// Access created elements
console.log(result.stringTag);   // Tag for entire string
console.log(result.wordTags);    // Tags for each word
console.log(result.letterIds);   // Individual letter IDs
```

### TTF Font Text

Renders text using TrueType/OpenType fonts with proper kerning and glyph outlines for collision.

```typescript
const result = await scene.addTTFTextObstacles({
  text: 'Build Stuff',
  x: 100,
  y: 200,
  fontSize: 40,
  fontUrl: '/fonts/Roboto/static/Roboto-Regular.ttf',
  fillColor: '#ffffff',
  pressureThreshold: { value: 10 },
  clickToFall: { clicks: 3 }
});
```

### Managing Text Obstacles

```typescript
// Spawn text that immediately falls (already has 'falling' tag)
const result = await scene.spawnFallingTextObstacles(config);
const result = await scene.spawnFallingTTFTextObstacles(config);

// Release text obstacles (add 'falling' tag)
scene.releaseTextObstacles(wordTag);

// Release letters one by one with delay
await scene.releaseTextObstaclesSequentially(wordTag, 100);        // 100ms delay
await scene.releaseTextObstaclesSequentially(wordTag, 100, true);  // reverse order

// Get debug info for letter positioning
const debugInfo = scene.getLetterDebugInfo(wordTag);
const allDebug = scene.getAllLetterDebugInfo();
```

## Effects

Effects are persistent spawning mechanisms that create objects over time.

### Rain Effect

Objects fall continuously from the top of the scene.

```typescript
scene.setEffect({
  id: 'my-rain',
  type: 'rain',
  enabled: true,
  spawnRate: 5,
  spawnWidth: 0.8,
  objectConfigs: [{
    objectConfig: {
      radius: 15,
      fillStyle: '#4a90d9',
      tags: ['falling']
    },
    probability: 1,
    minScale: 0.8,
    maxScale: 1.2,
    baseRadius: 15
  }]
});
```

### Burst Effect

Objects explode outward from a point at intervals.

```typescript
scene.setEffect({
  id: 'my-burst',
  type: 'burst',
  enabled: true,
  burstInterval: 2000,
  burstCount: 8,
  burstForce: 15,
  origin: { x: 400, y: 300 },
  objectConfigs: [/* ... */]
});
```

### Stream Effect

Objects emit from a point in a specific direction with cone spread.

```typescript
scene.setEffect({
  id: 'my-stream',
  type: 'stream',
  enabled: true,
  origin: { x: 0, y: 0 },
  direction: { x: 1, y: 1 },
  spawnRate: 10,
  force: 15,
  coneAngle: Math.PI / 8,
  objectConfigs: [/* ... */]
});
```

## Managing Objects

```typescript
// Release objects (make them fall)
scene.releaseObject(id);
scene.releaseObjects([id1, id2]);
scene.releaseObjectsByTag('my-text');
scene.releaseAllObjects();

// Remove objects
scene.removeObject(id);
scene.removeObjects([id1, id2]);
scene.removeObjectsByTag('welcome-text');
scene.removeAllObjects();
scene.removeAll();              // Alias for removeAllObjects
scene.removeAllByTag('tag');    // Alias for removeObjectsByTag

// Add or remove tags
scene.addTag(id, 'falling');
scene.addFallingTag(id);        // Convenience for adding 'falling' tag
scene.removeTag(id, 'grabable');

// Get object info
const ids = scene.getObjectIds();
const tagged = scene.getObjectIdsByTag('falling');
const allTags = scene.getAllTags();

// Get full object state
const obj = scene.getObject(id);           // Returns ObjectState or null
const objs = scene.getObjectsByTag('tag'); // Returns ObjectState[]
```

## Physics Manipulation

```typescript
// Apply force to objects
scene.applyForce(id, { x: 0.01, y: -0.02 });
scene.applyForceToTag('falling', { x: 0.005, y: 0 });

// Set velocity directly
scene.setVelocity(id, { x: 5, y: -10 });

// Set position directly
scene.setPosition(id, { x: 100, y: 200 });
```

## Mouse Position and Grab API

For scenarios where mouse input comes from an external source (e.g., system-wide mouse capture via WebSocket), you can programmatically control mouse position and grab/release behavior. This is useful when the canvas is positioned with an offset from the screen origin.

### Setting Mouse Position

```typescript
// Apply your offset and set the adjusted position
const canvasX = screenMouseX - canvasOffsetX;
const canvasY = screenMouseY - canvasOffsetY;
scene.setFollowTarget('mouse', canvasX, canvasY);
```

The offset calculation is your responsibility - overlay-core uses whatever position you provide.

### Programmatic Grab/Release

Grab uses delta-based movement: when grabbed, the entity and mouse become linked. The entity moves BY the same amount as the mouse moves, not TO the mouse position. This ensures the entity stays at its original position on grab and follows mouse movement naturally.

Grab detection uses a two-pass approach to handle fast-moving bodies. The first pass does an exact point query at the click position. If that misses (the body tunneled through the cursor between frames), a second pass sweeps the body's recent position history (last 5 frames, 20px radius) to catch it. This means you can grab entities even when they are moving quickly.

```typescript
// Grab object at current mouse position (only 'grabable' tagged objects)
const grabbedId = scene.startGrab();
if (grabbedId) {
  // Entity stays at its current position, now linked to mouse
  console.log(`Grabbed: ${grabbedId}`);
}

// As mouse moves, entity moves by the same delta
// Mouse moves +50px right → entity moves +50px right
scene.setFollowTarget('mouse', newX, newY);

// Release unlinks entity from mouse
scene.endGrab();

// Check what's currently grabbed
const currentGrab = scene.getGrabbedObject(); // Returns ID or null
```

| Method | Returns | Description |
|--------|---------|-------------|
| `setFollowTarget(key, x, y)` | void | Set a follow target position (e.g., 'mouse' for grab/follow behavior) |
| `removeFollowTarget(key)` | void | Remove a follow target |
| `getFollowTargetKeys()` | string[] | Get all active follow target keys |
| `startGrab()` | string \| null | Link entity at current mouse position to mouse, returns entity ID |
| `endGrab()` | void | Unlink currently grabbed entity (applies release velocity) |
| `getGrabbedObject()` | string \| null | Get ID of currently grabbed entity |

## Configuration

### Scene Config

```typescript
const scene = new OverlayScene(canvas, {
  bounds: { top: 0, bottom: 600, left: 0, right: 800 },
  gravity: { x: 0, y: 1 },
  wrapHorizontal: true,
  debug: false,
  background: '#16213e',
  floorConfig: {
    segments: 10,
    threshold: 100,
    thickness: 20,
    color: '#3a4a6a',   // Makes floor visible
    minIntegrity: 7     // All collapse if fewer than 7 remain
  },
  despawnBelowFloor: 1.0
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `gravity` | `{ x: 0, y: 1 }` | Gravity vector. Both axes support negative values |
| `wrapHorizontal` | true | Objects wrap around screen edges |
| `debug` | false | Show collision wireframes |
| `background` | transparent | Canvas background color |
| `floorConfig.segments` | 1 | Number of floor segments |
| `floorConfig.threshold` | none | Pressure threshold for collapse (number or array per segment) |
| `floorConfig.thickness` | 50 | Floor thickness in pixels (number or array per segment) |
| `floorConfig.color` | none | Floor color - makes segments visible (string or array per segment) |
| `floorConfig.minIntegrity` | none | Minimum segments required, otherwise all collapse |
| `floorConfig.segmentWidths` | none | Proportional widths for each segment (array that sums to 1.0) |
| `despawnBelowFloor` | 1.0 | Distance below floor to despawn objects (as fraction of height) |

### Background Configuration

The `background` option supports multiple formats:

```typescript
// Simple color
background: '#16213e'
background: 'transparent'

// Full configuration with layers
background: {
  color: '#16213e',              // Base color layer
  image: {
    url: '/images/bg.png',
    sizing: 'cover'              // 'stretch' | 'center' | 'tile' | 'cover' | 'contain'
  },
  transparency: {
    mode: 'checkerboard',        // Visual indicator for transparent areas
    color1: '#ffffff',
    color2: '#cccccc',
    size: 10
  }
}

// Change background at runtime
await scene.setBackground({ color: '#000000' });
```

## Pressure Tracking

```typescript
// Get pressure on a specific obstacle
const pressure = scene.getPressure(obstacleId);

// Get IDs of objects resting on an obstacle
const restingIds = scene.getObjectsRestingOn(obstacleId);

// Get all obstacles with pressure
const allPressure = scene.getAllPressure();

// Debug summary
const summary = scene.getPressureSummary();
```

## Callbacks and Events

### Update Callback

Called every frame with all dynamic object states:

```typescript
scene.onUpdate((data) => {
  // data.objects contains all dynamic (falling) objects
  for (const obj of data.objects) {
    console.log(obj.id, obj.x, obj.y, obj.angle, obj.tags);
  }
});
```

### Lifecycle Events

Subscribe to object lifecycle events:

```typescript
// Object spawned
scene.on('objectSpawned', (obj) => {
  console.log(`Spawned: ${obj.id}`, obj.x, obj.y);
});

// Object removed
scene.on('objectRemoved', (obj) => {
  console.log(`Removed: ${obj.id}`);
});

// Objects collided
scene.on('objectCollision', (a, b) => {
  console.log(`Collision: ${a.id} hit ${b.id}`);
});

// Unsubscribe
scene.off('objectSpawned', myCallback);
```

## Font Setup

### Bundled Fonts

The package includes three default fonts ready to use:

| Font | Type | Characters |
|------|------|------------|
| `block` | PNG | A-Z, a-z, 0-9 (pixel/block style) |
| `handwritten` | PNG | A-Z, 0-9 (handwritten style) |
| `Roboto` | TTF | All characters |

#### Vite Projects

Add the plugin to serve bundled fonts automatically:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { overlayFontsPlugin } from '@blorkfield/overlay-core/vite';

export default defineConfig({
  plugins: [overlayFontsPlugin()],
});
```

That's it. The fonts are now available at `/fonts/` in your app.

#### Other Build Tools

For non-Vite projects, the bundled fonts are located at:
```
node_modules/@blorkfield/overlay-core/fonts/
```

Configure your build tool to serve this directory at `/fonts/`.

### Adding Custom Fonts

Custom fonts can be added alongside the bundled fonts. Create a `fonts.json` manifest that includes both:

```json
{
  "fonts": [
    { "name": "block", "type": "png", "characters": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" },
    { "name": "handwritten", "type": "png", "characters": "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" },
    { "name": "Roboto", "type": "ttf", "characters": "*", "fontUrl": "/fonts/Roboto/static/Roboto-Regular.ttf" },
    { "name": "my-custom-font", "type": "png", "characters": "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" }
  ]
}
```

#### PNG Fonts

Create a directory with individual character images:

```
my-custom-font/
  A.png
  B.png
  ...
```

#### TTF Fonts

Add the font file and reference it in the manifest:

```json
{
  "name": "MyFont",
  "type": "ttf",
  "characters": "*",
  "fontUrl": "/fonts/MyFont/MyFont-Regular.ttf"
}
```

### Font API

```typescript
// Initialize fonts from a directory
await scene.initializeFonts('/fonts/');

// Check initialization status
if (scene.areFontsInitialized()) {
  // Get available fonts
  const fonts = scene.getAvailableFonts();      // Returns FontInfo[]
  const font = scene.getFontByName('Roboto');   // Returns FontInfo | undefined
  const font = scene.getFontByIndex(0);         // Returns FontInfo | undefined
  const defaultFont = scene.getDefaultFont();   // Returns first font or undefined
}
```

## Logging

```typescript
import { setLogLevel, getLogLevel } from '@blorkfield/overlay-core';

setLogLevel('debug');  // Options: debug, info, warn, error
```

## Lifecycle

```typescript
scene.start();                          // Start simulation
scene.stop();                           // Pause simulation
scene.resize(w, h);                     // Resize canvas and bounds
scene.setDebug(true);                   // Toggle wireframe mode
scene.setGravity({ x: 0, y: -1 });     // Set gravity (negative y = upward)
scene.setGravity({ x: 0, y: 0 });      // Zero gravity
scene.setGravity({ x: 1, y: 0 });      // Sideways gravity
scene.destroy();                        // Clean up resources
```

## Examples

Working examples are provided in the `/examples` directory:

| Example | Description |
|---------|-------------|
| [examples/astro](./examples/astro) | Basic integration with Astro |
| [examples/astro-svelte](./examples/astro-svelte) | Using Svelte components within Astro |

## Dependencies

| Package | Purpose |
|---------|---------|
| matter-js | Physics engine for collision, gravity, and forces |
| opentype.js | TTF/OTF font parsing for glyph extraction |

## TypeScript

The package is written in TypeScript and ships with full type definitions. All configuration interfaces are exported:

```typescript
import type {
  // Scene configuration
  OverlaySceneConfig,
  Bounds,
  Vector2,
  ContainerOptions,
  FloorConfig,

  // Object types
  ObjectConfig,
  DynamicObject,
  ObjectState,
  ShapeConfig,
  ShapePreset,
  DespawnEffectConfig,

  // Text obstacle types
  TextObstacleConfig,
  TextObstacleResult,
  TTFTextObstacleConfig,
  TextAlign,
  TextBounds,

  // Effect types
  EffectConfig,
  EffectType,
  EffectObjectConfig,
  BaseEffectConfig,
  BurstEffectConfig,
  RainEffectConfig,
  StreamEffectConfig,

  // Pressure, weight, shadow, click types
  PressureThresholdConfig,
  WeightConfig,
  ShadowConfig,
  ClickToFallConfig,

  // Background types
  BackgroundConfig,
  BackgroundImageConfig,
  BackgroundImageSizing,
  BackgroundTransparencyConfig,

  // Font types
  FontInfo,
  FontManifest,
  LoadedFont,
  GlyphData,

  // Lifecycle types
  LifecycleEvent,
  LifecycleCallback,
  UpdateCallback,
  UpdateCallbackData,

  // Logging
  LogLevel,

  // Tags
  Tag
} from '@blorkfield/overlay-core';

// Tag constants (values, not types)
import { TAGS, TAG_FALLING, TAG_GRABABLE, TAG_FOLLOW_WINDOW } from '@blorkfield/overlay-core';
```
