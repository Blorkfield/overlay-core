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
}

export interface ObstacleConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DynamicObstacle {
  id: string;
  x: number;
  y: number;
  angle: number;
}

export interface UpdateCallbackData {
  dynamicObstacles: DynamicObstacle[];
}

export type UpdateCallback = (data: UpdateCallbackData) => void;

export type EntityState = 'idle' | 'moving' | 'falling' | 'grounded';
