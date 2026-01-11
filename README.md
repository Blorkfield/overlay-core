# overlay-core

A framework-agnostic 2D physics scene library for decorative overlays. Uses Matter.js for physics simulation. Outputs a canvas-rendered scene with gravity, mouse-following entities, and dynamic obstacles.

---

## Technology Decisions

### Language: TypeScript

Not JavaScript. The ".js" in Matter.js is just the package name — it has nothing to do with what language you write in. TypeScript gives you:

- Type safety during development
- Autocompletion for consumers
- Exported `.d.ts` files so consumers get types whether they use TS or JS
- Catches stupid mistakes at compile time

The build step compiles TS to JS. Consumers never see TypeScript — they get plain JS bundles.

### Framework: None

This is a library, not an application. No React, no Svelte, no Vue, nothing. Pure TypeScript that compiles to pure JavaScript.

The entire point of this package is framework-agnostic portability. Consumers bring their own framework (or none). They pass you a canvas element and config, you give them a physics scene.

### Build Tool: tsup

[tsup](https://tsup.egoist.dev/) is a zero-config bundler for TypeScript libraries. It wraps esbuild (fast) and outputs:

- ESM (`.js`) — modern imports
- CJS (`.cjs`) — legacy require()
- Type declarations (`.d.ts`)

One command, all outputs. No webpack, no rollup config files, no bullshit.

### Package Manager: pnpm

Faster than npm, stricter than npm, disk-efficient. Use it. If you hate it, npm works fine.

---

## Repo Creation

### 1. Create the repository

```bash
mkdir overlay-core
cd overlay-core
git init
```

### 2. Initialize package.json

```bash
pnpm init
```

Then replace the contents with:

```json
{
  "name": "@blorkfield/overlay-core",
  "version": "0.0.1",
  "description": "Framework-agnostic 2D physics scene for decorative overlays",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "physics",
    "matter-js",
    "overlay",
    "canvas",
    "2d"
  ],
  "author": "",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/blorkfield/overlay-core"
  }
}
```

Change `@blorkfield` to whatever scope you want, or remove the scope entirely (`"name": "overlay-core"`).

### 3. Install dependencies

```bash
pnpm add matter-js
pnpm add -D typescript tsup @types/matter-js
```

### 4. Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 5. Create tsup.config.ts

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true
});
```

### 6. Create .gitignore

```
node_modules/
dist/
*.log
.DS_Store
```

### 7. Create directory structure

```bash
mkdir src
touch src/index.ts
touch src/types.ts
touch src/OverlayScene.ts
touch src/engine.ts
touch src/bodies.ts
touch src/entity.ts
```

Final structure:

```
overlay-core/
├── src/
│   ├── index.ts           # Public exports
│   ├── types.ts           # All interfaces/types
│   ├── OverlayScene.ts    # Main class
│   ├── engine.ts          # Matter.js engine/render setup
│   ├── bodies.ts          # Body factory functions
│   └── entity.ts          # Entity behavior (mouse force, wrap, state)
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── .gitignore
└── README.md
```

---

## File Contents (Starting Point)

### src/types.ts

```ts
export interface OverlaySceneConfig {
  bounds: Bounds;
  gravity?: number;
  wrapHorizontal?: boolean;
  debug?: boolean;
  background?: string;
}

export interface Bounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface EntityConfig {
  x: number;
  y: number;
  radius: number;
  fillStyle?: string;
}

export interface ObstacleConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DynamicObstacle {
  id: string;
  x: number;
  y: number;
  angle: number;
}

export interface UpdateCallbackData {
  dynamicObstacles: DynamicObstacle[];
}

export type UpdateCallback = (data: UpdateCallbackData) => void;

export type EntityState = 'idle' | 'moving' | 'falling' | 'grounded';
```

### src/index.ts

```ts
export { OverlayScene } from './OverlayScene';
export type {
  OverlaySceneConfig,
  Bounds,
  EntityConfig,
  ObstacleConfig,
  DynamicObstacle,
  UpdateCallbackData,
  UpdateCallback,
  EntityState
} from './types';
```

### src/engine.ts

```ts
import Matter from 'matter-js';
import type { OverlaySceneConfig } from './types';

export function createEngine(gravity: number): Matter.Engine {
  const engine = Matter.Engine.create();
  engine.gravity.y = gravity;
  return engine;
}

export function createRender(
  engine: Matter.Engine,
  canvas: HTMLCanvasElement,
  config: OverlaySceneConfig
): Matter.Render {
  const render = Matter.Render.create({
    canvas,
    engine,
    options: {
      width: config.bounds.right - config.bounds.left,
      height: config.bounds.bottom - config.bounds.top,
      wireframes: config.debug ?? false,
      background: config.background ?? 'transparent'
    }
  });
  return render;
}
```

### src/bodies.ts

```ts
import Matter from 'matter-js';
import type { Bounds, EntityConfig, ObstacleConfig } from './types';

const BOUNDARY_THICKNESS = 50;

export function createBoundaries(bounds: Bounds): Matter.Body[] {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const options = { isStatic: true, render: { visible: false } };
  return [
    // Ground
    Matter.Bodies.rectangle(
      bounds.left + width / 2,
      bounds.bottom + BOUNDARY_THICKNESS / 2,
      width,
      BOUNDARY_THICKNESS,
      { ...options, label: 'ground' }
    ),
    // Ceiling
    Matter.Bodies.rectangle(
      bounds.left + width / 2,
      bounds.top - BOUNDARY_THICKNESS / 2,
      width,
      BOUNDARY_THICKNESS,
      { ...options, label: 'ceiling' }
    ),
    // Left wall
    Matter.Bodies.rectangle(
      bounds.left - BOUNDARY_THICKNESS / 2,
      bounds.top + height / 2,
      BOUNDARY_THICKNESS,
      height,
      { ...options, label: 'leftWall' }
    ),
    // Right wall
    Matter.Bodies.rectangle(
      bounds.right + BOUNDARY_THICKNESS / 2,
      bounds.top + height / 2,
      BOUNDARY_THICKNESS,
      height,
      { ...options, label: 'rightWall' }
    )
  ];
}

export function createEntity(config: EntityConfig): Matter.Body {
  return Matter.Bodies.circle(config.x, config.y, config.radius, {
    restitution: 0.3,
    friction: 0.1,
    frictionAir: 0.01,
    label: 'entity',
    render: {
      fillStyle: config.fillStyle ?? '#ff0000'
    }
  });
}

export function createObstacle(id: string, config: ObstacleConfig): Matter.Body {
  return Matter.Bodies.rectangle(config.x, config.y, config.width, config.height, {
    isStatic: true,
    label: `obstacle:${id}`,
    render: { visible: false }
  });
}
```

### src/entity.ts

```ts
import Matter from 'matter-js';
import type { Bounds } from './types';

const MOUSE_FORCE = 0.001;

export function applyMouseForce(entity: Matter.Body, mouseX: number, grounded: boolean): void {
  if (!grounded) return;
  const direction = Math.sign(mouseX - entity.position.x);
  Matter.Body.applyForce(entity, entity.position, { x: MOUSE_FORCE * direction, y: 0 });
}

export function wrapHorizontal(entity: Matter.Body, bounds: Bounds): void {
  if (entity.position.x < bounds.left) {
    Matter.Body.setPosition(entity, { x: bounds.right, y: entity.position.y });
  } else if (entity.position.x > bounds.right) {
    Matter.Body.setPosition(entity, { x: bounds.left, y: entity.position.y });
  }
}

export function isGrounded(entity: Matter.Body, groundY: number, threshold: number = 5): boolean {
  return entity.position.y >= groundY - threshold - 20; // 20 = approximate radius buffer
}
```

### src/OverlayScene.ts

```ts
import Matter from 'matter-js';
import { createEngine, createRender } from './engine';
import { createBoundaries, createEntity, createObstacle } from './bodies';
import { applyMouseForce, wrapHorizontal, isGrounded } from './entity';
import type {
  OverlaySceneConfig,
  EntityConfig,
  ObstacleConfig,
  UpdateCallback,
  UpdateCallbackData,
  DynamicObstacle
} from './types';

interface ObstacleEntry {
  id: string;
  body: Matter.Body;
  isStatic: boolean;
}

export class OverlayScene {
  private engine: Matter.Engine;
  private render: Matter.Render;
  private runner: Matter.Runner;
  private entity: Matter.Body | null = null;
  private obstacles: Map<string, ObstacleEntry> = new Map();
  private updateCallbacks: UpdateCallback[] = [];
  private mouseX: number = 0;
  private config: OverlaySceneConfig;
  private animationFrameId: number | null = null;

  constructor(canvas: HTMLCanvasElement, config: OverlaySceneConfig) {
    this.config = {
      gravity: 1,
      wrapHorizontal: true,
      debug: false,
      background: 'transparent',
      ...config
    };
    this.engine = createEngine(this.config.gravity!);
    this.render = createRender(this.engine, canvas, this.config);
    this.runner = Matter.Runner.create();
    const boundaries = createBoundaries(this.config.bounds);
    Matter.Composite.add(this.engine.world, boundaries);
  }

  start(): void {
    Matter.Render.run(this.render);
    Matter.Runner.run(this.runner, this.engine);
    this.loop();
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    Matter.Render.stop(this.render);
    Matter.Runner.stop(this.runner);
  }

  destroy(): void {
    this.stop();
    Matter.Engine.clear(this.engine);
    this.obstacles.clear();
    this.updateCallbacks = [];
  }

  spawnEntity(config: EntityConfig): void {
    if (this.entity) {
      Matter.Composite.remove(this.engine.world, this.entity);
    }
    this.entity = createEntity(config);
    Matter.Composite.add(this.engine.world, this.entity);
  }

  setMousePosition(x: number, _y: number): void {
    this.mouseX = x;
  }

  addObstacle(config: ObstacleConfig): string {
    const id = crypto.randomUUID();
    const body = createObstacle(id, config);
    this.obstacles.set(id, { id, body, isStatic: true });
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  releaseObstacle(id: string): void {
    const entry = this.obstacles.get(id);
    if (!entry) return;
    Matter.Body.setStatic(entry.body, false);
    entry.body.render.visible = false;
    entry.isStatic = false;
  }

  removeObstacle(id: string): void {
    const entry = this.obstacles.get(id);
    if (!entry) return;
    Matter.Composite.remove(this.engine.world, entry.body);
    this.obstacles.delete(id);
  }

  onUpdate(callback: UpdateCallback): void {
    this.updateCallbacks.push(callback);
  }

  private loop = (): void => {
    if (this.entity) {
      const grounded = isGrounded(this.entity, this.config.bounds.bottom);
      applyMouseForce(this.entity, this.mouseX, grounded);
      if (this.config.wrapHorizontal) {
        wrapHorizontal(this.entity, this.config.bounds);
      }
    }
    this.fireUpdateCallbacks();
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private fireUpdateCallbacks(): void {
    const dynamicObstacles: DynamicObstacle[] = [];
    this.obstacles.forEach((entry) => {
      if (!entry.isStatic) {
        dynamicObstacles.push({
          id: entry.id,
          x: entry.body.position.x,
          y: entry.body.position.y,
          angle: entry.body.angle
        });
      }
    });
    const data: UpdateCallbackData = { dynamicObstacles };
    this.updateCallbacks.forEach((cb) => cb(data));
  }
}
```

---

## Development Workflow

### Build once

```bash
pnpm build
```

Outputs to `dist/`:
- `index.js` (ESM)
- `index.cjs` (CJS)
- `index.d.ts` (types)

### Watch mode

```bash
pnpm dev
```

Rebuilds on file changes. Use this while developing.

### Type check without building

```bash
pnpm typecheck
```

---

## Testing Locally

Before publishing, test the package in your site repo.

### Option A: pnpm link

In `overlay-core/`:
```bash
pnpm link --global
```

In `blorkfield-site/`:
```bash
pnpm link --global @blorkfield/overlay-core
```

### Option B: File path dependency

In `blorkfield-site/package.json`:
```json
{
  "dependencies": {
    "@blorkfield/overlay-core": "file:../overlay-core"
  }
}
```

Then `pnpm install`.

---

## Publishing

### To npm (when ready)

```bash
npm login
pnpm build
npm publish --access public
```

### To GitHub (private, or just for your own use)

Push the repo to GitHub. Consume via git URL:

```json
{
  "dependencies": {
    "@blorkfield/overlay-core": "github:blorkfield/overlay-core"
  }
}
```

---

## Next Steps After Repo Setup

1. Run `pnpm build` — confirm it compiles
2. Create a test HTML file (not in src/) to manually test the scene
3. Get a ball falling and rendering
4. Add mouse tracking
5. Add wrap-around
6. Add obstacle registration
7. Add obstacle release (static → dynamic)
8. Add `onUpdate` callback firing
9. Test in your site repo via link
10. Iterate

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pnpm build` | Compile to dist/ |
| `pnpm dev` | Watch mode |
| `pnpm typecheck` | Type check only |
| `pnpm link --global` | Make available for linking |
