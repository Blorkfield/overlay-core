import Matter from 'matter-js';
import type { Bounds, ObjectConfig, ShapeConfig } from './types';
import { getVerticesFromImage, getVerticesAndDimensionsFromImage, loadImage, Vector2D, ImageClipResult, ClipBounds } from './imageClip';
import { logger } from './logger';

// Re-export for convenience
export type { ImageClipResult, ClipBounds };

const BOUNDARY_THICKNESS = 50;
const LOG_PREFIX = 'Bodies';

// Preset shape side counts
const SHAPE_SIDES: Record<string, number> = {
  triangle: 3,
  rectangle: 4,
  pentagon: 5,
  hexagon: 6,
  octagon: 8
};

/**
 * Generate polygon vertices centered at origin
 * @param sides - number of sides
 * @param radius - distance from center to vertices
 * @param aspectRatio - for non-regular polygons (only applies to 4-sided rectangles)
 */
function generatePolygonVertices(sides: number, radius: number, aspectRatio?: number): Vector2D[] {
  // Rectangle with aspect ratio is a special 4-sided case
  if (sides === 4 && aspectRatio !== undefined && aspectRatio !== 1) {
    const width = radius * Math.sqrt(2 * aspectRatio / (1 + aspectRatio));
    const height = width / aspectRatio;
    return [
      { x: -width, y: -height },
      { x: width, y: -height },
      { x: width, y: height },
      { x: -width, y: height }
    ];
  }

  // Regular polygon
  const vertices: Vector2D[] = [];
  const angleStep = (2 * Math.PI) / sides;
  const startAngle = -Math.PI / 2; // Start from top for nicer orientation

  for (let i = 0; i < sides; i++) {
    const angle = startAngle + i * angleStep;
    vertices.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    });
  }
  return vertices;
}

/**
 * Get vertices for a shape config (non-async presets only)
 * Returns null only if shape is invalid - caller should fall back to circle
 */
function getShapeVertices(shape: ShapeConfig, radius: number): Vector2D[] | null {
  // Custom vertices take priority
  if (shape.vertices && shape.vertices.length >= 3) {
    logger.debug(LOG_PREFIX, `Using custom vertices`, { count: shape.vertices.length });
    return shape.vertices;
  }

  // Get side count - either explicit or from preset
  const sides = shape.sides ?? SHAPE_SIDES[shape.type];

  if (!sides || sides < 3) {
    logger.warn(LOG_PREFIX, `Invalid polygon: need sides >= 3`, { type: shape.type, sides });
    return null;
  }

  logger.debug(LOG_PREFIX, `Generating polygon`, { type: shape.type, sides, aspectRatio: shape.aspectRatio });
  return generatePolygonVertices(sides, radius, shape.aspectRatio);
}

/**
 * Create a Matter.js body from vertices
 */
function createBodyFromVertices(
  id: string,
  x: number,
  y: number,
  vertices: Vector2D[],
  renderOptions: Matter.IBodyRenderOptions
): Matter.Body {
  const matterVertices = vertices.map(v => ({ x: v.x, y: v.y }));

  const body = Matter.Bodies.fromVertices(x, y, [matterVertices], {
    restitution: 0.3,
    friction: 0.1,
    frictionAir: 0.01,
    label: `entity:${id}`,
    render: renderOptions
  });

  // fromVertices can return a compound body if the vertices are concave
  // Matter.js will decompose them. We need to ensure the body is positioned correctly
  Matter.Body.setPosition(body, { x, y });

  return body;
}

export function createBoundaries(bounds: Bounds): Matter.Body[] {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const options = { isStatic: true, render: { visible: false } };
  return [
    // Ground
    Matter.Bodies.rectangle(
      bounds.left + width / 2,
      bounds.bottom + BOUNDARY_THICKNESS / 2,
      width,
      BOUNDARY_THICKNESS,
      { ...options, label: 'ground' }
    ),
    // Left wall
    Matter.Bodies.rectangle(
      bounds.left - BOUNDARY_THICKNESS / 2,
      bounds.top + height / 2,
      BOUNDARY_THICKNESS,
      height,
      { ...options, label: 'leftWall' }
    ),
    // Right wall
    Matter.Bodies.rectangle(
      bounds.right + BOUNDARY_THICKNESS / 2,
      bounds.top + height / 2,
      BOUNDARY_THICKNESS,
      height,
      { ...options, label: 'rightWall' }
    )
  ];
}

/**
 * Create render options for entity (non-image)
 */
function createFillRenderOptions(config: ObjectConfig): Matter.IBodyRenderOptions {
  return {
    fillStyle: config.fillStyle ?? '#ff0000'
  };
}

/**
 * Create render options for entity with sprite, using actual image dimensions
 */
function createSpriteRenderOptions(config: ObjectConfig, imageWidth: number, imageHeight: number): Matter.IBodyRenderOptions {
  const targetSize = config.radius * 2;
  const maxDim = Math.max(imageWidth, imageHeight);
  const spriteScale = targetSize / maxDim;

  return {
    sprite: {
      texture: config.imageUrl!,
      xScale: spriteScale,
      yScale: spriteScale
    }
  };
}

/**
 * Create a circle body (default fallback) - no image
 */
function createCircleEntity(id: string, config: ObjectConfig): Matter.Body {
  logger.debug(LOG_PREFIX, `Creating circle entity`, { id, radius: config.radius });
  return Matter.Bodies.circle(config.x, config.y, config.radius, {
    restitution: 0.3,
    friction: 0.1,
    frictionAir: 0.01,
    label: `entity:${id}`,
    render: createFillRenderOptions(config)
  });
}

/**
 * Create a circle body with sprite - requires image dimensions
 */
function createCircleEntityWithSprite(id: string, config: ObjectConfig, imageWidth: number, imageHeight: number): Matter.Body {
  logger.debug(LOG_PREFIX, `Creating circle entity with sprite`, { id, radius: config.radius, imageWidth, imageHeight });
  return Matter.Bodies.circle(config.x, config.y, config.radius, {
    restitution: 0.3,
    friction: 0.1,
    frictionAir: 0.01,
    label: `entity:${id}`,
    render: createSpriteRenderOptions(config, imageWidth, imageHeight)
  });
}

/**
 * Synchronous entity creation - handles circles and preset polygon shapes
 * For image-based shape extraction, use createEntityAsync instead
 */
export function createEntity(id: string, config: ObjectConfig): Matter.Body {
  const shape = config.shape;

  // No shape config or circle - use circle
  if (!shape || shape.type === 'circle') {
    return createCircleEntity(id, config);
  }

  // If there's an imageUrl, warn that they should use async for shape extraction
  if (config.imageUrl) {
    logger.warn(LOG_PREFIX, `Image provided but using sync createEntity - shape won't be extracted. Use createEntityAsync for image shape extraction.`);
  }

  // Get vertices for polygon shape
  const vertices = getShapeVertices(shape, config.radius);
  if (!vertices) {
    logger.warn(LOG_PREFIX, `Failed to get vertices, falling back to circle`, { type: shape.type });
    return createCircleEntity(id, config);
  }

  logger.info(LOG_PREFIX, `Creating polygon entity`, { id, type: shape.type, vertices: vertices.length });
  return createBodyFromVertices(id, config.x, config.y, vertices, createFillRenderOptions(config));
}

/**
 * Async entity creation - automatically extracts shape from image if imageUrl provided
 * Falls back to circle if extraction fails
 */
export async function createEntityAsync(id: string, config: ObjectConfig): Promise<Matter.Body> {
  const shape = config.shape;

  // If explicit circle requested, use circle
  if (shape?.type === 'circle') {
    logger.info(LOG_PREFIX, `Creating circle entity (explicit)`, { id });
    return createCircleEntity(id, config);
  }

  // If imageUrl provided, try to extract shape from it
  if (config.imageUrl) {
    logger.debug(LOG_PREFIX, `Attempting to extract shape from image`, { id, imageUrl: config.imageUrl });
    const { vertices, imageWidth, imageHeight } = await getVerticesAndDimensionsFromImage(config.imageUrl, config.radius * 2);

    if (vertices.length >= 3) {
      logger.debug(LOG_PREFIX, `Image shape extraction succeeded`, { id, vertices: vertices.length, imageWidth, imageHeight });
      return createBodyFromVertices(id, config.x, config.y, vertices, createSpriteRenderOptions(config, imageWidth, imageHeight));
    }

    logger.warn(LOG_PREFIX, `Image shape extraction failed, falling back to circle`, { id, verticesFound: vertices.length });
    // Still use sprite for the circle fallback
    return createCircleEntityWithSprite(id, config, imageWidth, imageHeight);
  }

  // No image - check for shape config (polygon presets, custom vertices)
  if (shape) {
    const vertices = getShapeVertices(shape, config.radius);
    if (vertices) {
      logger.info(LOG_PREFIX, `Creating polygon entity`, { id, type: shape.type, vertices: vertices.length });
      return createBodyFromVertices(id, config.x, config.y, vertices, createFillRenderOptions(config));
    }
    logger.warn(LOG_PREFIX, `Failed to get vertices from shape config, falling back to circle`, { type: shape.type });
  }

  // Default: circle
  logger.info(LOG_PREFIX, `Creating circle entity (default)`, { id });
  return createCircleEntity(id, config);
}

export function createObstacle(id: string, config: ObjectConfig, isStatic: boolean = true): Matter.Body {
  const width = config.width ?? 100;
  const height = config.height ?? 20;
  return Matter.Bodies.rectangle(config.x, config.y, width, height, {
    isStatic,
    label: `obstacle:${id}`,
    render: {
      visible: true,
      fillStyle: config.fillStyle ?? '#4a4a6a'
    }
  });
}

/**
 * Get image dimensions without extracting vertices.
 * Useful for calculating letter spacing before creating obstacles.
 */
export async function getImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(imageUrl);
  return { width: img.width, height: img.height };
}

/**
 * Result from createBoxObstacleWithInfo
 */
export interface BoxObstacleResult {
  body: Matter.Body;
  /** Original image dimensions */
  imageWidth: number;
  imageHeight: number;
  /** Scaled dimensions (how large the image appears at target size) */
  scaledWidth: number;
  scaledHeight: number;
  /** Clip bounds within the original image */
  clipBounds: ClipBounds;
  /** Offset from image center to clip center (in scaled coordinates) */
  clipOffset: Vector2D;
}

/**
 * Create an image-clipped obstacle centered at (config.x, config.y).
 * Image center goes at that position, not the shape centroid.
 */
export async function createBoxObstacle(id: string, config: ObjectConfig, isStatic: boolean = true): Promise<Matter.Body> {
  const result = await createBoxObstacleWithInfo(id, config, isStatic);
  return result.body;
}

/**
 * Create an image-clipped obstacle with full positioning info.
 * Returns the body plus dimension info for debug rendering.
 */
export async function createBoxObstacleWithInfo(id: string, config: ObjectConfig, isStatic: boolean = true): Promise<BoxObstacleResult> {
  const size = config.size ?? 50;

  const { vertices, imageWidth, imageHeight, clipBounds, clipOffset } = await getVerticesAndDimensionsFromImage(config.imageUrl!, size);

  const maxDim = Math.max(imageWidth, imageHeight);
  const spriteScale = size / maxDim;
  const scaledWidth = imageWidth * spriteScale;
  const scaledHeight = imageHeight * spriteScale;

  let body: Matter.Body;

  if (vertices.length >= 3) {
    // Translate vertices to world position (like TTF glyph approach)
    const worldVertices = vertices.map(v => ({
      x: config.x + v.x,
      y: config.y + v.y
    }));

    // Use fromVertices - it will position body at centroid of these world vertices
    body = Matter.Bodies.fromVertices(config.x, config.y, [worldVertices], {
      isStatic,
      label: `obstacle:${id}`,
      render: {
        sprite: {
          texture: config.imageUrl!,
          xScale: spriteScale,
          yScale: spriteScale,
          // Offset sprite to compensate for body being at centroid instead of image center
          // body.position will be at vertex centroid, but we want sprite centered on image center (config.x, config.y)
          xOffset: 0.5 + (config.x - body?.position?.x ?? 0) / scaledWidth,
          yOffset: 0.5 + (config.y - body?.position?.y ?? 0) / scaledHeight
        }
      }
    });

    // Calculate sprite offset AFTER body creation (we now know where centroid landed)
    const spriteOffsetX = (config.x - body.position.x) / scaledWidth;
    const spriteOffsetY = (config.y - body.position.y) / scaledHeight;

    if (body.render.sprite) {
      body.render.sprite.xOffset = 0.5 + spriteOffsetX;
      body.render.sprite.yOffset = 0.5 + spriteOffsetY;
    }
  } else {
    // Fallback to rectangle
    body = Matter.Bodies.rectangle(config.x, config.y, scaledWidth, scaledHeight, {
      isStatic,
      label: `obstacle:${id}`,
      render: {
        sprite: {
          texture: config.imageUrl!,
          xScale: spriteScale,
          yScale: spriteScale
        }
      }
    });
  }

  return {
    body,
    imageWidth,
    imageHeight,
    scaledWidth,
    scaledHeight,
    clipBounds,
    clipOffset
  };
}

/**
 * Create an image-based obstacle asynchronously.
 * Extracts shape from image alpha channel.
 */
export async function createObstacleAsync(id: string, config: ObjectConfig, isStatic: boolean = true): Promise<Matter.Body> {
  // If no imageUrl, fall back to rectangle
  if (!config.imageUrl) {
    return createObstacle(id, config, isStatic);
  }

  const size = config.size ?? 50;
  logger.info(LOG_PREFIX, `Creating image-based obstacle`, { id, imageUrl: config.imageUrl, size });

  const { vertices, imageWidth, imageHeight } = await getVerticesAndDimensionsFromImage(config.imageUrl, size);

  if (vertices.length >= 3) {
    logger.info(LOG_PREFIX, `Image obstacle shape extraction succeeded`, { id, vertices: vertices.length, imageWidth, imageHeight });
    const matterVertices = vertices.map(v => ({ x: v.x, y: v.y }));

    const maxDim = Math.max(imageWidth, imageHeight);
    const spriteScale = size / maxDim;

    const body = Matter.Bodies.fromVertices(config.x, config.y, [matterVertices], {
      isStatic,
      label: `obstacle:${id}`,
      render: {
        sprite: {
          texture: config.imageUrl,
          xScale: spriteScale,
          yScale: spriteScale
        }
      }
    });

    // Vertices are now centered on image dimensions, so setPosition aligns correctly
    Matter.Body.setPosition(body, { x: config.x, y: config.y });
    return body;
  }

  // Fall back to rectangle if shape extraction fails
  logger.warn(LOG_PREFIX, `Image obstacle shape extraction failed, falling back to rectangle`, { id });
  return createObstacle(id, config, isStatic);
}
