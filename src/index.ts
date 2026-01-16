export { OverlayScene } from './OverlayScene';
export { logger, setLogLevel, getLogLevel } from './logger';
export { loadFont, getGlyphData, getKerning, measureText, clearFontCache } from './fontLoader';
export type {
  OverlaySceneConfig,
  Bounds,
  // Core object types (unified model)
  ObjectConfig,
  DynamicObject,
  UpdateCallbackData,
  UpdateCallback,
  ContainerOptions,
  ShapeConfig,
  ShapePreset,
  DespawnEffectConfig,
  // Effect types
  EffectConfig,
  EffectType,
  EffectObjectConfig,
  BaseEffectConfig,
  BurstEffectConfig,
  RainEffectConfig,
  StreamEffectConfig,
  // Text object types
  TextObstacleConfig,
  TextObstacleResult,
  TTFTextObstacleConfig,
  // Font types
  FontInfo,
  FontManifest,
  // Legacy type aliases (deprecated, for backwards compatibility)
  EntityConfig,
  ObstacleConfig,
  DynamicEntity,
  DynamicObstacle,
  EffectEntityConfig
} from './types';
export type { LoadedFont, GlyphData } from './fontLoader';
