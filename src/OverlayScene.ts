import Matter from 'matter-js';
import { createEngine, createRender } from './engine';
import { createBoundaries, createEntity, createEntityAsync, createObstacle, createObstacleAsync } from './bodies';
import { logger } from './logger';
import { applyMouseForce, wrapHorizontal } from './entity';
import { EffectManager } from './EffectManager';
import type {
  OverlaySceneConfig,
  EntityConfig,
  ObstacleConfig,
  UpdateCallback,
  UpdateCallbackData,
  DynamicObstacle,
  DynamicEntity,
  ContainerOptions,
  Bounds,
  EntityType,
  EffectConfig,
  DespawnEffectConfig,
  TextObstacleConfig,
  TextObstacleResult
} from './types';

interface EntityEntry {
  id: string;
  body: Matter.Body;
  tags: string[];
  grounded: boolean;
  entityType: EntityType;
  spawnTime: number;
  ttl?: number;
  despawnEffect?: DespawnEffectConfig;
}

interface ObstacleEntry {
  id: string;
  body: Matter.Body;
  isStatic: boolean;
  tags: string[];
  spawnTime: number;
  ttl?: number;
  despawnEffect?: DespawnEffectConfig;
}

export class OverlayScene {
  private engine: Matter.Engine;
  private render: Matter.Render;
  private runner: Matter.Runner;
  private canvas: HTMLCanvasElement;
  private entities: Map<string, EntityEntry> = new Map();
  private obstacles: Map<string, ObstacleEntry> = new Map();
  private boundaries: Matter.Body[] = [];
  private updateCallbacks: UpdateCallback[] = [];
  private mouseX: number = 0;
  private config: OverlaySceneConfig;
  private animationFrameId: number | null = null;
  private mouse: Matter.Mouse | null = null;
  private mouseConstraint: Matter.MouseConstraint | null = null;
  private effectManager: EffectManager;

  static createContainer(
    parent: HTMLElement,
    options: ContainerOptions = {}
  ): { canvas: HTMLCanvasElement; bounds: Bounds } {
    const canvas = document.createElement('canvas');

    let width: number;
    let height: number;

    if (options.fullscreen !== false && !options.width && !options.height) {
      // Default: fullscreen (fill parent)
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    } else {
      // Fixed size
      width = options.width ?? 800;
      height = options.height ?? 600;
    }

    canvas.width = width;
    canvas.height = height;
    parent.appendChild(canvas);

    return {
      canvas,
      bounds: { top: 0, bottom: height, left: 0, right: width }
    };
  }

  constructor(canvas: HTMLCanvasElement, config: OverlaySceneConfig) {
    this.canvas = canvas;
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
    this.boundaries = createBoundaries(this.config.bounds);
    Matter.Composite.add(this.engine.world, this.boundaries);

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

    // Setup effect manager - uses async spawning for image clipping support
    this.effectManager = new EffectManager(
      this.config.bounds,
      (cfg) => this.spawnEntityAsync(cfg),
      (id) => this.entities.get(id)?.body ?? null
    );
  }

  private handleCollisionStart = (event: Matter.IEventCollision<Matter.Engine>): void => {
    for (const pair of event.pairs) {
      const entityEntry = this.findEntityInCollision(pair);
      if (entityEntry && this.isEntityOnTop(entityEntry.body, pair)) {
        entityEntry.grounded = true;
      }
    }
  };

  private handleCollisionEnd = (event: Matter.IEventCollision<Matter.Engine>): void => {
    for (const pair of event.pairs) {
      const entityEntry = this.findEntityInCollision(pair);
      if (entityEntry) {
        entityEntry.grounded = this.checkEntityStillGrounded(entityEntry.body);
      }
    }
  };

  private findEntityInCollision(pair: Matter.Pair): EntityEntry | null {
    for (const entry of this.entities.values()) {
      if (pair.bodyA === entry.body || pair.bodyB === entry.body) {
        return entry;
      }
    }
    return null;
  }

  private isEntityOnTop(entity: Matter.Body, pair: Matter.Pair): boolean {
    const other = pair.bodyA === entity ? pair.bodyB : pair.bodyA;
    return entity.position.y < other.position.y;
  }

  private checkEntityStillGrounded(entity: Matter.Body): boolean {
    const collisions = Matter.Query.collides(entity, Matter.Composite.allBodies(this.engine.world));
    for (const collision of collisions) {
      const other: Matter.Body = collision.bodyA === entity ? collision.bodyB : collision.bodyA;
      if (other !== entity && entity.position.y < other.position.y) {
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
    this.entities.clear();
    this.obstacles.clear();
    this.updateCallbacks = [];
  }

  setDebug(enabled: boolean): void {
    this.config.debug = enabled;
    this.render.options.wireframes = enabled;
  }

  resize(width: number, height: number): void {
    // Update canvas dimensions
    this.canvas.width = width;
    this.canvas.height = height;

    // Update config bounds
    this.config.bounds = { top: 0, bottom: height, left: 0, right: width };

    // Remove old boundaries
    Matter.Composite.remove(this.engine.world, this.boundaries);

    // Create and add new boundaries
    this.boundaries = createBoundaries(this.config.bounds);
    Matter.Composite.add(this.engine.world, this.boundaries);

    // Update render bounds
    this.render.options.width = width;
    this.render.options.height = height;
    this.render.canvas.width = width;
    this.render.canvas.height = height;

    // Update effect manager bounds
    this.effectManager.setBounds(this.config.bounds);
  }

  // ==================== ENTITY METHODS ====================

  /**
   * Spawn an entity synchronously. For 'fromImage' shapes, use spawnEntityAsync instead.
   * If fromImage is used here, it will fall back to circle shape.
   */
  spawnEntity(config: EntityConfig): string {
    const id = crypto.randomUUID();
    const entityType = config.entityType ?? 'GROUNDED_FOLLOW';
    logger.debug('OverlayScene', `Spawning entity`, { id, shape: config.shape?.type ?? 'circle', entityType, ttl: config.ttl });
    const body = createEntity(id, config);
    const entry: EntityEntry = {
      id,
      body,
      tags: config.tags ?? [],
      grounded: false,
      entityType,
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect
    };
    this.entities.set(id, entry);
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  /**
   * Spawn an entity asynchronously. Required for 'fromImage' shapes that need to
   * extract shape from image alpha channel.
   */
  async spawnEntityAsync(config: EntityConfig): Promise<string> {
    const id = crypto.randomUUID();
    const entityType = config.entityType ?? 'GROUNDED_FOLLOW';
    logger.debug('OverlayScene', `Spawning entity async`, { id, shape: config.shape?.type ?? 'circle', entityType, ttl: config.ttl });
    const body = await createEntityAsync(id, config);
    const entry: EntityEntry = {
      id,
      body,
      tags: config.tags ?? [],
      grounded: false,
      entityType,
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect
    };
    this.entities.set(id, entry);
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  removeEntity(id: string): void {
    const entry = this.entities.get(id);
    if (!entry) return;
    Matter.Composite.remove(this.engine.world, entry.body);
    this.entities.delete(id);
  }

  removeAllEntities(): void {
    for (const entry of this.entities.values()) {
      Matter.Composite.remove(this.engine.world, entry.body);
    }
    this.entities.clear();
  }

  removeEntitiesByTag(tag: string): void {
    const toRemove: string[] = [];
    for (const [id, entry] of this.entities) {
      if (entry.tags.includes(tag)) {
        Matter.Composite.remove(this.engine.world, entry.body);
        toRemove.push(id);
      }
    }
    toRemove.forEach((id) => this.entities.delete(id));
  }

  getEntityIds(): string[] {
    return Array.from(this.entities.keys());
  }

  getEntityIdsByTag(tag: string): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.entities) {
      if (entry.tags.includes(tag)) {
        ids.push(id);
      }
    }
    return ids;
  }

  setMousePosition(x: number, _y: number): void {
    this.mouseX = x;
  }

  // ==================== OBSTACLE METHODS ====================

  addObstacle(config: ObstacleConfig): string {
    const id = crypto.randomUUID();
    const body = createObstacle(id, config, true);
    const entry: ObstacleEntry = {
      id,
      body,
      isStatic: true,
      tags: config.tags ?? [],
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect
    };
    this.obstacles.set(id, entry);
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  /**
   * Add an obstacle asynchronously. Required for image-based obstacles that need
   * shape extraction from image alpha channel.
   */
  async addObstacleAsync(config: ObstacleConfig): Promise<string> {
    const id = crypto.randomUUID();
    const body = await createObstacleAsync(id, config, true);
    const entry: ObstacleEntry = {
      id,
      body,
      isStatic: true,
      tags: config.tags ?? [],
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect
    };
    this.obstacles.set(id, entry);
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  spawnFallingObstacle(config: ObstacleConfig): string {
    const id = crypto.randomUUID();
    const body = createObstacle(id, config, false);
    const entry: ObstacleEntry = {
      id,
      body,
      isStatic: false,
      tags: config.tags ?? [],
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect
    };
    this.obstacles.set(id, entry);
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  /**
   * Spawn a falling obstacle asynchronously. Required for image-based obstacles.
   */
  async spawnFallingObstacleAsync(config: ObstacleConfig): Promise<string> {
    const id = crypto.randomUUID();
    const body = await createObstacleAsync(id, config, false);
    const entry: ObstacleEntry = {
      id,
      body,
      isStatic: false,
      tags: config.tags ?? [],
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect
    };
    this.obstacles.set(id, entry);
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  releaseObstacle(id: string): void {
    const entry = this.obstacles.get(id);
    if (!entry) return;
    Matter.Body.setStatic(entry.body, false);
    entry.isStatic = false;
  }

  releaseObstacles(ids: string[]): void {
    for (const id of ids) {
      this.releaseObstacle(id);
    }
  }

  releaseAllObstacles(): void {
    for (const entry of this.obstacles.values()) {
      if (entry.isStatic) {
        Matter.Body.setStatic(entry.body, false);
        entry.isStatic = false;
      }
    }
  }

  releaseObstaclesByTag(tag: string): void {
    for (const entry of this.obstacles.values()) {
      if (entry.tags.includes(tag) && entry.isStatic) {
        Matter.Body.setStatic(entry.body, false);
        entry.isStatic = false;
      }
    }
  }

  removeObstacle(id: string): void {
    const entry = this.obstacles.get(id);
    if (!entry) return;
    Matter.Composite.remove(this.engine.world, entry.body);
    this.obstacles.delete(id);
  }

  removeObstacles(ids: string[]): void {
    for (const id of ids) {
      this.removeObstacle(id);
    }
  }

  removeAllObstacles(): void {
    for (const entry of this.obstacles.values()) {
      Matter.Composite.remove(this.engine.world, entry.body);
    }
    this.obstacles.clear();
  }

  removeObstaclesByTag(tag: string): void {
    const toRemove: string[] = [];
    for (const [id, entry] of this.obstacles) {
      if (entry.tags.includes(tag)) {
        Matter.Composite.remove(this.engine.world, entry.body);
        toRemove.push(id);
      }
    }
    toRemove.forEach((id) => this.obstacles.delete(id));
  }

  getObstacleIds(): string[] {
    return Array.from(this.obstacles.keys());
  }

  getObstacleIdsByTag(tag: string): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.obstacles) {
      if (entry.tags.includes(tag)) {
        ids.push(id);
      }
    }
    return ids;
  }

  // ==================== TEXT OBSTACLE METHODS ====================

  /**
   * Create text obstacles from a string. Each character becomes an individual obstacle
   * with shape extracted from the corresponding letter PNG image.
   * Supported characters: A-Z, 0-9 (case insensitive, spaces ignored)
   */
  async addTextObstacles(config: TextObstacleConfig): Promise<TextObstacleResult> {
    const text = config.text.toUpperCase();
    const letterSize = config.letterSize;
    const letterSpacing = config.letterSpacing ?? letterSize * 0.8;
    const basePath = config.basePath ?? '/';
    const wordTag = config.wordTag ?? `word-${crypto.randomUUID().slice(0, 8)}`;
    const isStatic = config.isStatic ?? true;

    const letterIds: string[] = [];
    const letterMap = new Map<string, string>();

    let currentX = config.x;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Skip spaces but add spacing
      if (char === ' ') {
        currentX += letterSpacing;
        continue;
      }

      // Only process A-Z and 0-9
      if (!/^[A-Z0-9]$/.test(char)) {
        continue;
      }

      const imageUrl = `${basePath}${char}.png`;
      const tags = [...(config.tags ?? []), wordTag, `letter-${char}`, `letter-index-${i}`];

      const obstacleConfig: ObstacleConfig = {
        x: currentX,
        y: config.y,
        imageUrl,
        size: letterSize,
        fillStyle: config.fillStyle,
        tags,
        ttl: config.ttl
      };

      const id = isStatic
        ? await this.addObstacleAsync(obstacleConfig)
        : await this.spawnFallingObstacleAsync(obstacleConfig);

      letterIds.push(id);
      letterMap.set(`${char}-${i}`, id);

      currentX += letterSpacing;
    }

    logger.info('OverlayScene', `Created text obstacles`, { text, letterCount: letterIds.length, wordTag });

    return {
      letterIds,
      wordTag,
      letterMap
    };
  }

  /**
   * Spawn falling text obstacles from a string.
   * Same as addTextObstacles but obstacles are non-static (fall with gravity).
   */
  async spawnFallingTextObstacles(config: TextObstacleConfig): Promise<TextObstacleResult> {
    return this.addTextObstacles({ ...config, isStatic: false });
  }

  /**
   * Release all letters in a word (make them non-static so they fall).
   * @param wordTag - The word tag returned from addTextObstacles
   */
  releaseTextObstacles(wordTag: string): void {
    this.releaseObstaclesByTag(wordTag);
  }

  /**
   * Release letters one by one with a delay between each.
   * @param wordTag - The word tag returned from addTextObstacles
   * @param delayMs - Delay between releasing each letter (default: 100ms)
   * @param reverse - If true, release from end to start (default: false)
   */
  async releaseTextObstaclesSequentially(wordTag: string, delayMs: number = 100, reverse: boolean = false): Promise<void> {
    const ids = this.getObstacleIdsByTag(wordTag);
    if (reverse) ids.reverse();

    for (const id of ids) {
      this.releaseObstacle(id);
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // ==================== COMBINED TAG METHODS ====================

  removeAllByTag(tag: string): void {
    this.removeEntitiesByTag(tag);
    this.removeObstaclesByTag(tag);
  }

  removeAll(): void {
    this.removeAllEntities();
    this.removeAllObstacles();
  }

  // ==================== CALLBACKS ====================

  onUpdate(callback: UpdateCallback): void {
    this.updateCallbacks.push(callback);
  }

  // ==================== EFFECT METHODS ====================

  /**
   * Add or update an effect configuration.
   * Effects are persistent spawning mechanisms that run until disabled.
   */
  setEffect(config: EffectConfig): void {
    this.effectManager.setEffect(config);
  }

  /**
   * Remove an effect by ID
   */
  removeEffect(id: string): void {
    this.effectManager.removeEffect(id);
  }

  /**
   * Enable or disable an effect
   */
  setEffectEnabled(id: string, enabled: boolean): void {
    this.effectManager.setEffectEnabled(id, enabled);
  }

  /**
   * Get an effect configuration by ID
   */
  getEffect(id: string): EffectConfig | undefined {
    return this.effectManager.getEffect(id);
  }

  /**
   * Get all effect IDs
   */
  getEffectIds(): string[] {
    return this.effectManager.getEffectIds();
  }

  /**
   * Check if an effect is currently enabled
   */
  isEffectEnabled(id: string): boolean {
    return this.effectManager.isEffectEnabled(id);
  }

  // ==================== PRIVATE ====================

  private loop = (): void => {
    // Update effects (spawn entities)
    this.effectManager.update();

    // Check for TTL expiration
    this.checkTTLExpiration();

    for (const entry of this.entities.values()) {
      // Only apply mouse force to GROUNDED_FOLLOW entities, and not if being dragged
      const isDragging = this.mouseConstraint?.body === entry.body;
      if (!isDragging && entry.entityType === 'GROUNDED_FOLLOW') {
        applyMouseForce(entry.body, this.mouseX, entry.grounded);
      }
      if (this.config.wrapHorizontal) {
        wrapHorizontal(entry.body, this.config.bounds);
      }
    }
    this.fireUpdateCallbacks();
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private checkTTLExpiration(): void {
    const now = performance.now();

    // Check entities
    const expiredEntities: string[] = [];
    for (const [id, entry] of this.entities) {
      if (entry.ttl !== undefined && now - entry.spawnTime >= entry.ttl) {
        // TODO: Trigger despawn effect when implemented
        // if (entry.despawnEffect) { ... }
        expiredEntities.push(id);
      }
    }
    for (const id of expiredEntities) {
      this.removeEntity(id);
    }

    // Check obstacles
    const expiredObstacles: string[] = [];
    for (const [id, entry] of this.obstacles) {
      if (entry.ttl !== undefined && now - entry.spawnTime >= entry.ttl) {
        // TODO: Trigger despawn effect when implemented
        // if (entry.despawnEffect) { ... }
        expiredObstacles.push(id);
      }
    }
    for (const id of expiredObstacles) {
      this.removeObstacle(id);
    }
  }

  private fireUpdateCallbacks(): void {
    const dynamicObstacles: DynamicObstacle[] = [];
    this.obstacles.forEach((entry) => {
      if (!entry.isStatic) {
        dynamicObstacles.push({
          id: entry.id,
          x: entry.body.position.x,
          y: entry.body.position.y,
          angle: entry.body.angle,
          tags: entry.tags
        });
      }
    });

    const entities: DynamicEntity[] = [];
    this.entities.forEach((entry) => {
      entities.push({
        id: entry.id,
        x: entry.body.position.x,
        y: entry.body.position.y,
        angle: entry.body.angle,
        tags: entry.tags,
        entityType: entry.entityType
      });
    });

    const data: UpdateCallbackData = { dynamicObstacles, entities };
    this.updateCallbacks.forEach((cb) => cb(data));
  }

}
