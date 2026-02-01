import Matter from 'matter-js';
import { createEngine, createRender } from './engine';
import { createBoundaries, createBoundariesWithFloorConfig, createEntity, createEntityAsync, createObstacle, createObstacleAsync, createBoxObstacleWithInfo, getImageDimensions } from './bodies';
import { tintImage } from './imageClip';
import { loadFont, getGlyphData, getKerning, measureText, type LoadedFont } from './fontLoader';
import { logger } from './logger';
import { wrapHorizontal } from './entity';
import { EffectManager } from './EffectManager';
import { BackgroundManager } from './backgroundManager';
import type {
  OverlaySceneConfig,
  ObjectConfig,
  UpdateCallback,
  UpdateCallbackData,
  DynamicObject,
  ObjectState,
  LifecycleEvent,
  LifecycleCallback,
  ContainerOptions,
  Bounds,
  EffectConfig,
  DespawnEffectConfig,
  TextAlign,
  TextBounds,
  TextObstacleConfig,
  TextObstacleResult,
  TTFTextObstacleConfig,
  FontInfo,
  FontManifest,
  LetterDebugInfo,
  DOMObstacleConfig,
  DOMObstacleResult,
  BackgroundConfig
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
 * All objects are stored uniformly - behavior is determined entirely by tags:
 * - 'falling': Object is dynamic (affected by gravity). Without this tag, object is static.
 * - 'follow': Object follows mouse position when grounded
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
  /** Pressure threshold - when reached, this obstacle becomes dynamic */
  pressureThreshold?: number;
  /** If set, collapse all letters with this word tag together when word total reaches threshold */
  wordCollapseTag?: string;
  /** Weight for pressure calculation (default: 1). Higher weight = more pressure contribution */
  weight: number;
  /** Shadow config - when set, a washed-out static copy is left behind on collapse */
  shadow?: { opacity: number };
  /** Original position (for shadow placement) */
  originalPosition?: { x: number; y: number };
  /** Image URL (for shadow rendering) */
  imageUrl?: string;
  /** Image size (for shadow rendering) */
  imageSize?: number;
  /** Clicks remaining before this obstacle collapses (undefined = no click behavior) */
  clicksRemaining?: number;
  /** DOM element linked to this physics body (for DOM obstacles) */
  domElement?: HTMLElement;
  /** Shadow DOM element (created on collapse) */
  domShadowElement?: HTMLElement;
  /** Original transform state for DOM element */
  domOriginalTransform?: string;
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
  private config: OverlaySceneConfig;
  private animationFrameId: number | null = null;
  private mouse: Matter.Mouse | null = null;
  private mouseConstraint: Matter.MouseConstraint | null = null;
  private effectManager: EffectManager;
  private fonts: FontInfo[] = [];
  private fontsInitialized: boolean = false;
  private letterDebugInfo: Map<string, LetterDebugInfo[]> = new Map(); // wordTag -> debug info

  // Pressure tracking: maps obstacle ID -> Set of dynamic object IDs resting on it
  private obstaclePressure: Map<string, Set<string>> = new Map();
  private previousPressure: Map<string, number> = new Map();
  private pressureLogTimer: number = 0;
  // Floor segment tracking
  private floorSegments: Matter.Body[] = [];
  private floorSegmentPressure: Map<number, Set<string>> = new Map(); // segment index -> object IDs
  private collapsedSegments: Set<number> = new Set();
  // Background manager for layered backgrounds
  private backgroundManager: BackgroundManager;
  // Lifecycle event callbacks
  private lifecycleCallbacks: {
    objectSpawned: Array<(object: ObjectState) => void>;
    objectRemoved: Array<(object: ObjectState) => void>;
    objectCollision: Array<(a: ObjectState, b: ObjectState) => void>;
  } = {
    objectSpawned: [],
    objectRemoved: [],
    objectCollision: []
  };
  // Follow targets for follow-{key} tagged objects
  private followTargets: Map<string, { x: number; y: number }> = new Map();
  // Programmatic grab state - tracks initial positions for relative movement
  private grabState: {
    entityId: string;
    grabMouseX: number;
    grabMouseY: number;
    grabBodyX: number;
    grabBodyY: number;
  } | null = null;

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
      ...config
    };
    this.engine = createEngine(this.config.gravity!);
    this.render = createRender(this.engine, canvas, this.config);
    this.runner = Matter.Runner.create();

    // Create boundaries with optional floor segments
    const boundariesResult = createBoundariesWithFloorConfig(this.config.bounds, this.config.floorConfig);
    this.boundaries = [...boundariesResult.walls, ...boundariesResult.floorSegments];
    this.floorSegments = boundariesResult.floorSegments;
    Matter.Composite.add(this.engine.world, this.boundaries);

    // Check initial floor integrity (handles minIntegrity > segments case)
    this.checkInitialFloorIntegrity();

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

    // Allow page scrolling - Matter.js adds wheel listeners that block scrolling
    // We need to remove them and allow default scroll behavior
    const wheelHandler = (this.mouse as unknown as { mousewheel: EventListener }).mousewheel;
    if (wheelHandler) {
      canvas.removeEventListener('mousewheel', wheelHandler);
      canvas.removeEventListener('DOMMouseScroll', wheelHandler);
      canvas.removeEventListener('wheel', wheelHandler);
    }
    // Allow touch scrolling on mobile
    canvas.style.touchAction = 'pan-x pan-y';

    // Filter grabbing based on 'grabable' tag
    Matter.Events.on(this.mouseConstraint, 'startdrag', this.handleStartDrag);

    // Handle clicks for click-to-fall behavior
    canvas.addEventListener('click', this.handleCanvasClick);

    // Keep render in sync with mouse for pixel ratio
    this.render.mouse = this.mouse;

    // Setup effect manager - uses async spawning for image clipping support
    this.effectManager = new EffectManager(
      this.config.bounds,
      (cfg) => this.spawnObjectAsync(cfg),
      (id) => this.objects.get(id)?.body ?? null
    );

    // Setup background manager for layered backgrounds
    const width = this.config.bounds.right - this.config.bounds.left;
    const height = this.config.bounds.bottom - this.config.bounds.top;
    this.backgroundManager = new BackgroundManager({
      canvas,
      width,
      height,
    });

    // Initialize background config (async but don't block constructor)
    this.backgroundManager.setConfig(this.config.background).catch((err) => {
      logger.error('OverlayScene', 'Failed to initialize background', {
        error: String(err),
      });
    });

    // If we have custom background layers, set Matter.js to transparent and hook render events
    if (this.backgroundManager.hasCustomLayers()) {
      this.render.options.background = 'transparent';
    }

    // Hook into Matter.js render events for layered background rendering
    Matter.Events.on(this.render, 'beforeRender', this.handleBeforeRender);
    Matter.Events.on(this.render, 'afterRender', this.handleAfterRender);

    // Hook into collision events for lifecycle callbacks
    Matter.Events.on(this.engine, 'collisionStart', this.handleCollisionStart);
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

  /** Handle canvas clicks for click-to-fall behavior */
  private handleCanvasClick = (event: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Find all bodies at the click position
    const bodies = Matter.Query.point(
      Matter.Composite.allBodies(this.engine.world),
      { x, y }
    );

    // Process each clicked body
    for (const body of bodies) {
      const entry = this.findObjectByBody(body);
      if (!entry) continue;

      // Skip if already falling or no click behavior
      if (entry.tags.includes('falling')) continue;
      if (entry.clicksRemaining === undefined) continue;

      // Decrement clicks remaining
      entry.clicksRemaining--;

      const name = this.getObstacleDisplayName(entry);
      logger.debug('OverlayScene', `Click on ${name}: ${entry.clicksRemaining} clicks remaining`);

      // Collapse if no clicks remaining
      if (entry.clicksRemaining <= 0) {
        this.collapseObstacle(entry);
      }
    }
  };

  /**
   * Handler for Matter.js beforeRender event.
   * Draws base background layers (color + image) before physics objects.
   */
  private handleBeforeRender = (): void => {
    if (this.backgroundManager.hasCustomLayers()) {
      this.backgroundManager.renderBaseLayers();
    }
  };

  /**
   * Handler for Matter.js afterRender event.
   * Draws transparency/frosted glass layer after physics objects.
   */
  private handleAfterRender = (): void => {
    this.backgroundManager.renderOverlay();
  };

  /**
   * Handler for Matter.js collision events.
   * Emits objectCollision lifecycle events.
   */
  private handleCollisionStart = (event: Matter.IEventCollision<Matter.Engine>): void => {
    for (const pair of event.pairs) {
      const entryA = this.findObjectByBody(pair.bodyA);
      const entryB = this.findObjectByBody(pair.bodyB);

      // Only emit if both bodies are tracked objects (not boundaries)
      if (entryA && entryB) {
        this.emitLifecycleEvent(
          'objectCollision',
          this.toObjectState(entryA),
          this.toObjectState(entryB)
        );
      }
    }
  };

  /** Get a display name for an obstacle (letter char or short ID) */
  private getObstacleDisplayName(entry: ObjectEntry): string {
    const letterTag = entry.tags.find(t => t.startsWith('letter-') && !t.startsWith('letter-index-'));
    if (letterTag) return letterTag.replace('letter-', '');
    if (entry.ttfGlyph) return entry.ttfGlyph.char;
    return entry.id.slice(0, 4);
  }

  /** Update pressure tracking - check which dynamic objects rest on static obstacles */
  private updatePressure(): void {
    // Collect static obstacles and dynamic objects
    const obstacles: ObjectEntry[] = [];
    const dynamics: ObjectEntry[] = [];

    for (const entry of this.objects.values()) {
      if (entry.tags.includes('falling')) {
        // Only count resting objects (low velocity)
        if (Math.abs(entry.body.velocity.y) < 2) {
          dynamics.push(entry);
        }
      } else {
        obstacles.push(entry);
      }
    }

    // Build new pressure map
    const newPressure: Map<string, Set<string>> = new Map();

    for (const obstacle of obstacles) {
      const resting = new Set<string>();
      const obsBounds = obstacle.body.bounds;

      for (const dyn of dynamics) {
        const dynBounds = dyn.body.bounds;

        // Check if dynamic object is resting on/in obstacle:
        // Dynamic's bottom is within the obstacle's vertical range (with some tolerance above)
        // AND horizontal positions overlap
        const tolerance = 10; // pixels above obstacle top
        const dynBottom = dynBounds.max.y;
        const obsTop = obsBounds.min.y;
        const obsBottom = obsBounds.max.y;

        // Dynamic is "on" obstacle if its bottom is between (slightly above top) and bottom
        const verticallyOn = dynBottom >= obsTop - tolerance && dynBottom <= obsBottom;

        const horizontalOverlap =
          dynBounds.max.x > obsBounds.min.x &&
          dynBounds.min.x < obsBounds.max.x;

        if (verticallyOn && horizontalOverlap) {
          resting.add(dyn.id);
        }
      }

      if (resting.size > 0) {
        newPressure.set(obstacle.id, resting);
      }
    }

    // Check thresholds and collapse obstacles that exceed them
    this.checkPressureThresholds(obstacles, newPressure);

    // Track floor segment pressure
    this.updateFloorSegmentPressure(dynamics);

    // Check floor segment thresholds
    this.checkFloorSegmentThresholds();

    // Update stored state
    this.obstaclePressure = newPressure;
    this.previousPressure.clear();
    for (const [id, set] of newPressure) {
      this.previousPressure.set(id, set.size);
    }

    // Timed summary log every ~2 seconds (120 frames at 60fps)
    this.pressureLogTimer++;
    if (this.pressureLogTimer >= 120) {
      this.pressureLogTimer = 0;
      this.logPressureSummary();
    }
  }

  /** Update pressure tracking for each floor segment */
  private updateFloorSegmentPressure(dynamics: ObjectEntry[]): void {
    // Clear and rebuild segment pressure
    this.floorSegmentPressure.clear();

    // Build set of object IDs that are resting on obstacles (letters)
    // These should NOT count toward floor pressure
    const onObstacles = new Set<string>();
    for (const objectIds of this.obstaclePressure.values()) {
      for (const id of objectIds) {
        onObstacles.add(id);
      }
    }

    for (let i = 0; i < this.floorSegments.length; i++) {
      if (this.collapsedSegments.has(i)) continue;

      const segment = this.floorSegments[i];
      const segmentBounds = segment.bounds;
      const resting = new Set<string>();

      for (const dyn of dynamics) {
        // Skip objects resting on obstacles - they don't contribute to floor pressure
        if (onObstacles.has(dyn.id)) continue;

        const dynBounds = dyn.body.bounds;

        // Check horizontal overlap with segment
        const horizontalOverlap =
          dynBounds.max.x > segmentBounds.min.x &&
          dynBounds.min.x < segmentBounds.max.x;

        // Check if object is actually near the floor (within 10px of segment top)
        const nearFloor = dynBounds.max.y >= segmentBounds.min.y - 10;

        if (horizontalOverlap && nearFloor) {
          resting.add(dyn.id);
        }
      }

      if (resting.size > 0) {
        this.floorSegmentPressure.set(i, resting);
      }
    }
  }

  /** Check floor segment thresholds and collapse segments that exceed them */
  private checkFloorSegmentThresholds(): void {
    const floorConfig = this.config.floorConfig;
    if (!floorConfig?.threshold) return;

    for (let i = 0; i < this.floorSegments.length; i++) {
      if (this.collapsedSegments.has(i)) continue;

      // Determine threshold for this segment
      let threshold: number | undefined;
      if (floorConfig?.threshold !== undefined) {
        threshold = Array.isArray(floorConfig.threshold)
          ? floorConfig.threshold[i]
          : floorConfig.threshold;
      }
      if (threshold === undefined) continue;

      const objectIds = this.floorSegmentPressure.get(i);
      const pressure = objectIds ? this.calculateWeightedPressure(objectIds) : 0;

      if (pressure >= threshold) {
        this.collapseFloorSegment(i, `pressure ${pressure} >= threshold ${threshold}`);
      }
    }
  }

  /** Collapse a single floor segment */
  private collapseFloorSegment(index: number, reason: string): void {
    if (this.collapsedSegments.has(index)) return;
    this.collapsedSegments.add(index);

    const segment = this.floorSegments[index];
    Matter.Composite.remove(this.engine.world, segment);
    logger.debug('OverlayScene', `Floor segment ${index} collapsed: ${reason}`);

    // Check floor integrity after collapse
    this.checkFloorIntegrity();
  }

  /** Check if floor integrity requirement is violated and collapse all remaining if so */
  private checkFloorIntegrity(): void {
    const minIntegrity = this.config.floorConfig?.minIntegrity;
    if (minIntegrity === undefined) return;

    const totalSegments = this.floorSegments.length;
    const remainingSegments = totalSegments - this.collapsedSegments.size;

    if (remainingSegments < minIntegrity && remainingSegments > 0) {
      logger.debug('OverlayScene', `Floor integrity failed: ${remainingSegments} remaining < ${minIntegrity} required. Collapsing all.`);

      // Collapse all remaining segments
      for (let i = 0; i < totalSegments; i++) {
        if (!this.collapsedSegments.has(i)) {
          this.collapsedSegments.add(i);
          const segment = this.floorSegments[i];
          Matter.Composite.remove(this.engine.world, segment);
          logger.debug('OverlayScene', `Floor segment ${i} collapsed: integrity failure cascade`);
        }
      }
    }
  }

  /** Check floor integrity on initialization (handles minIntegrity > segments) */
  private checkInitialFloorIntegrity(): void {
    const minIntegrity = this.config.floorConfig?.minIntegrity;
    if (minIntegrity === undefined) return;

    const totalSegments = this.floorSegments.length;

    if (totalSegments < minIntegrity) {
      logger.debug('OverlayScene', `Floor integrity impossible: ${totalSegments} segments < ${minIntegrity} required. Collapsing all immediately.`);

      // Collapse all segments immediately
      for (let i = 0; i < totalSegments; i++) {
        this.collapsedSegments.add(i);
        const segment = this.floorSegments[i];
        Matter.Composite.remove(this.engine.world, segment);
      }
    }
  }

  /** Log a summary of pressure on all obstacles, grouped by word */
  private logPressureSummary(): void {
    if (this.obstaclePressure.size === 0 && this.floorSegmentPressure.size === 0 && this.collapsedSegments.size === 0) return;

    // Group by word tag
    const wordPressure: Map<string, string[]> = new Map();

    for (const [obstacleId, objectIds] of this.obstaclePressure) {
      const entry = this.objects.get(obstacleId);
      if (!entry) continue;

      // Find word tag
      const wordTag = entry.tags.find(t => t.includes('-word-'));
      const groupKey = wordTag ?? 'other';

      // Get letter display name and weighted pressure
      const letter = this.getObstacleDisplayName(entry);
      const pressure = this.calculateWeightedPressure(objectIds);

      if (!wordPressure.has(groupKey)) {
        wordPressure.set(groupKey, []);
      }
      wordPressure.get(groupKey)!.push(`${letter}:${pressure}`);
    }

    // Format output
    const parts: string[] = [];
    for (const [wordTag, letters] of wordPressure) {
      // Extract word index from tag like "str-abc123-word-0"
      const match = wordTag.match(/-word-(\d+)$/);
      const wordLabel = match ? `w${match[1]}` : wordTag.slice(0, 8);
      parts.push(`[${wordLabel}: ${letters.join(' ')}]`);
    }

    // Add floor segment pressure if any
    if (this.floorSegmentPressure.size > 0 || this.collapsedSegments.size > 0) {
      const floorConfig = this.config.floorConfig;

      // Get threshold for display
      let thresholdDisplay: number | string = '∞';
      if (floorConfig?.threshold !== undefined && !Array.isArray(floorConfig.threshold)) {
        thresholdDisplay = floorConfig.threshold;
      }

      // Build segment pressure display: "seg0=42 seg1=X seg2=55"
      const segmentParts: string[] = [];
      for (let i = 0; i < this.floorSegments.length; i++) {
        if (this.collapsedSegments.has(i)) {
          segmentParts.push(`s${i}=X`);
          continue;
        }

        const objectIds = this.floorSegmentPressure.get(i);
        const pressure = objectIds ? this.calculateWeightedPressure(objectIds) : 0;
        if (pressure > 0) {
          segmentParts.push(`s${i}=${pressure}`);
        }
      }

      if (segmentParts.length > 0) {
        parts.push(`[floor(t=${thresholdDisplay}): ${segmentParts.join(' ')}]`);
      }
    }

    if (parts.length > 0) {
      console.log('[Pressure]', parts.join(' '));
    }
  }

  /** Calculate weighted pressure from a set of object IDs */
  private calculateWeightedPressure(objectIds: Set<string>): number {
    let total = 0;
    for (const id of objectIds) {
      const entry = this.objects.get(id);
      if (entry) {
        total += entry.weight;
      }
    }
    return total;
  }

  /** Check pressure thresholds and collapse obstacles that exceed them */
  private checkPressureThresholds(obstacles: ObjectEntry[], pressure: Map<string, Set<string>>): void {
    // Track word-level pressure for wordCollapse mode
    const wordPressure: Map<string, number> = new Map();
    const wordObstacles: Map<string, ObjectEntry[]> = new Map();

    // First pass: calculate per-letter and word-level pressure (using weights)
    for (const obstacle of obstacles) {
      if (obstacle.pressureThreshold === undefined) continue;

      const objectsOnObstacle = pressure.get(obstacle.id);
      const obstaclePressure = objectsOnObstacle ? this.calculateWeightedPressure(objectsOnObstacle) : 0;

      if (obstacle.wordCollapseTag) {
        // Accumulate word-level pressure
        const currentTotal = wordPressure.get(obstacle.wordCollapseTag) ?? 0;
        wordPressure.set(obstacle.wordCollapseTag, currentTotal + obstaclePressure);

        // Track obstacles in this word
        if (!wordObstacles.has(obstacle.wordCollapseTag)) {
          wordObstacles.set(obstacle.wordCollapseTag, []);
        }
        wordObstacles.get(obstacle.wordCollapseTag)!.push(obstacle);
      } else {
        // Per-letter mode: check individual threshold
        if (obstaclePressure >= obstacle.pressureThreshold) {
          this.collapseObstacle(obstacle);
        }
      }
    }

    // Second pass: check word-level thresholds
    for (const [wordTag, total] of wordPressure) {
      const wordObs = wordObstacles.get(wordTag);
      if (!wordObs || wordObs.length === 0) continue;

      // All letters in a word share the same threshold (from config)
      const threshold = wordObs[0].pressureThreshold;
      if (threshold !== undefined && total >= threshold) {
        // Collapse all letters in this word
        for (const obs of wordObs) {
          this.collapseObstacle(obs);
        }
        console.log(`[Pressure] Word collapsed! ${wordTag} (total: ${total} >= ${threshold})`);
      }
    }
  }

  /** Convert a static obstacle to dynamic (make it fall) */
  private collapseObstacle(entry: ObjectEntry): void {
    // Skip if already falling
    if (entry.tags.includes('falling')) return;

    const name = this.getObstacleDisplayName(entry);
    console.log(`[Pressure] Collapsed: ${name}`);

    // Create shadow if configured
    if (entry.shadow && entry.originalPosition) {
      this.createShadow(entry);
    }

    // Add falling tag
    entry.tags.push('falling');

    // Make body dynamic
    Matter.Body.setStatic(entry.body, false);

    // Clear threshold so it doesn't trigger again
    entry.pressureThreshold = undefined;
    entry.wordCollapseTag = undefined;
  }

  /** Create a static shadow copy of an obstacle at its original position */
  private async createShadow(entry: ObjectEntry): Promise<void> {
    if (!entry.originalPosition) return;

    const opacity = entry.shadow?.opacity ?? 0.3;
    const shadowId = `shadow-${entry.id}`;

    // Handle DOM element shadows (clone the element)
    if (entry.domElement && entry.originalPosition) {
      const shadowElement = entry.domElement.cloneNode(true) as HTMLElement;
      shadowElement.style.opacity = String(opacity);
      shadowElement.style.pointerEvents = 'none';
      // Explicitly set shadow position from originalPosition
      // Don't rely on cloned styles - CSS may override them
      const { x, y } = entry.originalPosition;
      const width = entry.domElement.offsetWidth;
      const height = entry.domElement.offsetHeight;
      const computedLeft = x - width / 2;
      const computedTop = y - height / 2;
      console.log('[Shadow Debug]', {
        originalPosition: { x, y },
        elementSize: { width, height },
        computedPosition: { left: computedLeft, top: computedTop },
        elementCurrentStyle: {
          left: entry.domElement.style.left,
          top: entry.domElement.style.top,
          transform: entry.domElement.style.transform
        }
      });
      shadowElement.style.setProperty('left', `${computedLeft}px`, 'important');
      shadowElement.style.setProperty('top', `${computedTop}px`, 'important');
      shadowElement.style.setProperty('transform', 'rotate(0deg)', 'important');
      // Insert shadow before the original element
      entry.domElement.parentNode?.insertBefore(shadowElement, entry.domElement);
      entry.domShadowElement = shadowElement;
      return;
    }

    // Handle TTF glyph shadows (canvas-rendered text)
    if (entry.ttfGlyph) {
      // For TTF glyphs, create a minimal static body and store shadow glyph info
      const body = Matter.Bodies.circle(entry.originalPosition.x, entry.originalPosition.y, 1, {
        isStatic: true,
        isSensor: true, // Don't collide
        label: `shadow:${shadowId}`,
        render: { visible: false }
      });

      const shadowEntry: ObjectEntry = {
        id: shadowId,
        body,
        tags: ['shadow'],
        spawnTime: performance.now(),
        weight: 0,
        ttfGlyph: {
          ...entry.ttfGlyph,
          fillColor: this.applyOpacityToColor(entry.ttfGlyph.fillColor, opacity)
        }
      };
      this.objects.set(shadowId, shadowEntry);
      Matter.Composite.add(this.engine.world, body);
      return;
    }

    // Handle image-based shadows
    if (!entry.imageUrl) return;

    const result = await createBoxObstacleWithInfo(shadowId, {
      x: entry.originalPosition.x,
      y: entry.originalPosition.y,
      imageUrl: entry.imageUrl,
      size: entry.imageSize ?? 50,
      tags: ['shadow']
    }, true);

    // Make shadow non-colliding (purely visual)
    result.body.isSensor = true;

    // Set shadow opacity via render
    if (result.body.render.sprite) {
      result.body.render.opacity = opacity;
    }

    // Store shadow as object (static, no pressure tracking)
    const shadowEntry: ObjectEntry = {
      id: shadowId,
      body: result.body,
      tags: ['shadow'],
      spawnTime: performance.now(),
      weight: 0 // Shadows don't contribute to pressure
    };
    this.objects.set(shadowId, shadowEntry);
    Matter.Composite.add(this.engine.world, result.body);
  }

  /** Apply opacity to a CSS color string */
  private applyOpacityToColor(color: string, opacity: number): string {
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      let r, g, b;
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Handle rgb/rgba
    if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
      }
    }
    // Fallback: return with alpha
    return color;
  }

  /** Find an object entry by its Matter.js body (handles compound body parts) */
  private findObjectByBody(body: Matter.Body): ObjectEntry | null {
    // For compound bodies (created by fromVertices), collision events report parts
    // Use the parent property to find the root body we're tracking
    const rootBody = body.parent ?? body;

    for (const entry of this.objects.values()) {
      if (entry.body === body || entry.body === rootBody) {
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
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    // Clean up background render event listeners
    Matter.Events.off(this.render, 'beforeRender', this.handleBeforeRender);
    Matter.Events.off(this.render, 'afterRender', this.handleAfterRender);
    // Clean up collision event listener
    Matter.Events.off(this.engine, 'collisionStart', this.handleCollisionStart);
    Matter.Engine.clear(this.engine);
    this.objects.clear();
    this.obstaclePressure.clear();
    this.previousPressure.clear();
    this.pressureLogTimer = 0;
    this.floorSegmentPressure.clear();
    this.collapsedSegments.clear();
    this.updateCallbacks = [];
    // Clear lifecycle callbacks
    this.lifecycleCallbacks.objectSpawned = [];
    this.lifecycleCallbacks.objectRemoved = [];
    this.lifecycleCallbacks.objectCollision = [];
    // Clear follow targets
    this.followTargets.clear();
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

  /**
   * Update the background configuration at runtime.
   */
  async setBackground(config: BackgroundConfig | undefined): Promise<void> {
    await this.backgroundManager.setConfig(config);

    // Update Matter.js background based on whether we have custom layers
    if (this.backgroundManager.hasCustomLayers()) {
      this.render.options.background = 'transparent';
    } else {
      const bgConfig = this.backgroundManager.getConfig();
      this.render.options.background = bgConfig?.color ?? 'transparent';
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

    // Create and add new boundaries with floor segments
    const boundariesResult = createBoundariesWithFloorConfig(this.config.bounds, this.config.floorConfig);
    this.boundaries = [...boundariesResult.walls, ...boundariesResult.floorSegments];
    this.floorSegments = boundariesResult.floorSegments;
    this.collapsedSegments.clear();
    this.floorSegmentPressure.clear();
    Matter.Composite.add(this.engine.world, this.boundaries);

    // Check initial floor integrity (handles minIntegrity > segments case)
    this.checkInitialFloorIntegrity();

    // Update render bounds
    this.render.options.width = width;
    this.render.options.height = height;
    this.render.canvas.width = width;
    this.render.canvas.height = height;

    // Update effect manager bounds
    this.effectManager.setBounds(this.config.bounds);

    // Update background manager dimensions
    this.backgroundManager.resize(width, height);
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
    // If element is provided, delegate to DOM obstacle logic
    if (config.element) {
      const result = this.addDOMObstacleInternal({
        element: config.element,
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        tags: config.tags,
        pressureThreshold: config.pressureThreshold,
        weight: config.weight,
        shadow: config.shadow === true ? { opacity: 0.3 } : (config.shadow || undefined),
        clickToFall: config.clickToFall
      });
      return result.id;
    }

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

    // Parse pressure threshold
    let pressureThreshold: number | undefined;
    if (config.pressureThreshold) {
      pressureThreshold = typeof config.pressureThreshold.value === 'number'
        ? config.pressureThreshold.value
        : config.pressureThreshold.value[0];
    }

    // Parse shadow config (can be boolean or ShadowConfig)
    let shadow: { opacity: number } | undefined;
    if (config.shadow === true) {
      shadow = { opacity: 0.3 };
    } else if (config.shadow && typeof config.shadow === 'object') {
      shadow = { opacity: config.shadow.opacity ?? 0.3 };
    }

    // Parse click to fall config
    const clicksRemaining = config.clickToFall?.clicks;

    const entry: ObjectEntry = {
      id,
      body,
      tags,
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect,
      weight: config.weight ?? 1,
      pressureThreshold,
      shadow,
      originalPosition: shadow || clicksRemaining !== undefined ? { x: config.x, y: config.y } : undefined,
      clicksRemaining
    };
    this.objects.set(id, entry);
    Matter.Composite.add(this.engine.world, body);

    // Initialize pressure tracking for static obstacles with threshold
    if (isStatic && pressureThreshold !== undefined) {
      this.obstaclePressure.set(id, new Set());
    }

    // Emit objectSpawned event
    this.emitLifecycleEvent('objectSpawned', this.toObjectState(entry));

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

    // Parse pressure threshold
    let pressureThreshold: number | undefined;
    if (config.pressureThreshold) {
      pressureThreshold = typeof config.pressureThreshold.value === 'number'
        ? config.pressureThreshold.value
        : config.pressureThreshold.value[0];
    }

    // Parse shadow config (can be boolean or ShadowConfig)
    let shadow: { opacity: number } | undefined;
    if (config.shadow === true) {
      shadow = { opacity: 0.3 };
    } else if (config.shadow && typeof config.shadow === 'object') {
      shadow = { opacity: config.shadow.opacity ?? 0.3 };
    }

    // Parse click to fall config
    const clicksRemaining = config.clickToFall?.clicks;

    const entry: ObjectEntry = {
      id,
      body,
      tags,
      spawnTime: performance.now(),
      ttl: config.ttl,
      despawnEffect: config.despawnEffect,
      weight: config.weight ?? 1,
      pressureThreshold,
      shadow,
      originalPosition: shadow || clicksRemaining !== undefined ? { x: config.x, y: config.y } : undefined,
      clicksRemaining
    };
    this.objects.set(id, entry);
    Matter.Composite.add(this.engine.world, body);

    // Initialize pressure tracking for static obstacles with threshold
    if (isStatic && pressureThreshold !== undefined) {
      this.obstaclePressure.set(id, new Set());
    }

    // Emit objectSpawned event
    this.emitLifecycleEvent('objectSpawned', this.toObjectState(entry));

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
    // Emit objectRemoved event before removing
    this.emitLifecycleEvent('objectRemoved', this.toObjectState(entry));
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

  /**
   * Set a follow target position. Objects with 'follow-{key}' tag will
   * automatically move toward this target each frame.
   * @param key - The target key (e.g., 'absolute' for 'follow-absolute' tag)
   * @param x - Target X position
   * @param y - Target Y position
   */
  setFollowTarget(key: string, x: number, y: number): void {
    this.followTargets.set(key, { x, y });

    // Sync mouse position to Matter.Mouse for MouseConstraint compatibility
    if (key === 'mouse' && this.mouse) {
      // If we have an active programmatic grab, use relative movement
      if (this.grabState && this.mouseConstraint?.constraint.bodyB) {
        // Calculate delta from initial grab position
        const deltaX = x - this.grabState.grabMouseX;
        const deltaY = y - this.grabState.grabMouseY;

        // New position = initial body position + delta
        const newX = this.grabState.grabBodyX + deltaX;
        const newY = this.grabState.grabBodyY + deltaY;

        this.mouse.position.x = newX;
        this.mouse.position.y = newY;
        this.mouse.absolute.x = newX;
        this.mouse.absolute.y = newY;
      } else {
        this.mouse.position.x = x;
        this.mouse.position.y = y;
        this.mouse.absolute.x = x;
        this.mouse.absolute.y = y;
      }
    }
  }

  /**
   * Remove a follow target. Objects with the corresponding tag will stop following.
   * @param key - The target key to remove
   */
  removeFollowTarget(key: string): void {
    this.followTargets.delete(key);
  }

  /**
   * Get all registered follow target keys.
   * @returns Array of follow target keys
   */
  getFollowTargetKeys(): string[] {
    return Array.from(this.followTargets.keys());
  }

  // ==================== GRAB/DRAG METHODS ====================

  /**
   * Programmatically grab an object at the current mouse position.
   * Uses the externally set mouse position (via setFollowTarget('mouse', x, y))
   * or the native canvas mouse position if no external position is set.
   * Only objects with the 'grabable' tag can be grabbed.
   * @returns The ID of the grabbed object, or null if no grabable object at position
   */
  startGrab(): string | null {
    if (!this.mouseConstraint || !this.mouse) return null;

    const mouseTarget = this.followTargets.get('mouse');
    const position = mouseTarget ?? { x: this.mouse.position.x, y: this.mouse.position.y };

    const bodies = Matter.Query.point(
      Matter.Composite.allBodies(this.engine.world),
      position
    );

    for (const body of bodies) {
      const entry = this.findObjectByBody(body);
      if (entry && entry.tags.includes('grabable')) {
        // Fake mouse button state so MouseConstraint doesn't release
        this.mouse.button = 0;

        // Store grab state for relative movement calculation
        this.grabState = {
          entityId: entry.id,
          grabMouseX: position.x,
          grabMouseY: position.y,
          grabBodyX: entry.body.position.x,
          grabBodyY: entry.body.position.y
        };

        // Set constraint - pointA starts at body position so entity doesn't move
        this.mouseConstraint.constraint.pointA = {
          x: entry.body.position.x,
          y: entry.body.position.y
        };
        this.mouseConstraint.constraint.bodyB = entry.body;
        this.mouseConstraint.constraint.pointB = { x: 0, y: 0 };

        // Sync mouse position to body position so MouseConstraint doesn't override
        this.mouse.position.x = entry.body.position.x;
        this.mouse.position.y = entry.body.position.y;
        this.mouse.absolute.x = entry.body.position.x;
        this.mouse.absolute.y = entry.body.position.y;

        console.log('[overlay-core] startGrab success', {
          entityId: entry.id,
          mousePosition: position,
          bodyPosition: { x: entry.body.position.x, y: entry.body.position.y },
          grabState: this.grabState
        });

        return entry.id;
      }
    }
    return null;
  }

  /**
   * Release any currently grabbed object.
   */
  endGrab(): void {
    if (this.mouseConstraint) {
      this.mouseConstraint.constraint.bodyB = null;
    }
    // Reset mouse button state
    if (this.mouse) {
      this.mouse.button = -1;
    }
    // Clear grab state
    this.grabState = null;
  }

  /**
   * Get the ID of the currently grabbed object.
   * @returns The ID of the grabbed object, or null if nothing is grabbed
   */
  getGrabbedObject(): string | null {
    if (!this.mouseConstraint?.constraint.bodyB) return null;
    const entry = this.findObjectByBody(this.mouseConstraint.constraint.bodyB);
    return entry?.id ?? null;
  }

  // ==================== PHYSICS MANIPULATION METHODS ====================

  /**
   * Apply a force to an object.
   * @param objectId - The ID of the object
   * @param force - The force vector to apply
   */
  applyForce(objectId: string, force: { x: number; y: number }): void {
    const entry = this.objects.get(objectId);
    if (!entry) return;
    Matter.Body.applyForce(entry.body, entry.body.position, force);
  }

  /**
   * Apply a force to all objects with a specific tag.
   * @param tag - The tag to match
   * @param force - The force vector to apply
   */
  applyForceToTag(tag: string, force: { x: number; y: number }): void {
    for (const entry of this.objects.values()) {
      if (entry.tags.includes(tag)) {
        Matter.Body.applyForce(entry.body, entry.body.position, force);
      }
    }
  }

  /**
   * Set the velocity of an object.
   * @param objectId - The ID of the object
   * @param velocity - The velocity vector to set
   */
  setVelocity(objectId: string, velocity: { x: number; y: number }): void {
    const entry = this.objects.get(objectId);
    if (!entry) return;
    Matter.Body.setVelocity(entry.body, velocity);
  }

  /**
   * Set the position of an object.
   * @param objectId - The ID of the object
   * @param position - The position to set
   */
  setPosition(objectId: string, position: { x: number; y: number }): void {
    const entry = this.objects.get(objectId);
    if (!entry) return;
    Matter.Body.setPosition(entry.body, position);
  }

  // ==================== OBJECT STATE METHODS ====================

  /**
   * Get the current state of an object.
   * @param id - The ID of the object
   * @returns The object state, or null if not found
   */
  getObject(id: string): ObjectState | null {
    const entry = this.objects.get(id);
    if (!entry) return null;
    return {
      id: entry.id,
      x: entry.body.position.x,
      y: entry.body.position.y,
      velocity: { x: entry.body.velocity.x, y: entry.body.velocity.y },
      angle: entry.body.angle,
      tags: [...entry.tags]
    };
  }

  /**
   * Get the current state of all objects with a specific tag.
   * @param tag - The tag to match
   * @returns Array of object states
   */
  getObjectsByTag(tag: string): ObjectState[] {
    const result: ObjectState[] = [];
    for (const entry of this.objects.values()) {
      if (entry.tags.includes(tag)) {
        result.push({
          id: entry.id,
          x: entry.body.position.x,
          y: entry.body.position.y,
          velocity: { x: entry.body.velocity.x, y: entry.body.velocity.y },
          angle: entry.body.angle,
          tags: [...entry.tags]
        });
      }
    }
    return result;
  }

  // ==================== LIFECYCLE EVENTS ====================

  /**
   * Subscribe to a lifecycle event.
   * @param event - The event type to subscribe to
   * @param callback - The callback to invoke when the event occurs
   */
  on<T extends LifecycleEvent>(event: T, callback: LifecycleCallback<T>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.lifecycleCallbacks[event] as Array<LifecycleCallback<T>>).push(callback);
  }

  /**
   * Unsubscribe from a lifecycle event.
   * @param event - The event type to unsubscribe from
   * @param callback - The callback to remove
   */
  off<T extends LifecycleEvent>(event: T, callback: LifecycleCallback<T>): void {
    const arr = this.lifecycleCallbacks[event] as Function[];
    const idx = arr.indexOf(callback as Function);
    if (idx !== -1) arr.splice(idx, 1);
  }

  /** Create ObjectState from an ObjectEntry */
  private toObjectState(entry: ObjectEntry): ObjectState {
    return {
      id: entry.id,
      x: entry.body.position.x,
      y: entry.body.position.y,
      velocity: { x: entry.body.velocity.x, y: entry.body.velocity.y },
      angle: entry.body.angle,
      tags: [...entry.tags]
    };
  }

  /** Emit a lifecycle event to all registered callbacks */
  private emitLifecycleEvent<T extends LifecycleEvent>(
    event: T,
    ...args: T extends 'objectCollision' ? [ObjectState, ObjectState] : [ObjectState]
  ): void {
    const callbacks = this.lifecycleCallbacks[event];
    for (const cb of callbacks) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cb as Function)(...args);
    }
  }

  // ==================== PRESSURE TRACKING METHODS ====================

  /**
   * Get the current pressure (number of objects resting) on an obstacle.
   * @param obstacleId - The ID of the obstacle
   * @returns Number of objects currently resting on the obstacle
   */
  getPressure(obstacleId: string): number {
    return this.obstaclePressure.get(obstacleId)?.size ?? 0;
  }

  /**
   * Get the IDs of all objects currently resting on an obstacle.
   * @param obstacleId - The ID of the obstacle
   * @returns Array of object IDs resting on the obstacle
   */
  getObjectsRestingOn(obstacleId: string): string[] {
    const set = this.obstaclePressure.get(obstacleId);
    return set ? Array.from(set) : [];
  }

  /**
   * Get all obstacles that have pressure (at least one object resting on them).
   * @returns Map of obstacle ID -> pressure count
   */
  getAllPressure(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [id, set] of this.obstaclePressure) {
      if (set.size > 0) {
        result.set(id, set.size);
      }
    }
    return result;
  }

  /**
   * Get pressure summary for all obstacles with their display names (letters).
   * Useful for debugging and visualization.
   * @returns Array of { id, name, pressure } objects
   */
  getPressureSummary(): { id: string; name: string; pressure: number }[] {
    const summary: { id: string; name: string; pressure: number }[] = [];
    for (const [id, set] of this.obstaclePressure) {
      if (set.size > 0) {
        const entry = this.objects.get(id);
        summary.push({
          id,
          name: entry ? this.getObstacleDisplayName(entry) : id.slice(0, 4),
          pressure: set.size
        });
      }
    }
    return summary;
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

  // ==================== DOM OBSTACLE METHODS (INTERNAL) ====================

  /**
   * Internal: Attach a DOM element to physics.
   * Called by spawnObject when element is provided.
   */
  private addDOMObstacleInternal(config: DOMObstacleConfig): DOMObstacleResult {
    const { element, x, y } = config;
    const width = config.width ?? element.offsetWidth;
    const height = config.height ?? element.offsetHeight;
    const tags = config.tags ?? [];
    const isStatic = !tags.includes('falling');

    // Create a rectangular physics body
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic,
      label: `dom-${crypto.randomUUID().slice(0, 8)}`,
      render: { visible: false } // Don't render the body, DOM element is the visual
    });

    const id = body.label;

    // Determine pressure threshold
    let pressureThreshold: number | undefined;
    if (config.pressureThreshold) {
      pressureThreshold = typeof config.pressureThreshold.value === 'number'
        ? config.pressureThreshold.value
        : config.pressureThreshold.value[0];
    }

    // Determine shadow config
    const shadow = config.shadow ? { opacity: config.shadow.opacity ?? 0.3 } : undefined;

    // Determine click to fall config
    const clicksRemaining = config.clickToFall?.clicks;

    // Store original transform for shadow positioning
    const originalTransform = element.style.transform || '';

    // Setup element for physics-driven positioning
    element.style.position = 'absolute';
    element.style.transformOrigin = 'center center';

    const entry: ObjectEntry = {
      id,
      body,
      tags,
      spawnTime: performance.now(),
      pressureThreshold,
      weight: config.weight ?? 1,
      shadow,
      originalPosition: shadow || clicksRemaining !== undefined ? { x, y } : undefined,
      clicksRemaining,
      domElement: element,
      domOriginalTransform: originalTransform
    };

    this.objects.set(id, entry);
    Matter.Composite.add(this.engine.world, body);

    // Set initial DOM element position to match physics body
    this.updateDOMElementTransform(entry);

    // Initialize pressure tracking for static obstacles
    if (isStatic && pressureThreshold !== undefined) {
      this.obstaclePressure.set(id, new Set());
    }

    // Add click listener to DOM element for clickToFall behavior
    // (canvas click handler won't work since element is above canvas)
    if (clicksRemaining !== undefined) {
      const clickHandler = () => {
        const currentEntry = this.objects.get(id);
        if (!currentEntry) return;
        if (currentEntry.tags.includes('falling')) return;
        if (currentEntry.clicksRemaining === undefined) return;

        currentEntry.clicksRemaining--;
        logger.debug('OverlayScene', `Click on DOM element: ${currentEntry.clicksRemaining} clicks remaining`);

        if (currentEntry.clicksRemaining <= 0) {
          this.collapseObstacle(currentEntry);
          element.removeEventListener('click', clickHandler);
        }
      };
      element.addEventListener('click', clickHandler);
    }

    return {
      id,
      shadowElement: null // Will be populated on collapse
    };
  }

  /**
   * Get the shadow element for a DOM obstacle (available after collapse).
   */
  getDOMObstacleShadow(id: string): HTMLElement | null {
    const entry = this.objects.get(id);
    return entry?.domShadowElement ?? null;
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

    // Helper to calculate the width of a line
    const calculateLineWidth = (line: string): number => {
      let width = 0;
      for (const char of line) {
        if (char === ' ') {
          width += 20; // Space width
        } else if (/^[A-Za-z0-9]$/.test(char)) {
          const dims = charDimensions.get(char);
          if (dims) {
            const scale = letterSize / Math.max(dims.width, dims.height);
            const scaledWidth = dims.width * scale;
            const extraSpacing = config.letterSpacing !== undefined ? config.letterSpacing - scaledWidth : 0;
            width += scaledWidth + Math.max(0, extraSpacing);
          }
        }
      }
      return width;
    };

    // Calculate line widths for alignment
    const lineWidths = lines.map(line => calculateLineWidth(line));
    const align = config.align ?? 'left';
    const maxLineWidth = Math.max(...lineWidths, 0);

    // Calculate bounds based on alignment
    let boundsLeft: number;
    let boundsRight: number;
    switch (align) {
      case 'center':
        boundsLeft = config.x - maxLineWidth / 2;
        boundsRight = config.x + maxLineWidth / 2;
        break;
      case 'right':
        boundsLeft = config.x - maxLineWidth;
        boundsRight = config.x;
        break;
      default: // 'left'
        boundsLeft = config.x;
        boundsRight = config.x + maxLineWidth;
    }
    const boundsTop = config.y - letterSize / 2; // Letters are centered on y
    const totalHeight = lines.length > 0 ? (lines.length - 1) * lineHeight + letterSize : 0;
    const boundsBottom = boundsTop + totalHeight;

    // Track Y position for each line
    let currentY = config.y;
    let globalCharIndex = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const chars = line.split('');

      // Calculate starting X based on alignment
      const lineWidth = lineWidths[lineIndex];
      let currentX: number;
      switch (align) {
        case 'center':
          currentX = config.x - lineWidth / 2;
          break;
        case 'right':
          currentX = config.x - lineWidth;
          break;
        default: // 'left'
          currentX = config.x;
      }

      // New line = end of current word (if we were in one)
      if (inWord) {
        currentWordIndex++;
        inWord = false;
      }

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];

        // Handle spaces - use letterSpacing if provided, otherwise use letterSize as space width
        if (char === ' ') {
          const spaceWidth = config.letterSpacing ?? letterSize;
          currentX += spaceWidth;
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

        // Determine pressure threshold for this letter
        let pressureThreshold: number | undefined;
        let wordCollapseTag: string | undefined;
        if (config.pressureThreshold) {
          const pt = config.pressureThreshold;
          if (Array.isArray(pt.value)) {
            // Per-letter thresholds by index
            pressureThreshold = pt.value[letterIds.length];
          } else {
            pressureThreshold = pt.value;
            if (pt.wordCollapse) {
              wordCollapseTag = wordTag;
            }
          }
        }

        // Determine weight for this letter
        let weight = 1;
        if (config.weight) {
          if (Array.isArray(config.weight.value)) {
            weight = config.weight.value[letterIds.length] ?? 1;
          } else {
            weight = config.weight.value;
          }
        }

        // Determine shadow config
        const shadow = config.shadow ? { opacity: config.shadow.opacity ?? 0.3 } : undefined;

        // Determine click to fall config
        const clicksRemaining = config.clickToFall?.clicks;

        const entry: ObjectEntry = {
          id,
          body: result.body,
          tags,
          spawnTime: performance.now(),
          ttl: config.ttl,
          pressureThreshold,
          wordCollapseTag,
          weight,
          shadow,
          originalPosition: shadow || clicksRemaining !== undefined ? { x: centerX, y: centerY } : undefined,
          imageUrl: shadow || clicksRemaining !== undefined ? imageUrl : undefined,
          imageSize: shadow || clicksRemaining !== undefined ? letterSize : undefined,
          clicksRemaining
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

    const bounds: TextBounds = {
      left: boundsLeft,
      right: boundsRight,
      top: boundsTop,
      bottom: boundsBottom,
      width: boundsRight - boundsLeft,
      height: boundsBottom - boundsTop
    };

    return {
      letterIds,
      stringTag,
      wordTags,
      letterMap,
      letterDebugInfo: debugInfo,
      bounds
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
    const fillColors = config.fillColors;
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

    // Calculate line widths for alignment
    const lineWidths = lines.map(line => measureText(loadedFont, line, fontSize));
    const align = config.align ?? 'left';
    const maxLineWidth = Math.max(...lineWidths, 0);

    // Calculate bounds based on alignment
    // For TTF, y is the baseline, so top is above baseline and bottom is below
    let boundsLeft: number;
    let boundsRight: number;
    switch (align) {
      case 'center':
        boundsLeft = x - maxLineWidth / 2;
        boundsRight = x + maxLineWidth / 2;
        break;
      case 'right':
        boundsLeft = x - maxLineWidth;
        boundsRight = x;
        break;
      default: // 'left'
        boundsLeft = x;
        boundsRight = x + maxLineWidth;
    }
    // Approximate bounds for TTF: ascent above baseline, descent below
    // Using fontSize as approximate height, baseline at ~80% from top
    const boundsTop = y - fontSize * 0.8;
    const totalHeight = lines.length > 0 ? (lines.length - 1) * lineHeight + fontSize : 0;
    const boundsBottom = boundsTop + totalHeight;

    // Track current Y position for each line
    let currentY = y;
    let globalCharIndex = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Calculate starting X based on alignment
      const lineWidth = lineWidths[lineIndex];
      let currentX: number;
      switch (align) {
        case 'center':
          currentX = x - lineWidth / 2;
          break;
        case 'right':
          currentX = x - lineWidth;
          break;
        default: // 'left'
          currentX = x;
      }

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

        // Determine pressure threshold for this letter
        let pressureThreshold: number | undefined;
        let wordCollapseTag: string | undefined;
        if (config.pressureThreshold) {
          const pt = config.pressureThreshold;
          if (Array.isArray(pt.value)) {
            // Per-letter thresholds by index
            pressureThreshold = pt.value[letterIds.length];
          } else {
            pressureThreshold = pt.value;
            if (pt.wordCollapse) {
              wordCollapseTag = wordTag;
            }
          }
        }

        // Determine weight for this letter
        let weight = 1;
        if (config.weight) {
          if (Array.isArray(config.weight.value)) {
            weight = config.weight.value[letterIds.length] ?? 1;
          } else {
            weight = config.weight.value;
          }
        }

        // Determine shadow config
        const shadow = config.shadow ? { opacity: config.shadow.opacity ?? 0.3 } : undefined;

        // Determine click to fall config
        const clicksRemaining = config.clickToFall?.clicks;

        // Determine fill color for this character (per-char color overrides default)
        const charFillColor = fillColors?.[globalCharIndex] ?? fillColor;

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
            fillColor: charFillColor,
            offsetX,
            offsetY
          },
          pressureThreshold,
          wordCollapseTag,
          weight,
          shadow,
          originalPosition: shadow || clicksRemaining !== undefined ? { x: body.position.x, y: body.position.y } : undefined,
          clicksRemaining
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

    const bounds: TextBounds = {
      left: boundsLeft,
      right: boundsRight,
      top: boundsTop,
      bottom: boundsBottom,
      width: boundsRight - boundsLeft,
      height: boundsBottom - boundsTop
    };

    // TTF fonts use font metrics, not PNG dimensions, so debug info is empty
    return {
      letterIds,
      stringTag,
      wordTags,
      letterMap,
      letterDebugInfo: [],
      bounds
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

    // Check for objects fallen below floor (despawn them)
    this.checkDespawnBelowFloor();

    // Update pressure tracking
    this.updatePressure();

    // Update 'mouse' follow target from browser mouse (if not externally overridden this frame)
    if (!this.followTargets.has('mouse') && this.mouse) {
      this.followTargets.set('mouse', { x: this.mouse.position.x, y: this.mouse.position.y });
    }

    // Apply tag-based behaviors to all objects
    for (const entry of this.objects.values()) {
      const isDragging = this.mouseConstraint?.body === entry.body;

      // Apply follow target forces (including 'follow' tag which uses 'mouse' target)
      if (!isDragging) {
        for (const tag of entry.tags) {
          // 'follow' tag is an alias for 'follow-mouse'
          const key = tag === 'follow' ? 'mouse' : (tag.startsWith('follow-') ? tag.slice(7) : null);
          if (key) {
            const target = this.followTargets.get(key);
            if (target) {
              const grounded = this.isGrounded(entry.body);
              if (grounded) {
                const direction = Math.sign(target.x - entry.body.position.x);
                Matter.Body.applyForce(entry.body, entry.body.position, { x: 0.001 * direction, y: 0 });
              }
            }
          }
        }
      }

      // Apply horizontal wrapping to dynamic objects (objects with 'falling' tag)
      if (this.config.wrapHorizontal && entry.tags.includes('falling')) {
        wrapHorizontal(entry.body, this.config.bounds);
      }

      // Update DOM element transforms to follow physics body
      if (entry.domElement && entry.tags.includes('falling')) {
        this.updateDOMElementTransform(entry);
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

  /**
   * Update a DOM element's CSS transform to match its physics body position and rotation.
   */
  private updateDOMElementTransform(entry: ObjectEntry): void {
    if (!entry.domElement) return;

    const body = entry.body;
    const x = body.position.x;
    const y = body.position.y;
    const angle = body.angle;

    // Convert radians to degrees for CSS
    const angleDeg = angle * (180 / Math.PI);

    // Get element dimensions for centering
    const width = entry.domElement.offsetWidth;
    const height = entry.domElement.offsetHeight;

    // Use setProperty with 'important' to override any CSS rules
    entry.domElement.style.setProperty('left', `${x - width / 2}px`, 'important');
    entry.domElement.style.setProperty('top', `${y - height / 2}px`, 'important');
    entry.domElement.style.setProperty('transform', `rotate(${angleDeg}deg)`, 'important');
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

  /** Despawn objects that have fallen below the floor by the configured distance */
  private checkDespawnBelowFloor(): void {
    // Default to 100% of container height below floor
    const despawnDistance = this.config.despawnBelowFloor ?? 1.0;
    const containerHeight = this.config.bounds.bottom - this.config.bounds.top;
    const despawnY = this.config.bounds.bottom + (containerHeight * despawnDistance);

    const toDespawn: string[] = [];
    for (const [id, entry] of this.objects) {
      if (entry.body.position.y > despawnY) {
        toDespawn.push(id);
      }
    }

    for (const id of toDespawn) {
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
