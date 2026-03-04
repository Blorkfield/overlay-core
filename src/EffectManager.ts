import Matter from 'matter-js';
import type {
  EffectConfig,
  BurstEffectConfig,
  RainEffectConfig,
  StreamEffectConfig,
  EffectObjectConfig,
  ObjectConfig,
  Bounds
} from './types';
import { logger } from './logger';

type SpawnObjectAsyncFn = (config: ObjectConfig) => Promise<string>;
type GetBodyFn = (id: string) => Matter.Body | null;

interface EffectState {
  config: EffectConfig;
  lastSpawnTime: number;
  /** For rain: accumulated fractional spawns */
  spawnAccumulator: number;
}

/**
 * Manages spawning effects (burst, rain, stream) that create objects over time.
 * Effects are persistent and run until disabled.
 */
export class EffectManager {
  private effects: Map<string, EffectState> = new Map();
  private bounds: Bounds;
  private spawnObjectAsync: SpawnObjectAsyncFn;
  private getBody: GetBodyFn;

  constructor(bounds: Bounds, spawnObjectAsync: SpawnObjectAsyncFn, getBody: GetBodyFn) {
    this.bounds = bounds;
    this.spawnObjectAsync = spawnObjectAsync;
    this.getBody = getBody;
  }

  /**
   * Update bounds when scene resizes
   */
  setBounds(bounds: Bounds): void {
    this.bounds = bounds;
  }

  /**
   * Add or update an effect configuration
   */
  setEffect(config: EffectConfig): void {
    const existing = this.effects.get(config.id);
    if (existing) {
      // Reset timing if effect is being enabled (was disabled, now enabled)
      const wasDisabled = !existing.config.enabled;
      const nowEnabled = config.enabled;
      if (wasDisabled && nowEnabled) {
        existing.lastSpawnTime = Date.now();
        existing.spawnAccumulator = 0;
      }
      existing.config = config;
      logger.debug('EffectManager', `Updated effect: ${config.id}`, { type: config.type, enabled: config.enabled });
    } else {
      this.effects.set(config.id, {
        config,
        lastSpawnTime: Date.now(),
        spawnAccumulator: 0
      });
      logger.debug('EffectManager', `Added effect: ${config.id}`, { type: config.type, enabled: config.enabled });
    }
  }

  /**
   * Remove an effect
   */
  removeEffect(id: string): void {
    this.effects.delete(id);
    logger.debug('EffectManager', `Removed effect: ${id}`);
  }

  /**
   * Enable or disable an effect
   */
  setEffectEnabled(id: string, enabled: boolean): void {
    const state = this.effects.get(id);
    if (state) {
      state.config.enabled = enabled;
      // Reset timing when enabling to prevent immediate burst
      if (enabled) {
        state.lastSpawnTime = Date.now();
        state.spawnAccumulator = 0;
      }
      logger.debug('EffectManager', `Effect ${id} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Get current effect configuration
   */
  getEffect(id: string): EffectConfig | undefined {
    return this.effects.get(id)?.config;
  }

  /**
   * Get all effect IDs
   */
  getEffectIds(): string[] {
    return Array.from(this.effects.keys());
  }

  /**
   * Check if an effect is enabled
   */
  isEffectEnabled(id: string): boolean {
    return this.effects.get(id)?.config.enabled ?? false;
  }

  /**
   * Called each frame to update effects and spawn objects
   */
  update(): void {
    const now = Date.now();

    for (const state of this.effects.values()) {
      if (!state.config.enabled) continue;

      switch (state.config.type) {
        case 'burst':
          this.updateBurstEffect(state, now);
          break;
        case 'rain':
          this.updateRainEffect(state, now);
          break;
        case 'stream':
          this.updateStreamEffect(state, now);
          break;
      }
    }
  }

  private updateBurstEffect(state: EffectState, now: number): void {
    const config = state.config as BurstEffectConfig;
    const elapsed = now - state.lastSpawnTime;

    if (elapsed >= config.burstInterval) {
      state.lastSpawnTime = now;
      // Fire-and-forget async burst spawn
      this.spawnBurst(config);
    }
  }

  private updateRainEffect(state: EffectState, now: number): void {
    const config = state.config as RainEffectConfig;
    // Cap elapsed time to 100ms to prevent burst spawning after pauses/re-enables
    const elapsed = Math.min(now - state.lastSpawnTime, 100);
    state.lastSpawnTime = now;

    // Calculate how many objects to spawn this frame
    const deltaSeconds = elapsed / 1000;
    state.spawnAccumulator += config.spawnRate * deltaSeconds;

    // Spawn whole objects
    while (state.spawnAccumulator >= 1) {
      state.spawnAccumulator -= 1;
      this.spawnRainObject(config);
    }
  }

  private async spawnBurst(config: BurstEffectConfig): Promise<void> {
    const { bounds } = this;

    // Determine burst origin
    const originX = config.origin?.x ?? this.randomInRange(bounds.left + 50, bounds.right - 50);
    const originY = config.origin?.y ?? this.randomInRange(bounds.top + 50, bounds.bottom - 100);

    logger.debug('EffectManager', `Spawning burst at (${originX.toFixed(0)}, ${originY.toFixed(0)})`, { count: config.burstCount });

    // Prepare all spawn configs with their random angles
    const spawnData: Array<{ config: ObjectConfig; angle: number }> = [];
    for (let i = 0; i < config.burstCount; i++) {
      const objectConfig = this.selectObjectConfig(config.objectConfigs);
      if (!objectConfig) continue;

      const radius = this.calculateRadius(objectConfig);
      const tags = (objectConfig.objectConfig.tags ?? []).filter(t => t !== 'static');

      const fullConfig: ObjectConfig = {
        ...objectConfig.objectConfig,
        x: originX,
        y: originY,
        radius,
        tags
      };

      spawnData.push({
        config: fullConfig,
        angle: Math.random() * Math.PI * 2
      });
    }

    // Spawn all objects in parallel (uses cached image clipping for same images)
    const ids = await Promise.all(
      spawnData.map(data => this.spawnObjectAsync(data.config))
    );

    // Apply forces to all spawned objects
    for (let i = 0; i < ids.length; i++) {
      const body = this.getBody(ids[i]);
      if (body) {
        const angle = spawnData[i].angle;
        const force = config.burstForce;
        Matter.Body.setVelocity(body, {
          x: Math.cos(angle) * force,
          y: Math.sin(angle) * force
        });
      }
    }
  }

  private spawnRainObject(config: RainEffectConfig): void {
    const { bounds } = this;
    const spawnWidth = config.spawnWidth ?? 1;

    // Calculate spawn area
    const totalWidth = bounds.right - bounds.left;
    const spawnAreaWidth = totalWidth * spawnWidth;
    const spawnAreaStart = bounds.left + (totalWidth - spawnAreaWidth) / 2;

    const objectConfig = this.selectObjectConfig(config.objectConfigs);
    if (!objectConfig) return;

    const radius = this.calculateRadius(objectConfig);
    const x = this.randomInRange(spawnAreaStart + radius, spawnAreaStart + spawnAreaWidth - radius);
    const y = bounds.top - radius; // Spawn just above visible area

    const tags = (objectConfig.objectConfig.tags ?? []).filter(t => t !== 'static');

    const fullConfig: ObjectConfig = {
      ...objectConfig.objectConfig,
      x,
      y,
      radius,
      tags
    };

    // Fire-and-forget async spawn (no force needed for rain)
    this.spawnObjectAsync(fullConfig);
  }

  private updateStreamEffect(state: EffectState, now: number): void {
    const config = state.config as StreamEffectConfig;
    // Cap elapsed time to 100ms to prevent burst spawning after pauses/re-enables
    const elapsed = Math.min(now - state.lastSpawnTime, 100);
    state.lastSpawnTime = now;

    // Calculate how many objects to spawn this frame
    const deltaSeconds = elapsed / 1000;
    state.spawnAccumulator += config.spawnRate * deltaSeconds;

    // Spawn whole objects
    while (state.spawnAccumulator >= 1) {
      state.spawnAccumulator -= 1;
      this.spawnStreamObject(config);
    }
  }

  private async spawnStreamObject(config: StreamEffectConfig): Promise<void> {
    const objectConfig = this.selectObjectConfig(config.objectConfigs);
    if (!objectConfig) return;

    const radius = this.calculateRadius(objectConfig);

    const tags = (objectConfig.objectConfig.tags ?? []).filter(t => t !== 'static');

    // Spawn at origin
    const fullConfig: ObjectConfig = {
      ...objectConfig.objectConfig,
      x: config.origin.x,
      y: config.origin.y,
      radius,
      tags
    };

    // Normalize the direction vector
    const dirLength = Math.sqrt(config.direction.x ** 2 + config.direction.y ** 2);
    const normalizedDir = dirLength > 0
      ? { x: config.direction.x / dirLength, y: config.direction.y / dirLength }
      : { x: 0, y: 1 }; // Default to downward if zero vector

    // Calculate base angle from normalized direction
    const baseAngle = Math.atan2(normalizedDir.y, normalizedDir.x);

    // Add random spread within cone angle (-coneAngle to +coneAngle)
    const spreadAngle = (Math.random() * 2 - 1) * config.coneAngle;
    const finalAngle = baseAngle + spreadAngle;

    // Spawn object and apply velocity
    const id = await this.spawnObjectAsync(fullConfig);
    const body = this.getBody(id);
    if (body) {
      Matter.Body.setVelocity(body, {
        x: Math.cos(finalAngle) * config.force,
        y: Math.sin(finalAngle) * config.force
      });
    }
  }

  /**
   * Select an object config based on probability weights
   */
  private selectObjectConfig(configs: EffectObjectConfig[]): EffectObjectConfig | null {
    if (configs.length === 0) return null;

    const totalWeight = configs.reduce((sum, c) => sum + c.probability, 0);
    if (totalWeight === 0) return configs[0];

    let random = Math.random() * totalWeight;
    for (const config of configs) {
      random -= config.probability;
      if (random <= 0) return config;
    }
    return configs[configs.length - 1];
  }

  /**
   * Calculate radius based on scale range
   */
  private calculateRadius(config: EffectObjectConfig): number {
    const baseRadius = config.baseRadius ?? 20;
    const scale = this.randomInRange(config.minScale, config.maxScale);
    return baseRadius * scale;
  }

  private randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
