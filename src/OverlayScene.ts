import Matter from 'matter-js';
import { createEngine, createRender } from './engine';
import { createBoundaries, createEntity, createObstacle } from './bodies';
import { applyMouseForce, wrapHorizontal } from './entity';
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
  private mouse: Matter.Mouse | null = null;
  private mouseConstraint: Matter.MouseConstraint | null = null;
  private entityGrounded: boolean = false;

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

    // Setup mouse interaction
    this.mouse = Matter.Mouse.create(canvas);
    this.mouseConstraint = Matter.MouseConstraint.create(this.engine, {
      mouse: this.mouse,
      constraint: {
        stiffness: 0.2,
        render: { visible: false }
      }
    });
    Matter.Composite.add(this.engine.world, this.mouseConstraint);

    // Keep render in sync with mouse for pixel ratio
    this.render.mouse = this.mouse;

    // Setup collision detection for grounded state
    Matter.Events.on(this.engine, 'collisionStart', this.handleCollisionStart);
    Matter.Events.on(this.engine, 'collisionEnd', this.handleCollisionEnd);
  }

  private handleCollisionStart = (event: Matter.IEventCollision<Matter.Engine>): void => {
    for (const pair of event.pairs) {
      if (this.isEntityGroundedCollision(pair)) {
        this.entityGrounded = true;
      }
    }
  };

  private handleCollisionEnd = (event: Matter.IEventCollision<Matter.Engine>): void => {
    for (const pair of event.pairs) {
      if (this.isEntityGroundedCollision(pair)) {
        // Check if still colliding with something else
        this.entityGrounded = this.checkEntityStillGrounded();
      }
    }
  };

  private isEntityGroundedCollision(pair: Matter.Pair): boolean {
    if (!this.entity) return false;
    const dominated = pair.bodyA === this.entity || pair.bodyB === this.entity;
    if (!dominated) return false;

    const other = pair.bodyA === this.entity ? pair.bodyB : pair.bodyA;
    // Check if the entity is on top (collision normal pointing up)
    const entityPos = this.entity.position;
    const otherPos = other.position;
    return entityPos.y < otherPos.y;
  }

  private checkEntityStillGrounded(): boolean {
    if (!this.entity) return false;
    const collisions = Matter.Query.collides(this.entity, Matter.Composite.allBodies(this.engine.world));
    for (const collision of collisions) {
      const other: Matter.Body = collision.bodyA === this.entity ? collision.bodyB : collision.bodyA;
      if (other !== this.entity && this.entity.position.y < other.position.y) {
        return true;
      }
    }
    return false;
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
    Matter.Events.off(this.engine, 'collisionStart', this.handleCollisionStart);
    Matter.Events.off(this.engine, 'collisionEnd', this.handleCollisionEnd);
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
      // Don't apply mouse force if entity is being dragged
      const isDragging = this.mouseConstraint?.body === this.entity;
      if (!isDragging) {
        applyMouseForce(this.entity, this.mouseX, this.entityGrounded);
      }
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
