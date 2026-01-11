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

export interface EntityConfig {
  x: number;
  y: number;
  radius: number;
  fillStyle?: string;
  tags?: string[];
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
