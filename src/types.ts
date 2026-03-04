/**
 * 2D vector with x and y components.
 */
export interface Vector2 {
  x: number;
  y: number;
}

export interface OverlaySceneConfig {
  bounds: Bounds;
  /** Gravity vector. Default: { x: 0, y: 1 }. Negative y = upward gravity. */
  gravity?: Vector2;
  wrapHorizontal?: boolean;
  debug?: boolean;
  /** Background configuration with color, image, and transparency layers */
  background?: BackgroundConfig;
  /** Distance below floor (as fraction of container height) at which objects despawn. Default: 1.0 (100%) */
  despawnBelowFloor?: number;
  /** Configuration for floor segments and thresholds */
  floorConfig?: FloorConfig;
}

/**
 * Configuration for floor segments and pressure thresholds.
 * When provided, floor can be divided into segments with individual collapse behavior.
 */
export interface FloorConfig {
  /**
   * Number of segments to divide the floor into.
   * If not provided or 1, floor is a single strip.
   */
  segments?: number;

  /**
   * Pressure threshold(s) for floor segments:
   * - number: Same threshold for all segments
   * - number[]: Per-segment thresholds (segment 0 uses value[0], etc.)
   * If not provided, segments have infinite capacity.
   */
  threshold?: number | number[];

  /**
   * Thickness of floor segments in pixels (collision body height):
   * - number: Same thickness for all segments (default: 50)
   * - number[]: Per-segment thickness (segment 0 uses value[0], etc.)
   */
  thickness?: number | number[];

  /**
   * Visible thickness of floor segments in pixels.
   * When set, only this many pixels are visible above the canvas bottom,
   * while the remaining (thickness - visibleThickness) extends below as hidden collision.
   * - number: Same visible thickness for all segments (default: same as thickness)
   * - number[]: Per-segment visible thickness (segment 0 uses value[0], etc.)
   *
   * Example: thickness=15, visibleThickness=2 creates a 15px collision body
   * but only shows 2px, with 13px of hidden collision below the canvas.
   */
  visibleThickness?: number | number[];

  /**
   * Color of floor segments (visible when set):
   * - string: Same color for all segments
   * - string[]: Per-segment colors (segment 0 uses value[0], etc.)
   * If not provided, floor segments are invisible.
   */
  color?: string | string[];

  /**
   * Minimum number of segments that must remain for floor integrity.
   * When remaining segments drops below this value, ALL remaining segments collapse.
   * Example: segments=10, minIntegrity=7 means once 4+ segments collapse, the rest follow.
   * If set higher than segments count, floor collapses immediately.
   */
  minIntegrity?: number;

  /**
   * Proportional widths for each segment (must sum to 1.0):
   * - number[]: Per-segment width proportions (e.g., [0.2, 0.3, 0.5] for 3 segments)
   * If not provided, segments have equal widths.
   * Array length should match segments count.
   */
  segmentWidths?: number[];
}

// ==================== BACKGROUND TYPES ====================

/**
 * Image sizing mode for background images.
 */
export type BackgroundImageSizing =
  | 'stretch'  // Scale to fill entire area (may distort aspect ratio)
  | 'center'   // Display at original size, centered
  | 'tile'     // Repeat horizontally and vertically
  | 'cover'    // Scale to cover area, crop if needed (maintain aspect ratio)
  | 'contain'; // Scale to fit within area, gaps filled by color layer

/**
 * Configuration for the background image layer.
 */
export interface BackgroundImageConfig {
  /** Image URL or local file path (supports same formats as entity images) */
  url: string;
  /** How to size/position the image. Default: 'cover' */
  sizing?: BackgroundImageSizing;
}

/**
 * Configuration for the transparency/frosted glass overlay layer.
 * This layer renders on top of everything (including physics objects).
 */
export interface BackgroundTransparencyConfig {
  /**
   * Opacity of the overlay (0-1).
   * 0 = fully transparent (no overlay)
   * 0.3 = light frosted glass
   * 1 = fully opaque overlay
   */
  opacity: number;
  /**
   * Tint color for the overlay (CSS color string).
   * If not provided, defaults to white for frosted glass effect.
   */
  tintColor?: string;
}

/**
 * Full background configuration with three layers (bottom to top):
 * 1. Color layer (BOTTOM) - solid background color
 * 2. Image layer (MIDDLE) - background image
 * 3. Transparency layer (TOP) - frosted glass effect with optional tint
 *
 * Layers render in order: color → image → physics objects → transparency
 */
export interface BackgroundConfig {
  /** Base background color (bottom layer). Default: 'transparent' */
  color?: string;
  /** Background image configuration (middle layer, behind physics objects) */
  image?: BackgroundImageConfig;
  /** Transparency/frosted glass effect (top layer, above physics objects) */
  transparency?: BackgroundTransparencyConfig;
}

export interface Bounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type ShapePreset =
  | 'circle'
  | 'rectangle'
  | 'polygon'    // generic n-gon, requires `sides`
  | 'hexagon'
  | 'octagon'
  | 'triangle'
  | 'pentagon';

export interface ShapeConfig {
  /** Shape type - preset name or 'polygon' for n-gon. Image shape extraction is automatic when imageUrl provided */
  type: ShapePreset;
  /** For rectangle: aspect ratio (width/height). Default 1 */
  aspectRatio?: number;
  /** Number of sides for polygon shapes. Required for 'polygon', optional override for presets */
  sides?: number;
  /** Custom vertices (overrides type). Array of {x, y} relative to center */
  vertices?: Array<{ x: number; y: number }>;
}

/**
 * Configuration for despawn effects (placeholder for future custom effects)
 */
export interface DespawnEffectConfig {
  /** Effect type identifier for future use */
  type?: string;
}

/**
 * Unified configuration for spawning scene objects.
 * Objects are configured via tags that define their behavior:
 * - 'static': Object is not affected by gravity (without this tag, object is dynamic by default)
 * - 'follow_window': Object follows mouse position when grounded within the canvas window
 * - 'grabable': Object can be dragged via mouse constraint
 */
export interface ObjectConfig {
  x: number;
  y: number;
  /** DOM element to link to physics. When provided, element moves with physics body and shadow clones the element */
  element?: HTMLElement;
  /** Radius for circle/polygon shapes */
  radius?: number;
  /** Width for rectangle objects (ignored if imageUrl is provided) */
  width?: number;
  /** Height for rectangle objects (ignored if imageUrl is provided) */
  height?: number;
  /** Image URL for image-based shapes */
  imageUrl?: string;
  /** Size of the object when using imageUrl (diameter) */
  size?: number;
  /** Fill style color */
  fillStyle?: string;
  /** Tags that define object behavior */
  tags?: string[];
  /** Shape configuration. Defaults to circle if radius provided, rectangle otherwise */
  shape?: ShapeConfig;
  /** Time-to-live in milliseconds. If not set, object lives forever */
  ttl?: number;
  /** Configuration for despawn effect (future use) */
  despawnEffect?: DespawnEffectConfig;
  /** Weight for pressure calculation (default: 1). Higher weight = more pressure contribution */
  weight?: number;
  /** Pressure threshold config - when reached, object collapses */
  pressureThreshold?: PressureThresholdConfig;
  /** Shadow config - when enabled, a visual copy remains after collapse (true for default opacity) */
  shadow?: ShadowConfig | boolean;
  /** Click to fall config - when set, object collapses after being clicked N times */
  clickToFall?: ClickToFallConfig;
  /**
   * Per-object gravity override. When set, this object ignores scene gravity and uses
   * this vector instead. Automatically adds the 'gravity_override' tag.
   * Supports negative values (e.g. { x: 0, y: -1 } for upward gravity).
   */
  gravityOverride?: Vector2;
  /**
   * Target for the 'follow_window' tag. Can be:
   * - 'mouse' (default) — follows the mouse cursor
   * - An entity ID — follows that specific entity
   * - A tag string — follows the first entity found with that tag
   * Only used when 'follow_window' is in tags.
   */
  followTarget?: string;
  /**
   * Speed multiplier for follow_window and future movement behaviors. Automatically adds the
   * 'speed_override' tag. Default: 1. Negative values cause the object to run away from its target.
   */
  speedOverride?: number;
  /**
   * Physics mass override. Automatically adds the 'mass_override' tag.
   * Higher mass resists follow forces and other applied forces more. Removing the tag restores the
   * density-based mass. Accepts positive numbers (use integers for predictable behavior).
   */
  massOverride?: number;
}

/**
 * Dynamic object data passed to update callbacks.
 * Only dynamic objects (objects without the 'static' tag) are included.
 */
export interface DynamicObject {
  id: string;
  x: number;
  y: number;
  angle: number;
  tags: string[];
}

/**
 * Extended object state for querying and manipulation.
 * Includes velocity data not present in DynamicObject.
 */
export interface ObjectState {
  id: string;
  x: number;
  y: number;
  velocity: { x: number; y: number };
  angle: number;
  tags: string[];
}

/**
 * Lifecycle events that can be subscribed to.
 */
export type LifecycleEvent = 'objectSpawned' | 'objectRemoved' | 'objectCollision';

/**
 * Callback type for lifecycle events.
 * - objectSpawned/objectRemoved: receives the affected object
 * - objectCollision: receives both colliding objects
 */
export type LifecycleCallback<T extends LifecycleEvent> =
  T extends 'objectCollision'
    ? (a: ObjectState, b: ObjectState) => void
    : (object: ObjectState) => void;

export interface UpdateCallbackData {
  /** All dynamic objects (objects without 'static' tag) */
  objects: DynamicObject[];
}

export type UpdateCallback = (data: UpdateCallbackData) => void;

export interface ContainerOptions {
  width?: number;
  height?: number;
  fullscreen?: boolean;
}

// ==================== EFFECT TYPES ====================

/**
 * Configuration for an object type that can be spawned by an effect.
 * Effects can spawn multiple object types with different probabilities.
 */
export interface EffectObjectConfig {
  /** Partial object config - x, y will be set by the effect */
  objectConfig: Omit<ObjectConfig, 'x' | 'y' | 'radius'> & { radius?: number };
  /** Probability weight for this object type (relative to others in the effect) */
  probability: number;
  /** Minimum scale multiplier for radius */
  minScale: number;
  /** Maximum scale multiplier for radius */
  maxScale: number;
  /** Base radius for the object (default: 20) */
  baseRadius?: number;
}

/**
 * Base configuration shared by all effect types
 */
export interface BaseEffectConfig {
  /** Unique identifier for this effect */
  id: string;
  /** Whether the effect is currently active */
  enabled: boolean;
  /** Object configurations with their spawn probabilities */
  objectConfigs: EffectObjectConfig[];
}

/**
 * Burst effect - spawns entities from a point that explode outward
 */
export interface BurstEffectConfig extends BaseEffectConfig {
  type: 'burst';
  /** How often a burst occurs (in milliseconds) */
  burstInterval: number;
  /** Number of entities spawned per burst */
  burstCount: number;
  /** Velocity magnitude for burst entities */
  burstForce: number;
  /** Optional fixed origin point. If not specified, random position is used */
  origin?: { x: number; y: number };
}

/**
 * Rain effect - continuously spawns entities from the top that fall down
 */
export interface RainEffectConfig extends BaseEffectConfig {
  type: 'rain';
  /** How many entities to spawn per second */
  spawnRate: number;
  /** Portion of screen width to spawn across (0-1, default: 1) */
  spawnWidth?: number;
}

/**
 * Stream effect - emits entities from a point in a configurable direction with cone spread
 */
export interface StreamEffectConfig extends BaseEffectConfig {
  type: 'stream';
  /** Origin point where entities are emitted from (can be outside bounds) */
  origin: { x: number; y: number };
  /** Direction vector (will be normalized). e.g., { x: 0, y: 1 } for downward */
  direction: { x: number; y: number };
  /** How many entities to spawn per second */
  spawnRate: number;
  /** Initial velocity/force magnitude for spawned entities */
  force: number;
  /** Cone angle in radians - spread from center direction (0 = laser, Math.PI/4 = 45° cone) */
  coneAngle: number;
}

export type EffectConfig = BurstEffectConfig | RainEffectConfig | StreamEffectConfig;
export type EffectType = EffectConfig['type'];

// ==================== PRESSURE THRESHOLD TYPES ====================

/**
 * Configuration for pressure-based collapse of obstacles.
 * When pressure (number of objects resting on an obstacle) reaches the threshold,
 * the obstacle converts to dynamic (removes 'static' tag).
 */
export interface PressureThresholdConfig {
  /**
   * Threshold value(s):
   * - number: Single threshold applied per-letter (or word total if wordCollapse is true)
   * - number[]: Per-letter thresholds by index (letter 0 uses value[0], etc.)
   */
  value: number | number[];

  /**
   * When true and value is a single number:
   * - Tracks total pressure across all letters in the word
   * - When total reaches threshold, ALL letters in the word collapse together
   * When false or undefined (default):
   * - Each letter tracks its own pressure
   * - Only the letter that reaches threshold collapses
   */
  wordCollapse?: boolean;
}

/**
 * Configuration for weight of obstacles (used when they collapse and become dynamic objects).
 * Weight determines how much pressure an object contributes when resting on something.
 */
export interface WeightConfig {
  /**
   * Weight value(s):
   * - number: Single weight applied to all letters
   * - number[]: Per-letter weights by index (letter 0 uses value[0], etc.)
   */
  value: number | number[];
}

/**
 * Configuration for shadow left behind when an obstacle collapses.
 * When enabled, a static washed-out version of the obstacle remains at its original position.
 */
export interface ShadowConfig {
  /**
   * Opacity of the shadow (0-1). Default: 0.3
   */
  opacity?: number;
}

/**
 * Configuration for click to fall behavior.
 * When enabled, obstacles collapse after being clicked a specified number of times.
 */
export interface ClickToFallConfig {
  /**
   * Number of clicks required before the obstacle falls.
   * Each click decrements the counter; when it reaches zero, the obstacle collapses.
   */
  clicks: number;
}

// ==================== TEXT OBSTACLE TYPES ====================

/**
 * Text alignment option for positioning text obstacles.
 * - 'left': x coordinate is the left edge of the text (default)
 * - 'center': x coordinate is the center of the text
 * - 'right': x coordinate is the right edge of the text
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Configuration for creating text objects from strings
 */
export interface TextObstacleConfig {
  /** The text to create objects from (A-Z, 0-9 supported, supports \n for multiline) */
  text: string;
  /** X position (interpretation depends on align setting) */
  x: number;
  /** Y position of the letter centers */
  y: number;
  /** Text alignment - 'left' (default), 'center', or 'right' */
  align?: TextAlign;
  /** Size of each letter (width/height) */
  letterSize: number;
  /** Spacing between letter centers (default: letterSize) */
  letterSpacing?: number;
  /** Font name - corresponds to directory under /fonts/ (default: 'handwritten') */
  fontName?: string;
  /** Base URL path for fonts directory (default: '/fonts/') */
  fontsBasePath?: string;
  /** Whether letters are static obstacles (default: true). Set to false for falling letters. */
  isStatic?: boolean;
  /** Tags to apply to all letters */
  tags?: string[];
  /** Tag for the entire string (for releasing whole string). Auto-generated if not provided */
  stringTag?: string;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Color to tint the letters (CSS color string). If not set, original image colors are used */
  letterColor?: string;
  /** Line height for multiline text (default: letterSize * 1.2) */
  lineHeight?: number;
  /** Pressure threshold config - when reached, letters collapse */
  pressureThreshold?: PressureThresholdConfig;
  /** Weight config - when letters collapse, this is their pressure contribution */
  weight?: WeightConfig;
  /** Shadow config - when enabled, a washed-out version remains after collapse */
  shadow?: ShadowConfig;
  /** Click to fall config - when set, letters collapse after being clicked N times */
  clickToFall?: ClickToFallConfig;
}

/**
 * Debug information for a single letter's positioning
 */
export interface LetterDebugInfo {
  /** Letter character */
  char: string;
  /** Obstacle ID */
  id: string;
  /** Original PNG dimensions (before scaling) */
  originalWidth: number;
  originalHeight: number;
  /** Scaled dimensions at letterSize */
  scaledWidth: number;
  scaledHeight: number;
  /** Position of the letter's original dimension box (top-left corner) */
  boxX: number;
  boxY: number;
  /** Center position of the letter */
  centerX: number;
  centerY: number;
}

/**
 * Bounding box for text obstacles.
 * Useful for positioning subsequent elements relative to the text.
 */
export interface TextBounds {
  /** X position of the left edge of the text */
  left: number;
  /** X position of the right edge of the text */
  right: number;
  /** Y position of the top edge of the text */
  top: number;
  /** Y position of the bottom edge of the text */
  bottom: number;
  /** Total width of the text */
  width: number;
  /** Total height of the text (including all lines) */
  height: number;
}

/**
 * Result of creating text obstacles
 */
export interface TextObstacleResult {
  /** IDs of all created letter obstacles */
  letterIds: string[];
  /** Tag for the entire string (all letters) */
  stringTag: string;
  /** Tags for each individual word (space/newline separated) */
  wordTags: string[];
  /** Map of character to obstacle ID for individual control */
  letterMap: Map<string, string>;
  /** Debug info for each letter (for drawing original dimension boxes) */
  letterDebugInfo: LetterDebugInfo[];
  /** Bounding box of the entire text block */
  bounds: TextBounds;
}

/**
 * Configuration for creating text objects from a TTF font
 */
export interface TTFTextObstacleConfig {
  /** Text to display (supports \n for multiline) */
  text: string;
  /** X position (interpretation depends on align setting) */
  x: number;
  /** Y position of the text baseline */
  y: number;
  /** Text alignment - 'left' (default), 'center', or 'right' */
  align?: TextAlign;
  /** Font size in pixels */
  fontSize: number;
  /** URL path to the TTF/OTF font file */
  fontUrl: string;
  /** Whether letters are static obstacles (default: true). Set to false for falling letters. */
  isStatic?: boolean;
  /** Tags to apply to all letters */
  tags?: string[];
  /** Tag for the entire string (for releasing whole string). Auto-generated if not provided */
  stringTag?: string;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Fill color for the letters (CSS color string, default: '#ffffff') */
  fillColor?: string;
  /** Per-character fill colors (overrides fillColor for specific characters by index) */
  fillColors?: string[];
  /** Line height for multiline text (default: fontSize * 1.2) */
  lineHeight?: number;
  /** Pressure threshold config - when reached, letters collapse */
  pressureThreshold?: PressureThresholdConfig;
  /** Weight config - when letters collapse, this is their pressure contribution */
  weight?: WeightConfig;
  /** Shadow config - when enabled, a washed-out version remains after collapse */
  shadow?: ShadowConfig;
  /** Click to fall config - when set, letters collapse after being clicked N times */
  clickToFall?: ClickToFallConfig;
}

/**
 * Configuration for attaching a DOM element to physics.
 * The element will follow the physics body and can have pressure/shadow/click behavior.
 */
export interface DOMObstacleConfig {
  /** The DOM element to attach to physics */
  element: HTMLElement;
  /** X position of the element center */
  x: number;
  /** Y position of the element center */
  y: number;
  /** Width of the collision body (defaults to element.offsetWidth) */
  width?: number;
  /** Height of the collision body (defaults to element.offsetHeight) */
  height?: number;
  /** Tags that define object behavior */
  tags?: string[];
  /** Pressure threshold config - when reached, element collapses */
  pressureThreshold?: PressureThresholdConfig;
  /** Weight for pressure calculation (default: 1) */
  weight?: number;
  /** Shadow config - when enabled, a cloned element remains after collapse */
  shadow?: ShadowConfig;
  /** Click to fall config - when set, element collapses after being clicked N times */
  clickToFall?: ClickToFallConfig;
}

/**
 * Result of attaching a DOM element to physics
 */
export interface DOMObstacleResult {
  /** ID of the created physics object */
  id: string;
  /** The shadow element if shadow was configured (null until collapse) */
  shadowElement: HTMLElement | null;
}

/**
 * Information about an available font
 */
export interface FontInfo {
  /** Font name (directory name under /fonts/) */
  name: string;
  /** Available characters in this font (e.g., "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") */
  characters: string;
  /** Font type: 'png' for image-based, 'ttf' for TrueType fonts */
  type: 'png' | 'ttf';
  /** For TTF fonts: relative URL path to the font file */
  fontUrl?: string;
}

/**
 * Font manifest structure loaded from fonts.json
 */
export interface FontManifest {
  fonts: FontInfo[];
}
