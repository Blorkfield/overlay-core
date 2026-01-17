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
  // Pressure, weight, floor, shadow, and click types
  PressureThresholdConfig,
  WeightConfig,
  FloorConfig,
  ShadowConfig,
  ClickToFallConfig,
  // Font types
  FontInfo,
  FontManifest
} from './types';
export type { LoadedFont, GlyphData } from './fontLoader';
