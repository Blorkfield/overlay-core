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
}

export interface UpdateCallbackData {
  dynamicObstacles: DynamicObstacle[];
  entities: DynamicEntity[];
}

export type UpdateCallback = (data: UpdateCallbackData) => void;

export type EntityState = 'idle' | 'moving' | 'falling' | 'grounded';

export interface ContainerOptions {
  width?: number;
  height?: number;
  fullscreen?: boolean;
}
