import Matter from 'matter-js';
import { createEngine, createRender } from './engine';
import { createBoundaries, createEntity, createEntityAsync, createObstacle, createObstacleAsync, createBoxObstacleWithInfo, getImageDimensions } from './bodies';
import { tintImage } from './imageClip';
import { loadFont, getGlyphData, getKerning, type LoadedFont } from './fontLoader';
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
  TextObstacleResult,
  TTFTextObstacleConfig,
  FontInfo,
  FontManifest,
  LetterDebugInfo
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

interface TTFGlyphRenderInfo {
  char: string;
  fontSize: number;
  fontFamily: string;
  fillColor: string;
  // Offset from body center to baseline position for fillText
  offsetX: number;
  offsetY: number;
}

interface ObstacleEntry {
  id: string;
  body: Matter.Body;
  isStatic: boolean;
  tags: string[];
  spawnTime: number;
  ttl?: number;
  despawnEffect?: DespawnEffectConfig;
  ttfGlyph?: TTFGlyphRenderInfo;
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
  private fonts: FontInfo[] = [];
  private fontsInitialized: boolean = false;
  private letterDebugInfo: Map<string, LetterDebugInfo[]> = new Map(); // wordTag -> debug info

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

    // Toggle TTF glyph body visibility (show collision shapes in debug mode)
    for (const [, entry] of this.obstacles) {
      if (entry.ttfGlyph && entry.body.render) {
        entry.body.render.visible = enabled;
      }
    }
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
    // Clean up letter debug info if this was a word tag
    this.letterDebugInfo.delete(tag);
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

  // ==================== FONT MANAGEMENT METHODS ====================

  /**
   * Initialize fonts by loading the font manifest.
   * Should be called before using text obstacles if you want automatic font detection.
   * @param fontsBasePath Base URL path for fonts directory (default: '/fonts/')
   */
  async initializeFonts(fontsBasePath: string = '/fonts/'): Promise<void> {
    if (this.fontsInitialized) {
      return;
    }

    try {
      const manifestUrl = `${fontsBasePath}fonts.json`;
      const response = await fetch(manifestUrl);

      if (!response.ok) {
        logger.warn('OverlayScene', `Failed to load fonts manifest from ${manifestUrl}: ${response.status}`);
        this.fonts = [];
        this.fontsInitialized = true;
        return;
      }

      const manifest: FontManifest = await response.json();
      this.fonts = manifest.fonts || [];

      // Load TTF fonts via FontFace API so they're available for canvas fillText
      for (const font of this.fonts) {
        if (font.type === 'ttf' && font.fontUrl) {
          try {
            const fontFace = new FontFace(font.name, `url(${font.fontUrl})`);
            await fontFace.load();
            document.fonts.add(fontFace);
            logger.debug('OverlayScene', `Loaded TTF font: ${font.name}`);
          } catch (err) {
            logger.warn('OverlayScene', `Failed to load TTF font ${font.name}: ${err}`);
          }
        }
      }

      this.fontsInitialized = true;

      logger.info('OverlayScene', `Loaded ${this.fonts.length} fonts`, { fonts: this.fonts.map(f => f.name) });
    } catch (error) {
      logger.warn('OverlayScene', `Error loading fonts manifest: ${error}`);
      this.fonts = [];
      this.fontsInitialized = true;
    }
  }

  /**
   * Get list of available fonts.
   * Returns empty array if fonts have not been initialized.
   */
  getAvailableFonts(): FontInfo[] {
    return [...this.fonts];
  }

  /**
   * Get font by index. Returns undefined if index is out of bounds.
   * @param index Font index (0-based)
   */
  getFontByIndex(index: number): FontInfo | undefined {
    return this.fonts[index];
  }

  /**
   * Get font by name. Returns undefined if font not found.
   * @param name Font name to find
   */
  getFontByName(name: string): FontInfo | undefined {
    return this.fonts.find(f => f.name === name);
  }

  /**
   * Get the default font (first available font).
   * Returns undefined if no fonts are available.
   */
  getDefaultFont(): FontInfo | undefined {
    return this.fonts[0];
  }

  /**
   * Check if fonts have been initialized.
   */
  areFontsInitialized(): boolean {
    return this.fontsInitialized;
  }

  // ==================== TEXT OBSTACLE METHODS ====================

  /**
   * Create text obstacles from a string. Each character becomes an individual obstacle
   * with shape extracted from the corresponding letter PNG image.
   * Supported characters: A-Z, a-z, 0-9 (spaces handled, unsupported chars skipped)
   * Case is preserved: uses lowercase PNG if available, falls back to uppercase (and vice versa).
   * Supports multiline text with \n characters.
   *
   * Letter positioning is based on original PNG dimensions:
   * - Each letter's PNG width controls its horizontal spacing
   * - The clipped shape is positioned correctly within the original bounds
   * - This allows fine control of letter spacing via PNG canvas size
   */
  async addTextObstacles(config: TextObstacleConfig): Promise<TextObstacleResult> {
    // Convert literal \n strings to actual newlines (preserve case for lowercase support)
    const text = config.text.replace(/\\n/g, '\n');
    const letterSize = config.letterSize;
    const lineHeight = config.lineHeight ?? letterSize * 1.2;
    const fontsBasePath = config.fontsBasePath ?? '/fonts/';
    const fontName = config.fontName ?? this.getDefaultFont()?.name ?? 'handwritten';
    const basePath = `${fontsBasePath}${fontName}/`;
    const wordTag = config.wordTag ?? `word-${crypto.randomUUID().slice(0, 8)}`;
    const isStatic = config.isStatic ?? true;
    const letterColor = config.letterColor;

    const letterIds: string[] = [];
    const letterMap = new Map<string, string>();
    const debugInfo: LetterDebugInfo[] = [];

    // Split text into lines
    const lines = text.split('\n');

    // First pass: collect all unique characters and load their image dimensions
    const uniqueChars = new Set<string>();
    for (const line of lines) {
      for (const char of line) {
        if (/^[A-Za-z0-9]$/.test(char)) {
          uniqueChars.add(char);
        }
      }
    }

    // Load dimensions for all unique characters in parallel
    // Try exact case first, then fallback to opposite case (a->A or A->a)
    const charDimensions = new Map<string, { width: number; height: number }>();
    const charFileNames = new Map<string, string>(); // Maps input char to resolved filename char
    await Promise.all(
      Array.from(uniqueChars).map(async (char) => {
        const imageUrl = `${basePath}${char}.png`;
        try {
          const dims = await getImageDimensions(imageUrl);
          charDimensions.set(char, dims);
          charFileNames.set(char, char);
        } catch {
          // Try opposite case for letters (not digits)
          if (/^[A-Za-z]$/.test(char)) {
            const fallbackChar = char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase();
            const fallbackUrl = `${basePath}${fallbackChar}.png`;
            try {
              const dims = await getImageDimensions(fallbackUrl);
              charDimensions.set(char, dims);
              charFileNames.set(char, fallbackChar);
              logger.debug('OverlayScene', `Using fallback ${fallbackChar} for ${char}`);
            } catch (fallbackError) {
              logger.warn('OverlayScene', `Failed to load char ${char} (tried ${fallbackChar} too)`, { error: String(fallbackError) });
              charDimensions.set(char, { width: 100, height: 100 });
              charFileNames.set(char, char);
            }
          } else {
            logger.warn('OverlayScene', `Failed to load dimensions for char ${char}`);
            charDimensions.set(char, { width: 100, height: 100 });
            charFileNames.set(char, char);
          }
        }
      })
    );

    // Calculate the scale factor: letterSize is the target max dimension
    // Find the max dimension among all letters to determine base scale
    let maxDimension = 0;
    for (const dims of charDimensions.values()) {
      maxDimension = Math.max(maxDimension, dims.width, dims.height);
    }
    // If no letters found, default to 100
    if (maxDimension === 0) maxDimension = 100;

    // Track Y position for each line
    let currentY = config.y;
    let globalCharIndex = 0;

    for (const line of lines) {
      const chars = line.split('');
      let currentX = config.x;

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];

        // Handle spaces - use average letter width or letterSpacing config
        if (char === ' ') {
          // Use explicit letterSpacing if provided, otherwise use letterSize as space width
          // TODO Replace this with a configured value
          currentX += 20;
          globalCharIndex++;
          continue;
        }

        // Only process A-Z, a-z, and 0-9
        if (!/^[A-Za-z0-9]$/.test(char)) {
          globalCharIndex++;
          continue;
        }

        // Get this letter's original dimensions
        const dims = charDimensions.get(char)!;
        const scale = letterSize / Math.max(dims.width, dims.height);
        const scaledWidth = dims.width * scale;
        const scaledHeight = dims.height * scale;

        // Letter box position (top-left of the original dimension box)
        const boxX = currentX;
        const boxY = currentY - scaledHeight / 2; // Center vertically on currentY

        // Letter center position (center of the original dimension box)
        const centerX = currentX + scaledWidth / 2;
        const centerY = currentY;

        // Prepare image URL (with optional tinting), using resolved filename with fallback
        const resolvedChar = charFileNames.get(char) ?? char;
        const originalImageUrl = `${basePath}${resolvedChar}.png`;
        const imageUrl = letterColor
          ? await tintImage(originalImageUrl, letterColor)
          : originalImageUrl;
        const tags = [...(config.tags ?? []), wordTag, `letter-${char}`, `letter-index-${globalCharIndex}`];

        const id = crypto.randomUUID();

        // Create clipped letter body at the center position
        const obstacleConfig: ObstacleConfig = {
          x: centerX,
          y: centerY,
          imageUrl,
          size: letterSize,
          tags,
          ttl: config.ttl
        };

        const result = await createBoxObstacleWithInfo(id, obstacleConfig, isStatic);

        const entry: ObstacleEntry = {
          id,
          body: result.body,
          isStatic,
          tags,
          spawnTime: performance.now(),
          ttl: config.ttl
        };
        this.obstacles.set(id, entry);
        Matter.Composite.add(this.engine.world, result.body);

        letterIds.push(id);
        letterMap.set(`${char}-${globalCharIndex}`, id);

        // Store debug info
        debugInfo.push({
          char,
          id,
          originalWidth: dims.width,
          originalHeight: dims.height,
          scaledWidth,
          scaledHeight,
          boxX,
          boxY,
          centerX,
          centerY
        });

        // Advance X by this letter's scaled width (plus optional extra spacing)
        const extraSpacing = config.letterSpacing !== undefined ? config.letterSpacing - scaledWidth : 0;
        currentX += scaledWidth + Math.max(0, extraSpacing);

        globalCharIndex++;
      }

      // Move to next line
      currentY += lineHeight;
    }

    // Store debug info for this word
    this.letterDebugInfo.set(wordTag, debugInfo);

    logger.info('OverlayScene', `Created text obstacles`, {
      text: text.replace(/\n/g, '\\n'),
      fontName,
      letterCount: letterIds.length,
      wordTag,
      letterColor,
      lineCount: lines.length
    });

    return {
      letterIds,
      wordTag,
      letterMap,
      letterDebugInfo: debugInfo
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

  /**
   * Get letter debug info for a word.
   * Returns the debug info array for the given word tag, or undefined if not found.
   * Debug info includes original dimension boxes for each letter.
   */
  getLetterDebugInfo(wordTag: string): LetterDebugInfo[] | undefined {
    return this.letterDebugInfo.get(wordTag);
  }

  /**
   * Get all stored letter debug info (all words).
   * Returns a map of wordTag -> debug info array.
   */
  getAllLetterDebugInfo(): Map<string, LetterDebugInfo[]> {
    return new Map(this.letterDebugInfo);
  }

  // ==================== TTF FONT TEXT METHODS ====================

  /**
   * Create text obstacles from a TTF/OTF font file.
   * Uses proper font metrics for spacing, kerning, and glyph outlines for collision.
   * Supports multiline text with \n characters.
   */
  async addTTFTextObstacles(config: TTFTextObstacleConfig): Promise<TextObstacleResult> {
    const { x, y, fontSize, fontUrl } = config;
    // Convert literal \n strings to actual newlines
    const text = config.text.replace(/\\n/g, '\n');
    const wordTag = config.wordTag ?? `word-${crypto.randomUUID().slice(0, 8)}`;
    const isStatic = config.isStatic ?? true;
    const fillColor = config.fillColor ?? '#ffffff';
    const lineHeight = config.lineHeight ?? fontSize * 1.2;

    const letterIds: string[] = [];
    const letterMap = new Map<string, string>();

    // Load the font
    const loadedFont = await loadFont(fontUrl);

    // Find font family name for canvas rendering
    const fontInfo = this.fonts.find(f => f.fontUrl === fontUrl);
    const fontFamily = fontInfo?.name ?? 'sans-serif';

    // Split text into lines
    const lines = text.split('\n');

    // Track current Y position for each line
    let currentY = y;
    let globalCharIndex = 0;

    for (const line of lines) {
      // Track current X position as we place each glyph
      let currentX = x;

      const chars = line.split('');

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];

        // Get glyph data (vertices, advance width, etc.)
        const glyphData = getGlyphData(loadedFont, char, fontSize);

        // Skip if no vertices (space or unsupported char)
        if (glyphData.vertices.length < 3) {
          // Still advance by the glyph's advance width
          currentX += glyphData.advanceWidth;

          // Add kerning with next character
          if (i < chars.length - 1) {
            currentX += getKerning(loadedFont, char, chars[i + 1], fontSize);
          }
          globalCharIndex++;
          continue;
        }

        const id = crypto.randomUUID();
        const tags = [...(config.tags ?? []), wordTag, `letter-${char}`, `letter-index-${globalCharIndex}`];

        // Calculate glyph center from bounding box
        const bbox = glyphData.boundingBox;
        const glyphWidth = bbox ? bbox.x2 - bbox.x1 : glyphData.advanceWidth;
        const glyphHeight = bbox ? bbox.y2 - bbox.y1 : fontSize;
        const glyphCenterX = currentX + (bbox ? bbox.x1 + glyphWidth / 2 : glyphData.advanceWidth / 2);
        const glyphCenterY = currentY - (bbox ? (bbox.y1 + bbox.y2) / 2 : fontSize / 2);

        // Create world-positioned vertices
        const worldVertices = glyphData.vertices.map(v => ({
          x: currentX + v.x,
          y: currentY + v.y
        }));

        // Create body from vertices at the target position
        // fromVertices will calculate centroid and position body there
        const body = Matter.Bodies.fromVertices(glyphCenterX, glyphCenterY, [worldVertices], {
          isStatic,
          label: `obstacle:${id}`,
          render: {
            visible: false
          }
        });

        // Store and add to world
        // Calculate offset from ACTUAL body position to baseline for fillText rendering
        // (fromVertices positions body at vertex centroid, not where we specified)
        const offsetX = currentX - body.position.x;
        const offsetY = currentY - body.position.y;

        const entry: ObstacleEntry = {
          id,
          body,
          isStatic,
          tags,
          spawnTime: performance.now(),
          ttl: config.ttl,
          ttfGlyph: {
            char,
            fontSize,
            fontFamily,
            fillColor,
            offsetX,
            offsetY
          }
        };
        this.obstacles.set(id, entry);
        Matter.Composite.add(this.engine.world, body);

        letterIds.push(id);
        letterMap.set(`${char}-${globalCharIndex}`, id);

        // Advance X position by glyph's advance width
        currentX += glyphData.advanceWidth;

        // Add kerning with next character
        if (i < chars.length - 1) {
          currentX += getKerning(loadedFont, char, chars[i + 1], fontSize);
        }

        globalCharIndex++;
      }

      // Move to next line
      currentY += lineHeight;
    }

    logger.info('OverlayScene', `Created TTF text obstacles`, {
      text: text.replace(/\n/g, '\\n'),
      fontUrl,
      fontSize,
      letterCount: letterIds.length,
      wordTag,
      lineCount: lines.length
    });

    // TTF fonts use font metrics, not PNG dimensions, so debug info is empty
    return {
      letterIds,
      wordTag,
      letterMap,
      letterDebugInfo: []
    };
  }

  /**
   * Spawn falling TTF text obstacles.
   * Same as addTTFTextObstacles but obstacles are non-static (fall with gravity).
   */
  async spawnFallingTTFTextObstacles(config: TTFTextObstacleConfig): Promise<TextObstacleResult> {
    return this.addTTFTextObstacles({ ...config, isStatic: false });
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

    // Draw TTF glyphs using canvas fillText (clean text rendering)
    // Only when not in debug mode - debug mode shows collision shapes instead
    if (!this.config.debug) {
      this.drawTTFGlyphs();
    }

    // Draw debug overlays after Matter.js renders
    if (this.config.debug) {
      this.drawDebugOverlays();
    }

    this.fireUpdateCallbacks();
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * Draw debug overlays for letter original dimension boxes
   */
  private drawDebugOverlays(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    // Draw original dimension boxes for all letters
    for (const [, debugInfos] of this.letterDebugInfo) {
      for (const info of debugInfos) {
        // Check if the obstacle still exists
        const obstacle = this.obstacles.get(info.id);
        if (!obstacle) continue;

        // Get current body position (letters may have moved if not static)
        const body = obstacle.body;

        // Draw the original dimension box (cyan dashed outline)
        ctx.save();
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        // Translate and rotate with the body
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        // Draw rectangle centered on body (box dimensions relative to center)
        const halfWidth = info.scaledWidth / 2;
        const halfHeight = info.scaledHeight / 2;
        ctx.strokeRect(-halfWidth, -halfHeight, info.scaledWidth, info.scaledHeight);

        ctx.restore();
      }
    }
  }

  /**
   * Draw TTF glyphs using canvas fillText for clean text rendering
   */
  private drawTTFGlyphs(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    for (const [, entry] of this.obstacles) {
      if (!entry.ttfGlyph) continue;

      const { char, fontSize, fontFamily, fillColor, offsetX, offsetY } = entry.ttfGlyph;
      const body = entry.body;

      ctx.save();

      // Move to body position and rotate
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);

      // Set up font
      ctx.font = `${fontSize}px "${fontFamily}"`;
      ctx.fillStyle = fillColor;
      ctx.textBaseline = 'alphabetic';

      // Draw at offset from body center (offset points to baseline position)
      ctx.fillText(char, offsetX, offsetY);

      ctx.restore();
    }
  }

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
