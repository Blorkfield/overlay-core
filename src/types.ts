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
}

export interface ObstacleConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  tags?: string[];
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

export type EffectConfig = BurstEffectConfig | RainEffectConfig;
export type EffectType = EffectConfig['type'];
