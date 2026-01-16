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
 * - 'falling': Object is dynamic and affected by gravity (without this tag, object is static)
 * - 'follow': Object follows mouse position when grounded
 * - 'grabable': Object can be dragged via mouse constraint
 */
export interface ObjectConfig {
  x: number;
  y: number;
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
}

/**
 * Dynamic object data passed to update callbacks.
 * Only objects with the 'falling' tag (dynamic objects) are included.
 */
export interface DynamicObject {
  id: string;
  x: number;
  y: number;
  angle: number;
  tags: string[];
}

export interface UpdateCallbackData {
  /** All dynamic objects (objects with 'falling' tag) */
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

// ==================== TEXT OBSTACLE TYPES ====================

/**
 * Configuration for creating text objects from strings
 */
export interface TextObstacleConfig {
  /** The text to create objects from (A-Z, 0-9 supported, supports \n for multiline) */
  text: string;
  /** X position of the first letter's center */
  x: number;
  /** Y position of the letter centers */
  y: number;
  /** Size of each letter (width/height) */
  letterSize: number;
  /** Spacing between letter centers (default: letterSize) */
  letterSpacing?: number;
  /** Font name - corresponds to directory under /fonts/ (default: 'handwritten') */
  fontName?: string;
  /** Base URL path for fonts directory (default: '/fonts/') */
  fontsBasePath?: string;
  /** Tags to apply to all letters (use 'falling' for dynamic objects) */
  tags?: string[];
  /** Tag for the entire string (for releasing whole string). Auto-generated if not provided */
  stringTag?: string;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Color to tint the letters (CSS color string). If not set, original image colors are used */
  letterColor?: string;
  /** Line height for multiline text (default: letterSize * 1.2) */
  lineHeight?: number;
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
}

/**
 * Configuration for creating text objects from a TTF font
 */
export interface TTFTextObstacleConfig {
  /** Text to display (supports \n for multiline) */
  text: string;
  /** X position of the start of text */
  x: number;
  /** Y position of the text baseline */
  y: number;
  /** Font size in pixels */
  fontSize: number;
  /** URL path to the TTF/OTF font file */
  fontUrl: string;
  /** Tags to apply to all letters (use 'falling' for dynamic objects) */
  tags?: string[];
  /** Tag for the entire string (for releasing whole string). Auto-generated if not provided */
  stringTag?: string;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Fill color for the letters (CSS color string, default: '#ffffff') */
  fillColor?: string;
  /** Line height for multiline text (default: fontSize * 1.2) */
  lineHeight?: number;
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
