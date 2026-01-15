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

export interface EntityConfig {
  x: number;
  y: number;
  radius: number;
  fillStyle?: string;
  imageUrl?: string;
  tags?: string[];
  /** Shape configuration. Defaults to circle if not specified */
  shape?: ShapeConfig;
  /** Entity behavior type. Defaults to GROUNDED_FOLLOW */
  entityType?: EntityType;
  /** Time-to-live in milliseconds. If not set, entity lives forever */
  ttl?: number;
  /** Configuration for despawn effect (future use) */
  despawnEffect?: DespawnEffectConfig;
}

export interface ObstacleConfig {
  x: number;
  y: number;
  /** Width for rectangle obstacles (ignored if imageUrl is provided) */
  width?: number;
  /** Height for rectangle obstacles (ignored if imageUrl is provided) */
  height?: number;
  /** Image URL for image-based obstacle shapes */
  imageUrl?: string;
  /** Size of the obstacle when using imageUrl (diameter) */
  size?: number;
  /** Fill style color */
  fillStyle?: string;
  tags?: string[];
  /** Time-to-live in milliseconds. If not set, obstacle lives forever */
  ttl?: number;
  /** Configuration for despawn effect (future use) */
  despawnEffect?: DespawnEffectConfig;
}

export interface DynamicObstacle {
  id: string;
  x: number;
  y: number;
  angle: number;
  tags: string[];
}

export interface DynamicEntity {
  id: string;
  x: number;
  y: number;
  angle: number;
  tags: string[];
  entityType: EntityType;
}

export interface UpdateCallbackData {
  dynamicObstacles: DynamicObstacle[];
  entities: DynamicEntity[];
}

export type UpdateCallback = (data: UpdateCallbackData) => void;

export type EntityState = 'idle' | 'moving' | 'falling' | 'grounded';

/**
 * Entity behavior types
 * - GROUNDED_FOLLOW: Entity follows mouse position when grounded (default)
 * - GROUNDED_STATIC: Entity does not follow mouse but can still be bumped/dragged
 */
export type EntityType = 'GROUNDED_FOLLOW' | 'GROUNDED_STATIC';

/** Debug outline colors per entity type */
export const ENTITY_TYPE_DEBUG_COLORS: Record<EntityType, string> = {
  GROUNDED_FOLLOW: '#ff0000', // red
  GROUNDED_STATIC: '#00ffff'  // cyan
};

export interface ContainerOptions {
  width?: number;
  height?: number;
  fullscreen?: boolean;
}

// ==================== EFFECT TYPES ====================

/**
 * Configuration for an entity type that can be spawned by an effect.
 * Effects can spawn multiple entity types with different probabilities.
 */
export interface EffectEntityConfig {
  /** Partial entity config - x, y will be set by the effect */
  entityConfig: Omit<EntityConfig, 'x' | 'y' | 'radius'> & { radius?: number };
  /** Probability weight for this entity type (relative to other entities in the effect) */
  probability: number;
  /** Minimum scale multiplier for radius */
  minScale: number;
  /** Maximum scale multiplier for radius */
  maxScale: number;
  /** Base radius for the entity (default: 20) */
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
  /** Entity configurations with their spawn probabilities */
  entityConfigs: EffectEntityConfig[];
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
 * Configuration for creating text obstacles from strings
 */
export interface TextObstacleConfig {
  /** The text to create obstacles from (A-Z, 0-9 supported) */
  text: string;
  /** X position of the first letter's center */
  x: number;
  /** Y position of the letter centers */
  y: number;
  /** Size of each letter (width/height) */
  letterSize: number;
  /** Spacing between letter centers (default: letterSize * 0.8) */
  letterSpacing?: number;
  /** Font name - corresponds to directory under /fonts/ (default: 'handwritten') */
  fontName?: string;
  /** Base URL path for fonts directory (default: '/fonts/') */
  fontsBasePath?: string;
  /** Tags to apply to all letters */
  tags?: string[];
  /** Additional tag for the word group (for releasing whole word) */
  wordTag?: string;
  /** Whether obstacles are static (default: true) */
  isStatic?: boolean;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Color to tint the letters (CSS color string). If not set, original image colors are used */
  letterColor?: string;
}

/**
 * Result of creating text obstacles
 */
export interface TextObstacleResult {
  /** IDs of all created letter obstacles */
  letterIds: string[];
  /** The word tag used to group these letters */
  wordTag: string;
  /** Map of character to obstacle ID for individual control */
  letterMap: Map<string, string>;
}
