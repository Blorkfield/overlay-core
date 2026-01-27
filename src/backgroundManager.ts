import { logger } from './logger';
import { loadImage } from './imageClip';
import type {
  BackgroundConfig,
  BackgroundImageConfig,
  BackgroundImageSizing,
  BackgroundTransparencyConfig,
} from './types';

const LOG_PREFIX = 'BackgroundManager';

// Cache for loaded background images (keyed by URL)
const imageCache: Map<string, HTMLImageElement> = new Map();

export interface BackgroundManagerConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Manages three-layer background rendering:
 * 1. Color layer (bottom) - solid background color
 * 2. Image layer (middle) - background image with sizing options
 * 3. Transparency layer (top) - frosted glass effect with optional tint
 *
 * The color and image layers render BEFORE physics objects (in beforeRender).
 * The transparency layer renders AFTER physics objects (in afterRender).
 *
 * Performance optimization: Base layers (color + image) are pre-rendered to an
 * offscreen canvas and only re-rendered when the config changes. Each frame
 * just blits the cached canvas (very fast).
 */
export class BackgroundManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private config: BackgroundConfig | null = null;
  private loadedImage: HTMLImageElement | null = null;

  // Offscreen canvas for caching pre-rendered base layers
  private baseLayerCanvas: HTMLCanvasElement | null = null;
  private baseLayerCtx: CanvasRenderingContext2D | null = null;
  private baseLayerDirty = true;

  constructor(managerConfig: BackgroundManagerConfig) {
    this.canvas = managerConfig.canvas;
    const ctx = managerConfig.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }
    this.ctx = ctx;
    this.width = managerConfig.width;
    this.height = managerConfig.height;

    // Create offscreen canvas for base layer caching
    this.createOffscreenCanvas();
  }

  /**
   * Create or recreate the offscreen canvas for base layer caching.
   */
  private createOffscreenCanvas(): void {
    this.baseLayerCanvas = document.createElement('canvas');
    this.baseLayerCanvas.width = this.width;
    this.baseLayerCanvas.height = this.height;
    this.baseLayerCtx = this.baseLayerCanvas.getContext('2d');
    this.baseLayerDirty = true;
  }

  /**
   * Set the background configuration.
   */
  async setConfig(config: BackgroundConfig | undefined): Promise<void> {
    if (!config) {
      this.config = null;
      this.loadedImage = null;
      this.baseLayerDirty = true;
      return;
    }

    this.config = config;

    // Load image if specified
    if (config.image?.url) {
      await this.loadBackgroundImage(config.image.url);
    } else {
      this.loadedImage = null;
    }

    this.baseLayerDirty = true;
  }

  /**
   * Load and cache a background image.
   */
  private async loadBackgroundImage(url: string): Promise<void> {
    // Check cache
    const cached = imageCache.get(url);
    if (cached) {
      logger.debug(LOG_PREFIX, `Using cached image: ${url}`);
      this.loadedImage = cached;
      return;
    }

    try {
      logger.debug(LOG_PREFIX, `Loading background image: ${url}`);
      const img = await loadImage(url);
      imageCache.set(url, img);
      this.loadedImage = img;
      this.baseLayerDirty = true;
      logger.debug(LOG_PREFIX, `Background image loaded`, {
        width: img.width,
        height: img.height,
      });
    } catch (err) {
      logger.error(LOG_PREFIX, `Failed to load background image: ${url}`, {
        error: String(err),
      });
      this.loadedImage = null;
    }
  }

  /**
   * Update the canvas dimensions (call on resize).
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    // Recreate offscreen canvas at new size
    this.createOffscreenCanvas();
  }

  /**
   * Get the current background config.
   */
  getConfig(): BackgroundConfig | null {
    return this.config;
  }

  /**
   * Check if we have custom layers to render.
   * Returns true if we need to handle background ourselves.
   */
  hasCustomLayers(): boolean {
    if (!this.config) return false;
    // If fully transparent (opacity = 1), we handle it (by drawing nothing)
    if (this.config.transparency?.opacity === 1) return true;
    return !!(this.config.image || this.config.transparency);
  }

  /**
   * Check if background is fully transparent (no color, no image, opacity = 0 or no transparency config).
   */
  isFullyTransparent(): boolean {
    if (!this.config) return true;
    // Fully transparent if no color, no image, and either no transparency or opacity 0
    const noColor = !this.config.color;
    const noImage = !this.config.image;
    const noOverlay = !this.config.transparency || this.config.transparency.opacity <= 0;
    return noColor && noImage && noOverlay;
  }

  /**
   * Pre-render the base layers (color + image) to the offscreen canvas.
   * Only called when the config changes (baseLayerDirty is true).
   */
  private prerenderBaseLayers(): void {
    if (!this.baseLayerCtx || !this.baseLayerCanvas) return;

    const ctx = this.baseLayerCtx;

    // Clear the offscreen canvas
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.config) {
      this.baseLayerDirty = false;
      return;
    }

    // Layer 1: Color (bottom)
    if (this.config.color && this.config.color !== 'transparent') {
      ctx.fillStyle = this.config.color;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Layer 2: Image (above color, below physics)
    if (this.loadedImage && this.config.image) {
      this.renderImageLayerToContext(ctx, this.loadedImage, this.config.image);
    }

    this.baseLayerDirty = false;
    logger.debug(LOG_PREFIX, 'Base layers pre-rendered to offscreen canvas');
  }

  /**
   * Render the base layers (color + image).
   * Called BEFORE Matter.js renders physics objects.
   * Uses cached offscreen canvas for performance.
   */
  renderBaseLayers(): void {
    // If fully transparent, don't draw anything
    if (this.isFullyTransparent()) return;

    // Re-render to offscreen canvas if dirty
    if (this.baseLayerDirty) {
      this.prerenderBaseLayers();
    }

    // Blit the cached base layers to the main canvas
    if (this.baseLayerCanvas && this.config) {
      this.ctx.drawImage(this.baseLayerCanvas, 0, 0);
    }
  }

  /**
   * Render the transparency/frosted glass layer.
   * Called AFTER Matter.js renders physics objects.
   * This must render every frame since it overlays moving objects.
   */
  renderOverlay(): void {
    if (!this.config?.transparency) return;
    this.renderTransparencyLayer(this.config.transparency);
  }

  /**
   * Render the background image to a given context with specified sizing.
   */
  private renderImageLayerToContext(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    config: BackgroundImageConfig
  ): void {
    const sizing = config.sizing ?? 'cover';

    ctx.save();

    switch (sizing) {
      case 'stretch':
        ctx.drawImage(img, 0, 0, this.width, this.height);
        break;

      case 'center':
        this.drawCenter(ctx, img);
        break;

      case 'tile':
        this.drawTile(ctx, img);
        break;

      case 'cover':
        this.drawCover(ctx, img);
        break;

      case 'contain':
        this.drawContain(ctx, img);
        break;
    }

    ctx.restore();
  }

  /**
   * Draw image centered at original size.
   */
  private drawCenter(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
    const x = (this.width - img.width) / 2;
    const y = (this.height - img.height) / 2;
    ctx.drawImage(img, x, y);
  }

  /**
   * Draw image tiled (repeating pattern).
   */
  private drawTile(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
    const pattern = ctx.createPattern(img, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /**
   * Draw image to cover entire area (may crop, maintains aspect ratio).
   */
  private drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
    const imgRatio = img.width / img.height;
    const canvasRatio = this.width / this.height;

    let drawWidth: number, drawHeight: number;
    let offsetX = 0,
      offsetY = 0;

    if (imgRatio > canvasRatio) {
      // Image is wider relative to canvas - fit by height, crop width
      drawHeight = this.height;
      drawWidth = this.height * imgRatio;
      offsetX = (this.width - drawWidth) / 2;
    } else {
      // Image is taller relative to canvas - fit by width, crop height
      drawWidth = this.width;
      drawHeight = this.width / imgRatio;
      offsetY = (this.height - drawHeight) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  /**
   * Draw image to fit within area (may have gaps, maintains aspect ratio).
   * Gaps are filled by the color layer underneath.
   */
  private drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
    const imgRatio = img.width / img.height;
    const canvasRatio = this.width / this.height;

    let drawWidth: number, drawHeight: number;
    let offsetX = 0,
      offsetY = 0;

    if (imgRatio > canvasRatio) {
      // Image is wider relative to canvas - fit by width, leave vertical gaps
      drawWidth = this.width;
      drawHeight = this.width / imgRatio;
      offsetY = (this.height - drawHeight) / 2;
    } else {
      // Image is taller relative to canvas - fit by height, leave horizontal gaps
      drawHeight = this.height;
      drawWidth = this.height * imgRatio;
      offsetX = (this.width - drawWidth) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  /**
   * Render the transparency/frosted glass layer.
   * opacity = 0 means fully transparent (nothing drawn)
   * opacity = 1 means fully opaque overlay
   * opacity = 0.3 means light frosted glass
   */
  private renderTransparencyLayer(config: BackgroundTransparencyConfig): void {
    // If fully transparent, don't draw anything
    if (config.opacity <= 0) return;

    this.ctx.save();
    this.ctx.globalAlpha = config.opacity;

    if (config.tintColor) {
      this.ctx.fillStyle = config.tintColor;
    } else {
      // Default frosted glass: white
      this.ctx.fillStyle = '#ffffff';
    }

    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  /**
   * Clear the background image cache.
   */
  static clearCache(): void {
    imageCache.clear();
    logger.debug(LOG_PREFIX, 'Image cache cleared');
  }
}
