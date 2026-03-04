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

Tags are the source of truth for object behavior. Adding a tag activates the associated effect; removing it deactivates it. There are no separate type systems — the tag array on each object drives everything.

Import the tag constants to avoid magic strings:

```typescript
import { TAGS, TAG_STATIC, TAG_GRABABLE, TAG_FOLLOW_WINDOW } from '@blorkfield/overlay-core';

// Use individual constants
scene.spawnObject({ tags: [TAG_GRABABLE], ... });           // dynamic by default
scene.spawnObject({ tags: [TAG_STATIC, TAG_GRABABLE], ... }); // static obstacle

// Or destructure from TAGS object
const { STATIC, GRABABLE } = TAGS;
scene.spawnObject({ tags: [STATIC], ... });
```

| Constant | Value | Behavior |
|----------|-------|----------|
| `TAG_STATIC` / `TAGS.STATIC` | `'static'` | Object is a static obstacle, not affected by gravity. Without this tag, objects are dynamic by default. |
| `TAG_FOLLOW_WINDOW` / `TAGS.FOLLOW_WINDOW` | `'follow_window'` | Object walks toward a target when grounded (default: mouse) |
| `TAG_GRABABLE` / `TAGS.GRABABLE` | `'grabable'` | Object can be grabbed and moved with mouse |
| `TAG_GRAVITY_OVERRIDE` / `TAGS.GRAVITY_OVERRIDE` | `'gravity_override'` | Object uses its own gravity vector instead of scene gravity |
| `TAG_SPEED_OVERRIDE` / `TAGS.SPEED_OVERRIDE` | `'speed_override'` | Multiplies movement speed for `follow_window` and future movement behaviors. Negative = run away from target. |
| `TAG_MASS_OVERRIDE` / `TAGS.MASS_OVERRIDE` | `'mass_override'` | Overrides the physics mass. Higher mass resists follow forces more; lower mass allows the follow force to overcome gravity. |

Tags can be added and removed at runtime to change behavior dynamically:

```typescript
scene.addTag(id, 'static');         // freeze an object in place
scene.removeTag(id, 'static');      // release it to fall
scene.addTag(id, 'grabable');       // make it grabbable
scene.removeTag(id, 'grabable');    // prevent grabbing
```

The `gravity_override` tag carries a value (a Vector2). Use `setObjectGravityOverride` to set the value and activate the tag, or pass it via `gravityOverride` in spawn config. Removing the tag restores scene gravity.

The `speed_override` tag carries a numeric multiplier. Use `setObjectSpeedOverride` to set the value and activate the tag, or pass it via `speedOverride` in spawn config. Removing the tag restores default speed.

The `mass_override` tag carries a numeric mass value. Use `setObjectMassOverride` to set the value and activate the tag, or pass it via `massOverride` in spawn config. Removing the tag restores the natural density-based mass.

### Entity Tags

Every spawned object is automatically assigned a permanent, human-readable **entity tag** that serves as its stable identity. The format is derived from the object's shape or image:

| Object type | Entity tag format | Example |
|-------------|-------------------|---------|
| Circle | `circle-<4hex>` | `circle-a3f2` |
| Rectangle | `rect-<4hex>` | `rect-b1c4` |
| Image-based | `<filename>-<4hex>` | `cat-e9d2` |
| Text letter | `letter-<char>-<4hex>` | `letter-h-7a3f` |
| DOM element | `dom-<4hex>` | `dom-5c21` |

Entity tags appear in `getAllTags()` alongside all other tags, making them usable as follow targets or for runtime queries. They **cannot be removed** — calling `removeTag(id, entityTag)` will log a warning and return without effect. This ensures every object always has a stable, identifiable tag.

### `follow_window` Tag Target

The `follow_window` tag walks an object toward a target when grounded. The default target is `'mouse'`. You can change it at any time:

```typescript
// Follow the mouse (default)
scene.addTag(id, 'follow_window');

// Follow a named target (e.g., another entity's tag)
scene.setFollowWindowTarget(id, 'circle-a3f2');

// Follow any entity that has a given tag
scene.setFollowWindowTarget(id, 'letter-h-7a3f');

// Follow a string/word group tag
scene.setFollowWindowTarget(id, 'title-text');

// Stop following by removing the tag
scene.removeTag(id, 'follow_window');
```

Target resolution order: named follow targets (e.g., `'mouse'`) → object ID → first object with a matching tag.

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
// Circle (dynamic by default — falls with gravity)
scene.spawnObject({
  x: 100,
  y: 50,
  radius: 20,
  fillStyle: '#ff0000',
});

// Rectangle (static obstacle — won't move)
scene.spawnObject({
  x: 200,
  y: 300,
  width: 100,
  height: 20,
  fillStyle: '#0000ff',
  tags: ['static']
});

// Polygon shapes
scene.spawnObject({
  x: 150,
  y: 100,
  radius: 25,
  fillStyle: '#00ff00',
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
  tags: ['grabable']  // dynamic by default
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

Text obstacles default to `isStatic: true` — they are static obstacles that things fall onto. Pass `isStatic: false` to spawn falling text instead.

### Managing Text Obstacles

```typescript
// Spawn text that immediately falls (isStatic: false)
const result = await scene.spawnFallingTextObstacles(config);
const result = await scene.spawnFallingTTFTextObstacles(config);

// Release static text obstacles (removes 'static' tag so they fall)
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
      // dynamic by default — no tags needed
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

// Add or remove tags — tags drive behavior, changes take effect immediately
scene.addTag(id, 'grabable');
scene.removeTag(id, 'static');            // releases a static object to fall
scene.addTag(id, 'static');              // freezes a dynamic object in place
scene.addFallingTag(id);                 // convenience: removes 'static', adds 'grabable'
scene.setFollowWindowTarget(id, 'mouse'); // change what a follow_window object walks toward
scene.setObjectSpeedOverride(id, 2);     // double movement speed (negative = run away)
scene.setObjectSpeedOverride(id, null);  // remove speed override
scene.setObjectMassOverride(id, 50);     // heavy object resists follow force
scene.setObjectMassOverride(id, null);   // restore natural mass

// Get object info
const ids = scene.getObjectIds();
const tagged = scene.getObjectIdsByTag('static');
const allTags = scene.getAllTags();

// Get full object state
const obj = scene.getObject(id);           // Returns ObjectState or null
const objs = scene.getObjectsByTag('tag'); // Returns ObjectState[]
```

## Physics Manipulation

```typescript
// Apply force to objects
scene.applyForce(id, { x: 0.01, y: -0.02 });
scene.applyForceToTag('grabable', { x: 0.005, y: 0 });

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
  // data.objects contains all dynamic objects (those without the 'static' tag)
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

### Per-Object Gravity Override

Dynamic objects can have their own gravity vector instead of the scene gravity. Set it via `gravityOverride` in spawn config, or change it at runtime with `setObjectGravityOverride`. This automatically adds or removes the `gravity_override` tag.

```typescript
// Spawn a floaty object that drifts upward
scene.spawnObject({
  x: 200, y: 300,
  radius: 20,
  fillStyle: '#4a90d9',
  tags: ['grabable'],
  gravityOverride: { x: 0, y: -0.3 }  // floats upward
});

// Zero gravity — hovers in place
scene.spawnObject({
  x: 400, y: 200,
  radius: 15,
  fillStyle: '#e94560',
  gravityOverride: { x: 0, y: 0 }
});

// Change or clear a gravity override at runtime
scene.setObjectGravityOverride(id, { x: 0.5, y: 0 }); // drift sideways
scene.setObjectGravityOverride(id, null);               // restore scene gravity

// removeTag works too — setObjectGravityOverride(id, null) calls it internally
scene.removeTag(id, 'gravity_override');  // restores scene gravity
```

Tags are the source of truth for all behavior. Boolean tags (presence = active, absence = inactive). `gravity_override` additionally carries a Vector2 value managed via `setObjectGravityOverride` or `gravityOverride` in spawn config.

| Tag | Behavior |
|-----|----------|
| `static` | Static obstacle, not affected by gravity. Absent by default — objects are dynamic unless tagged static. |
| `grabable` | Can be grabbed and dragged with the mouse |
| `follow_window` | Always applies a directional force toward its target (in all axes). Gravity determines whether the entity can actually reach targets above/below it. |
| `gravity_override` | Uses its own gravity vector instead of scene gravity (value set via `setObjectGravityOverride`) |
| `speed_override` | Multiplies movement speed for `follow_window` and future movement behaviors (value set via `setObjectSpeedOverride`). Negative = runs away from target. Default multiplier: 1 |
| `mass_override` | Overrides physics mass (value set via `setObjectMassOverride`). Higher mass resists follow forces; lower mass may allow entity to overcome gravity. |

### Speed Override

Objects with `follow_window` move toward their target at default speed. `speed_override` multiplies this force. Negative values reverse the direction, causing the object to run away.

```typescript
// Spawn a fast follower
scene.spawnObject({
  tags: ['follow_window'],
  speedOverride: 3,   // 3× normal speed — automatically adds 'speed_override' tag
  // ...
});

// Spawn a coward that runs away from the mouse
scene.spawnObject({
  tags: ['follow_window'],
  speedOverride: -2,  // flees at 2× speed
  // ...
});

// Change speed at runtime
scene.setObjectSpeedOverride(id, 5);   // very fast follower
scene.setObjectSpeedOverride(id, -1);  // now runs away at normal speed
scene.setObjectSpeedOverride(id, null); // remove override, restore default speed
```

### Mass Override

Entities have a default density of `0.005`, which gives typical sizes a mass of ~6–20 units — enough that normal gravity prevents the follow force from lifting them vertically. `mass_override` lets you change this at spawn or runtime.

```typescript
// Light object — follow force can overcome normal gravity, moves freely in all directions
scene.spawnObject({
  tags: ['follow_window'],
  massOverride: 1,
  // ...
});

// Very heavy object — barely moves toward target under normal gravity
scene.spawnObject({
  tags: ['follow_window'],
  massOverride: 100,
  // ...
});

// Change or clear mass at runtime
scene.setObjectMassOverride(id, 50);   // now heavy
scene.setObjectMassOverride(id, null); // restore natural mass
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
import { TAGS, TAG_FALLING, TAG_GRABABLE, TAG_FOLLOW_WINDOW, TAG_GRAVITY_OVERRIDE } from '@blorkfield/overlay-core';
```
