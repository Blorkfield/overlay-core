import { logger } from './logger';

export interface Vector2D {
  x: number;
  y: number;
}

const LOG_PREFIX = 'ImageClip';
const ALPHA_THRESHOLD = 128;

// Cache for extracted vertices - keyed by imageUrl
// We cache the raw contour data (before scaling) so it can be reused at different sizes
interface ContourCacheEntry {
  vertices: Vector2D[];  // Normalized to unit size (-0.5 to 0.5 range)
  imageWidth: number;
  imageHeight: number;
  timestamp: number;
}

const contourCache: Map<string, ContourCacheEntry> = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function loadImage(url: string): Promise<HTMLImageElement> {
  logger.debug(LOG_PREFIX, `Loading image: ${url}`);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      logger.debug(LOG_PREFIX, `Image loaded successfully`, { width: img.width, height: img.height });
      resolve(img);
    };
    img.onerror = () => {
      logger.error(LOG_PREFIX, `Failed to load image: ${url}`);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
}

export function getImageAlphaData(img: HTMLImageElement): { data: Uint8ClampedArray; width: number; height: number } {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  return { data: imageData.data, width: img.width, height: img.height };
}

function getAlpha(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= width) return 0;
  const idx = (y * width + x) * 4 + 3;
  return data[idx] ?? 0;
}

function isSolid(data: Uint8ClampedArray, width: number, x: number, y: number): boolean {
  return getAlpha(data, width, x, y) >= ALPHA_THRESHOLD;
}

// Marching squares to extract contour
export function extractContour(data: Uint8ClampedArray, width: number, height: number): Vector2D[] {
  logger.debug(LOG_PREFIX, `Extracting contour from image`, { width, height });

  // Find starting point (first solid pixel from top-left)
  let startX = -1;
  let startY = -1;

  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isSolid(data, width, x, y)) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }

  if (startX === -1) {
    logger.warn(LOG_PREFIX, `No solid pixels found in image`);
    return [];
  }

  logger.debug(LOG_PREFIX, `Found starting point`, { startX, startY });

  const contour: Vector2D[] = [];
  let x = startX;
  let y = startY;
  let dir = 0; // 0=right, 1=down, 2=left, 3=up

  const dx = [1, 0, -1, 0];
  const dy = [0, 1, 0, -1];

  do {
    contour.push({ x, y });

    // Try to turn left first, then straight, then right, then back
    for (let i = 0; i < 4; i++) {
      const newDir = (dir + 3 + i) % 4; // left, straight, right, back
      const nx = x + dx[newDir];
      const ny = y + dy[newDir];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height && isSolid(data, width, nx, ny)) {
        x = nx;
        y = ny;
        dir = newDir;
        break;
      }
    }

    // Prevent infinite loops
    if (contour.length > width * height) {
      logger.warn(LOG_PREFIX, `Contour extraction hit safety limit, breaking`);
      break;
    }
  } while (x !== startX || y !== startY);

  logger.debug(LOG_PREFIX, `Contour extracted`, { pointCount: contour.length });
  return contour;
}

// Simplify contour using Ramer-Douglas-Peucker algorithm
export function simplifyContour(points: Vector2D[], epsilon: number): Vector2D[] {
  if (points.length < 3) return points;

  let maxDist = 0;
  let maxIdx = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyContour(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyContour(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
}

function perpendicularDistance(point: Vector2D, lineStart: Vector2D, lineEnd: Vector2D): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const mag = Math.sqrt(dx * dx + dy * dy);

  if (mag === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }

  const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);
  const closestX = lineStart.x + u * dx;
  const closestY = lineStart.y + u * dy;

  return Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
}

// Scale and center vertices for Matter.js body creation
export function normalizeVertices(vertices: Vector2D[], targetSize: number): Vector2D[] {
  if (vertices.length === 0) return [];

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const scale = targetSize / Math.max(width, height);

  // Center at origin and scale
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return vertices.map(v => ({
    x: (v.x - centerX) * scale,
    y: (v.y - centerY) * scale
  }));
}

/**
 * Scale cached unit vertices to target size
 */
function scaleVertices(vertices: Vector2D[], targetSize: number): Vector2D[] {
  return vertices.map(v => ({
    x: v.x * targetSize,
    y: v.y * targetSize
  }));
}

/**
 * Clean up expired cache entries
 */
function cleanupCache(): void {
  const now = Date.now();
  for (const [key, entry] of contourCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      contourCache.delete(key);
    }
  }
  // If still over limit, remove oldest entries
  if (contourCache.size > CACHE_MAX_SIZE) {
    const entries = Array.from(contourCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, entries.length - CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      contourCache.delete(key);
    }
  }
}

/**
 * Extract vertices from image, with caching for repeated calls.
 * Vertices are cached normalized to unit size and scaled to targetSize on retrieval.
 */
export async function getVerticesFromImage(imageUrl: string, targetSize: number): Promise<Vector2D[]> {
  const result = await getVerticesAndDimensionsFromImage(imageUrl, targetSize);
  return result.vertices;
}

/**
 * Extract vertices from image along with original image dimensions.
 * Useful when you need to know the source image size for sprite scaling.
 */
export async function getVerticesAndDimensionsFromImage(imageUrl: string, targetSize: number): Promise<{ vertices: Vector2D[]; imageWidth: number; imageHeight: number }> {
  logger.info(LOG_PREFIX, `Getting vertices from image`, { imageUrl, targetSize });

  // Check cache first
  const cached = contourCache.get(imageUrl);
  if (cached) {
    logger.debug(LOG_PREFIX, `Cache hit for image`, { imageUrl, cachedVertices: cached.vertices.length });
    cached.timestamp = Date.now(); // Refresh TTL on access
    return {
      vertices: scaleVertices(cached.vertices, targetSize),
      imageWidth: cached.imageWidth,
      imageHeight: cached.imageHeight
    };
  }

  logger.debug(LOG_PREFIX, `Cache miss for image`, { imageUrl });

  try {
    const img = await loadImage(imageUrl);
    const { data, width, height } = getImageAlphaData(img);

    const contour = extractContour(data, width, height);
    if (contour.length < 3) {
      logger.warn(LOG_PREFIX, `Contour has insufficient points`, { pointCount: contour.length });
      return { vertices: [], imageWidth: width, imageHeight: height };
    }

    // Simplify based on image size - larger images need more aggressive simplification
    const epsilon = Math.max(width, height) / 50;
    const simplified = simplifyContour(contour, epsilon);
    logger.debug(LOG_PREFIX, `Simplified contour`, { original: contour.length, simplified: simplified.length, epsilon });

    // Ensure we have at least 3 vertices for a valid polygon
    if (simplified.length < 3) {
      logger.warn(LOG_PREFIX, `Simplified contour has insufficient points`, { pointCount: simplified.length });
      return { vertices: [], imageWidth: width, imageHeight: height };
    }

    // Normalize to unit size (vertices centered at origin, fitting in -0.5 to 0.5 range)
    const unitVertices = normalizeVertices(simplified, 1);

    // Cache the unit-sized vertices along with image dimensions
    contourCache.set(imageUrl, {
      vertices: unitVertices,
      imageWidth: width,
      imageHeight: height,
      timestamp: Date.now()
    });
    cleanupCache();

    logger.info(LOG_PREFIX, `Vertices extracted and cached`, { imageUrl, vertexCount: unitVertices.length, width, height });

    // Scale to requested size and return
    return {
      vertices: scaleVertices(unitVertices, targetSize),
      imageWidth: width,
      imageHeight: height
    };
  } catch (error) {
    logger.error(LOG_PREFIX, `Failed to extract vertices from image`, { error: String(error) });
    return { vertices: [], imageWidth: 0, imageHeight: 0 };
  }
}

/**
 * Clear the vertex cache (useful for testing or memory management)
 */
export function clearVertexCache(): void {
  contourCache.clear();
  logger.debug(LOG_PREFIX, `Vertex cache cleared`);
}

/**
 * Get cache statistics
 */
export function getVertexCacheStats(): { size: number; maxSize: number } {
  return { size: contourCache.size, maxSize: CACHE_MAX_SIZE };
}

// Cache for tinted images - keyed by "imageUrl:color"
const tintedImageCache: Map<string, string> = new Map();
const TINTED_CACHE_MAX_SIZE = 200;

/**
 * Parse a CSS color string to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  // Create a temporary canvas to parse the color
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return { r: data[0], g: data[1], b: data[2] };
}

/**
 * Tint an image by replacing all non-transparent pixels with the specified color,
 * preserving the original alpha values.
 *
 * @param imageUrl - URL of the image to tint
 * @param color - CSS color string (e.g., '#ff0000', 'red', 'rgb(255,0,0)')
 * @returns Data URL of the tinted image
 */
export async function tintImage(imageUrl: string, color: string): Promise<string> {
  const cacheKey = `${imageUrl}:${color}`;

  // Check cache first
  const cached = tintedImageCache.get(cacheKey);
  if (cached) {
    logger.debug(LOG_PREFIX, `Tinted image cache hit`, { imageUrl, color });
    return cached;
  }

  logger.debug(LOG_PREFIX, `Tinting image`, { imageUrl, color });

  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Parse the target color
    const rgb = parseColor(color);
    if (!rgb) {
      logger.warn(LOG_PREFIX, `Failed to parse color, returning original image`, { color });
      return imageUrl;
    }

    // Replace colors while preserving alpha
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0) {
        data[i] = rgb.r;     // R
        data[i + 1] = rgb.g; // G
        data[i + 2] = rgb.b; // B
        // data[i + 3] stays the same (alpha)
      }
    }

    // Put modified data back
    ctx.putImageData(imageData, 0, 0);

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png');

    // Cache the result
    tintedImageCache.set(cacheKey, dataUrl);

    // Clean up cache if too large
    if (tintedImageCache.size > TINTED_CACHE_MAX_SIZE) {
      const firstKey = tintedImageCache.keys().next().value;
      if (firstKey) {
        tintedImageCache.delete(firstKey);
      }
    }

    logger.debug(LOG_PREFIX, `Image tinted successfully`, { imageUrl, color });
    return dataUrl;
  } catch (error) {
    logger.error(LOG_PREFIX, `Failed to tint image`, { error: String(error) });
    return imageUrl; // Return original on error
  }
}

/**
 * Clear the tinted image cache
 */
export function clearTintedImageCache(): void {
  tintedImageCache.clear();
  logger.debug(LOG_PREFIX, `Tinted image cache cleared`);
}
