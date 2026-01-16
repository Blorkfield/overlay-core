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
  ObjectConfig,
  UpdateCallback,
  UpdateCallbackData,
  DynamicObject,
  ContainerOptions,
  Bounds,
  EffectConfig,
  DespawnEffectConfig,
  TextObstacleConfig,
  TextObstacleResult,
  TTFTextObstacleConfig,
  FontInfo,
  FontManifest,
  LetterDebugInfo
} from './types';

interface TTFGlyphRenderInfo {
  char: string;
  fontSize: number;
  fontFamily: string;
  fillColor: string;
  // Offset from body center to baseline position for fillText
  offsetX: number;
  offsetY: number;
}

/**
 * Internal representation of a scene object.
 * Behavior is determined by tags:
 * - 'falling': Object is dynamic (not static), affected by gravity
 * - 'follow': Object follows mouse when grounded
 * - 'grabable': Object can be dragged via mouse constraint
 */
interface ObjectEntry {
  id: string;
  body: Matter.Body;
  tags: string[];
  spawnTime: number;
  ttl?: number;
  despawnEffect?: DespawnEffectConfig;
  /** TTF glyph rendering info (for text objects) */
  ttfGlyph?: TTFGlyphRenderInfo;
}

export class OverlayScene {
  private engine: Matter.Engine;
  private render: Matter.Render;
  private runner: Matter.Runner;
  private canvas: HTMLCanvasElement;
  /** All scene objects (unified - no more entity/obstacle distinction) */
  private objects: Map<string, ObjectEntry> = new Map();
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

    // Filter grabbing based on 'grabable' tag
    Matter.Events.on(this.mouseConstraint, 'startdrag', this.handleStartDrag);

    // Keep render in sync with mouse for pixel ratio
    this.render.mouse = this.mouse;

    // Setup effect manager - uses async spawning for image clipping support
    this.effectManager = new EffectManager(
      this.config.bounds,
      (cfg) => this.spawnObjectAsync(cfg),
      (id) => this.objects.get(id)?.body ?? null
    );
  }

  /** Filter drag events - only allow grabbing objects with 'grabable' tag */
  private handleStartDrag = (event: Matter.IEvent<Matter.MouseConstraint> & { body?: Matter.Body }): void => {
    const body = event.body;
    if (!body) return;

    // Find the object entry for this body
    const entry = this.findObjectByBody(body);

    // If object doesn't have 'grabable' tag, release the constraint immediately
    if (!entry || !entry.tags.includes('grabable')) {
      if (this.mouseConstraint) {
        this.mouseConstraint.constraint.bodyB = null;
      }
    }
  };

  /** Find an object entry by its Matter.js body */
  private findObjectByBody(body: Matter.Body): ObjectEntry | null {
    for (const entry of this.objects.values()) {
      if (entry.body === body) {
        return entry;
      }
    }
    return null;
  }

  /** Check if a body is grounded (low vertical velocity indicates resting on something) */
  private isGrounded(body: Matter.Body): boolean {
    return Math.abs(body.velocity.y) < 0.5;
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
    if (this.mouseConstraint) {
      Matter.Events.off(this.mouseConstraint, 'startdrag', this.handleStartDrag);
    }
    Matter.Engine.clear(this.engine);
    this.objects.clear();
    this.updateCallbacks = [];
  }

  setDebug(enabled: boolean): void {
    this.config.debug = enabled;
    this.render.options.wireframes = enabled;

    // Toggle TTF glyph body visibility (show collision shapes in debug mode)
    for (const [, entry] of this.objects) {
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

  // ==================== OBJECT METHODS ====================

  /**
   * Spawn an object synchronously.
   * Object behavior is determined by tags:
   * - 'falling': Object is dynamic (affected by gravity)
   * - 'follow': Object follows mouse when grounded
   * - 'grabable': Object can be dragged
   * Without 'falling' tag, object is static.
   */
  spawnObject(config: ObjectConfig): string {
    const id = crypto.randomUUID();
    const tags = config.tags ?? [];
    const isStatic = !tags.includes('falling');

    logger.debug('OverlayScene', `Spawning object`, {
      id,
      tags,
      isStatic,
      shape: config.shape?.type ?? (config.radius ? 'circle' : 'rectangle'),
      ttl: config.ttl
    });

    // Determine if this is an "entity-style" object (has radius) or "obstacle-style" (has width/height)
    let body: Matter.Body;
    if (config.radius) {
      body = createEntity(id, config);
      // If it should be static, set it
      if (isStatic) {
        Matter.Body.setStatic(body, true);
      }
    } else {
      body = createObstacle(id, config, isStatic);
    }

    const entry: ObjectEntry = {
      id,
      body,
      tags,
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect
    };
    this.objects.set(id, entry);
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  /**
   * Spawn an object asynchronously. Required for image-based shapes that need
   * shape extraction from image alpha channel.
   */
  async spawnObjectAsync(config: ObjectConfig): Promise<string> {
    const id = crypto.randomUUID();
    const tags = config.tags ?? [];
    const isStatic = !tags.includes('falling');

    logger.debug('OverlayScene', `Spawning object async`, {
      id,
      tags,
      isStatic,
      shape: config.shape?.type ?? (config.radius ? 'circle' : 'rectangle'),
      ttl: config.ttl
    });

    let body: Matter.Body;
    if (config.radius) {
      body = await createEntityAsync(id, config);
      if (isStatic) {
        Matter.Body.setStatic(body, true);
      }
    } else {
      body = await createObstacleAsync(id, config, isStatic);
    }

    const entry: ObjectEntry = {
      id,
      body,
      tags,
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect
    };
    this.objects.set(id, entry);
    Matter.Composite.add(this.engine.world, body);
    return id;
  }

  /**
   * Add 'falling' tag to an object, making it dynamic (affected by gravity).
   * Also adds 'grabable' tag so released objects can be dragged.
   * This is the tag-based replacement for releaseObstacle().
   */
  addFallingTag(id: string): void {
    const entry = this.objects.get(id);
    if (!entry) return;
    if (!entry.tags.includes('falling')) {
      entry.tags.push('falling');
      Matter.Body.setStatic(entry.body, false);
    }
    if (!entry.tags.includes('grabable')) {
      entry.tags.push('grabable');
    }
  }

  /**
   * Add a tag to an object.
   */
  addTag(id: string, tag: string): void {
    const entry = this.objects.get(id);
    if (!entry) return;
    if (!entry.tags.includes(tag)) {
      entry.tags.push(tag);
      // Handle special tag behaviors
      if (tag === 'falling') {
        Matter.Body.setStatic(entry.body, false);
      }
    }
  }

  /**
   * Remove a tag from an object.
   */
  removeTag(id: string, tag: string): void {
    const entry = this.objects.get(id);
    if (!entry) return;
    const index = entry.tags.indexOf(tag);
    if (index !== -1) {
      entry.tags.splice(index, 1);
      // Handle special tag behaviors
      if (tag === 'falling') {
        Matter.Body.setStatic(entry.body, true);
      }
    }
  }

  /**
   * Release an object (add 'falling' tag to make it dynamic).
   * Convenience method - equivalent to addFallingTag().
   */
  releaseObject(id: string): void {
    this.addFallingTag(id);
  }

  /**
   * Release multiple objects by their IDs.
   */
  releaseObjects(ids: string[]): void {
    for (const id of ids) {
      this.releaseObject(id);
    }
  }

  /**
   * Release all static objects (add 'falling' and 'grabable' tags).
   */
  releaseAllObjects(): void {
    for (const [id] of this.objects) {
      this.addFallingTag(id);
    }
  }

  /**
   * Release objects by tag (add 'falling' and 'grabable' tags to matching objects).
   */
  releaseObjectsByTag(tag: string): void {
    for (const [id, entry] of this.objects) {
      if (entry.tags.includes(tag)) {
        this.addFallingTag(id);
      }
    }
  }

  removeObject(id: string): void {
    const entry = this.objects.get(id);
    if (!entry) return;
    Matter.Composite.remove(this.engine.world, entry.body);
    this.objects.delete(id);
  }

  removeObjects(ids: string[]): void {
    for (const id of ids) {
      this.removeObject(id);
    }
  }

  removeAllObjects(): void {
    for (const entry of this.objects.values()) {
      Matter.Composite.remove(this.engine.world, entry.body);
    }
    this.objects.clear();
  }

  removeObjectsByTag(tag: string): void {
    const toRemove: string[] = [];
    for (const [id, entry] of this.objects) {
      if (entry.tags.includes(tag)) {
        Matter.Composite.remove(this.engine.world, entry.body);
        toRemove.push(id);
      }
    }
    toRemove.forEach((id) => this.objects.delete(id));
    // Clean up letter debug info if this was a word tag
    this.letterDebugInfo.delete(tag);
  }

  getObjectIds(): string[] {
    return Array.from(this.objects.keys());
  }

  getObjectIdsByTag(tag: string): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.objects) {
      if (entry.tags.includes(tag)) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Get all unique tags currently in use by objects in the scene.
   */
  getAllTags(): string[] {
    const tagsSet = new Set<string>();
    for (const entry of this.objects.values()) {
      for (const tag of entry.tags) {
        tagsSet.add(tag);
      }
    }
    return Array.from(tagsSet).sort();
  }

  setMousePosition(x: number, _y: number): void {
    this.mouseX = x;
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
    const stringTag = config.stringTag ?? `str-${crypto.randomUUID().slice(0, 8)}`;
    // Determine if static based on tags (no 'falling' tag = static)
    const baseTags = config.tags ?? [];
    const isStatic = !baseTags.includes('falling');
    const letterColor = config.letterColor;

    const letterIds: string[] = [];
    const letterMap = new Map<string, string>();
    const debugInfo: LetterDebugInfo[] = [];

    // Track word boundaries for word-level tagging
    const wordTagsSet = new Set<string>();
    let currentWordIndex = 0;
    let inWord = false;

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

      // New line = end of current word (if we were in one)
      if (inWord) {
        currentWordIndex++;
        inWord = false;
      }

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];

        // Handle spaces - use average letter width or letterSpacing config
        if (char === ' ') {
          // Use explicit letterSpacing if provided, otherwise use letterSize as space width
          // TODO Replace this with a configured value
          currentX += 20;
          globalCharIndex++;
          // Space ends the current word
          if (inWord) {
            currentWordIndex++;
            inWord = false;
          }
          continue;
        }

        // Only process A-Z, a-z, and 0-9
        if (!/^[A-Za-z0-9]$/.test(char)) {
          globalCharIndex++;
          continue;
        }

        // We're now in a word
        inWord = true;
        const wordTag = `${stringTag}-word-${currentWordIndex}`;
        wordTagsSet.add(wordTag);

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
        const tags = [...(config.tags ?? []), stringTag, wordTag, `letter-${char}`, `letter-index-${globalCharIndex}`];

        const id = crypto.randomUUID();

        // Create clipped letter body at the center position
        const objectConfig: ObjectConfig = {
          x: centerX,
          y: centerY,
          imageUrl,
          size: letterSize,
          tags,
          ttl: config.ttl
        };

        const result = await createBoxObstacleWithInfo(id, objectConfig, isStatic);

        const entry: ObjectEntry = {
          id,
          body: result.body,
          tags,
              spawnTime: performance.now(),
          ttl: config.ttl
        };
        this.objects.set(id, entry);
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

    // Store debug info for this string
    this.letterDebugInfo.set(stringTag, debugInfo);

    const wordTags = Array.from(wordTagsSet);
    logger.info('OverlayScene', `Created text obstacles`, {
      text: text.replace(/\n/g, '\\n'),
      fontName,
      letterCount: letterIds.length,
      stringTag,
      wordTags,
      letterColor,
      lineCount: lines.length
    });

    return {
      letterIds,
      stringTag,
      wordTags,
      letterMap,
      letterDebugInfo: debugInfo
    };
  }

  /**
   * Spawn falling text objects from a string.
   * Same as addTextObstacles but with 'falling' tag (objects fall with gravity).
   */
  async spawnFallingTextObstacles(config: TextObstacleConfig): Promise<TextObstacleResult> {
    const tags = [...(config.tags ?? [])];
    if (!tags.includes('falling')) tags.push('falling');
    return this.addTextObstacles({ ...config, tags });
  }

  /**
   * Release all letters in a word (add 'falling' tag so they fall).
   * @param wordTag - The word tag returned from addTextObstacles
   */
  releaseTextObstacles(wordTag: string): void {
    this.releaseObjectsByTag(wordTag);
  }

  /**
   * Release letters one by one with a delay between each.
   * @param wordTag - The word tag returned from addTextObstacles
   * @param delayMs - Delay between releasing each letter (default: 100ms)
   * @param reverse - If true, release from end to start (default: false)
   */
  async releaseTextObstaclesSequentially(wordTag: string, delayMs: number = 100, reverse: boolean = false): Promise<void> {
    const ids = this.getObjectIdsByTag(wordTag);
    if (reverse) ids.reverse();

    for (const id of ids) {
      this.releaseObject(id);
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
    const stringTag = config.stringTag ?? `str-${crypto.randomUUID().slice(0, 8)}`;
    // Determine if static based on tags (no 'falling' tag = static)
    const baseTags = config.tags ?? [];
    const isStatic = !baseTags.includes('falling');
    const fillColor = config.fillColor ?? '#ffffff';
    const lineHeight = config.lineHeight ?? fontSize * 1.2;

    const letterIds: string[] = [];
    const letterMap = new Map<string, string>();

    // Track word boundaries for word-level tagging
    const wordTagsSet = new Set<string>();
    let currentWordIndex = 0;
    let inWord = false;

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

      // New line = end of current word (if we were in one)
      if (inWord) {
        currentWordIndex++;
        inWord = false;
      }

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
          // Space/unsupported char ends the current word
          if (char === ' ' && inWord) {
            currentWordIndex++;
            inWord = false;
          }
          continue;
        }

        // We're now in a word
        inWord = true;
        const wordTag = `${stringTag}-word-${currentWordIndex}`;
        wordTagsSet.add(wordTag);

        const id = crypto.randomUUID();
        const tags = [...(config.tags ?? []), stringTag, wordTag, `letter-${char}`, `letter-index-${globalCharIndex}`];

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

        const entry: ObjectEntry = {
          id,
          body,
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
        this.objects.set(id, entry);
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

    const wordTags = Array.from(wordTagsSet);
    logger.info('OverlayScene', `Created TTF text obstacles`, {
      text: text.replace(/\n/g, '\\n'),
      fontUrl,
      fontSize,
      letterCount: letterIds.length,
      stringTag,
      wordTags,
      lineCount: lines.length
    });

    // TTF fonts use font metrics, not PNG dimensions, so debug info is empty
    return {
      letterIds,
      stringTag,
      wordTags,
      letterMap,
      letterDebugInfo: []
    };
  }

  /**
   * Spawn falling TTF text objects.
   * Same as addTTFTextObstacles but with 'falling' tag (objects fall with gravity).
   */
  async spawnFallingTTFTextObstacles(config: TTFTextObstacleConfig): Promise<TextObstacleResult> {
    const tags = [...(config.tags ?? [])];
    if (!tags.includes('falling')) tags.push('falling');
    return this.addTTFTextObstacles({ ...config, tags });
  }

  // ==================== COMBINED TAG METHODS ====================

  removeAllByTag(tag: string): void {
    this.removeObjectsByTag(tag);
  }

  removeAll(): void {
    this.removeAllObjects();
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
    // Update effects (spawn objects)
    this.effectManager.update();

    // Check for TTL expiration
    this.checkTTLExpiration();

    // Apply tag-based behaviors to all objects
    const mouseX = this.mouse?.position.x ?? this.mouseX;

    for (const entry of this.objects.values()) {
      // Only apply mouse force to objects with 'follow' tag, and not if being dragged
      const isDragging = this.mouseConstraint?.body === entry.body;
      if (!isDragging && entry.tags.includes('follow')) {
        applyMouseForce(entry.body, mouseX, this.isGrounded(entry.body));
      }

      // Apply horizontal wrapping to dynamic objects (objects with 'falling' tag)
      if (this.config.wrapHorizontal && entry.tags.includes('falling')) {
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
        // Check if the object still exists
        const object = this.objects.get(info.id);
        if (!object) continue;

        // Get current body position (letters may have moved if dynamic)
        const body = object.body;

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

    for (const [, entry] of this.objects) {
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

    // Check all objects for expiration
    const expiredObjects: string[] = [];
    for (const [id, entry] of this.objects) {
      if (entry.ttl !== undefined && now - entry.spawnTime >= entry.ttl) {
        // TODO: Trigger despawn effect when implemented
        // if (entry.despawnEffect) { ... }
        expiredObjects.push(id);
      }
    }
    for (const id of expiredObjects) {
      this.removeObject(id);
    }
  }

  private fireUpdateCallbacks(): void {
    // Collect all dynamic objects (objects with 'falling' tag)
    const objects: DynamicObject[] = [];
    this.objects.forEach((entry) => {
      if (entry.tags.includes('falling')) {
        objects.push({
          id: entry.id,
          x: entry.body.position.x,
          y: entry.body.position.y,
          angle: entry.body.angle,
          tags: entry.tags
        });
      }
    });

    const data: UpdateCallbackData = { objects };
    this.updateCallbacks.forEach((cb) => cb(data));
  }

}
