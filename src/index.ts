export { OverlayScene } from './OverlayScene';
export { logger, setLogLevel, getLogLevel } from './logger';
export type { LogLevel } from './logger';
export { loadFont, getGlyphData, getKerning, measureText, clearFontCache } from './fontLoader';
export { BackgroundManager } from './backgroundManager';
export { TAG_STATIC, TAG_FOLLOW_WINDOW, TAG_GRABABLE, TAG_GRAVITY_OVERRIDE, TAG_SPEED_OVERRIDE, TAG_MASS_OVERRIDE, TAGS } from './tags';
export type { Tag } from './tags';
export type {
  OverlaySceneConfig,
  Bounds,
  Vector2,
  // Core object types (unified model)
  ObjectConfig,
  DynamicObject,
  ObjectState,
  LifecycleEvent,
  LifecycleCallback,
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
  TextAlign,
  TextBounds,
  TextObstacleConfig,
  TextObstacleResult,
  TTFTextObstacleConfig,
  // Pressure, weight, floor, shadow, and click types
  PressureThresholdConfig,
  WeightConfig,
  FloorConfig,
  ShadowConfig,
  ClickToFallConfig,
  // Background types
  BackgroundConfig,
  BackgroundImageConfig,
  BackgroundImageSizing,
  BackgroundTransparencyConfig,
  // Font types
  FontInfo,
  FontManifest
} from './types';
export type { LoadedFont, GlyphData } from './fontLoader';
