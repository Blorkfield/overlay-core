export { OverlayScene } from './OverlayScene';
export { logger, setLogLevel, getLogLevel } from './logger';
export { loadFont, getGlyphData, getKerning, measureText, clearFontCache } from './fontLoader';
export { ENTITY_TYPE_DEBUG_COLORS } from './types';
export type {
  OverlaySceneConfig,
  Bounds,
  EntityConfig,
  ObstacleConfig,
  DynamicObstacle,
  DynamicEntity,
  UpdateCallbackData,
  UpdateCallback,
  EntityState,
  ContainerOptions,
  ShapeConfig,
  ShapePreset,
  EntityType,
  DespawnEffectConfig,
  // Effect types
  EffectConfig,
  EffectType,
  EffectEntityConfig,
  BaseEffectConfig,
  BurstEffectConfig,
  RainEffectConfig,
  StreamEffectConfig,
  // Text obstacle types
  TextObstacleConfig,
  TextObstacleResult,
  TTFTextObstacleConfig,
  // Font types
  FontInfo,
  FontManifest
} from './types';
export type { LoadedFont, GlyphData } from './fontLoader';
