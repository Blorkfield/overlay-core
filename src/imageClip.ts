import { logger } from './logger';

export interface Vector2D {
  x: number;
  y: number;
}

const LOG_PREFIX = 'ImageClip';
const ALPHA_THRESHOLD = 128;

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

export async function getVerticesFromImage(imageUrl: string, targetSize: number): Promise<Vector2D[]> {
  logger.info(LOG_PREFIX, `Getting vertices from image`, { imageUrl, targetSize });

  try {
    const img = await loadImage(imageUrl);
    const { data, width, height } = getImageAlphaData(img);

    const contour = extractContour(data, width, height);
    if (contour.length < 3) {
      logger.warn(LOG_PREFIX, `Contour has insufficient points`, { pointCount: contour.length });
      return [];
    }

    // Simplify based on image size - larger images need more aggressive simplification
    const epsilon = Math.max(width, height) / 50;
    const simplified = simplifyContour(contour, epsilon);
    logger.debug(LOG_PREFIX, `Simplified contour`, { original: contour.length, simplified: simplified.length, epsilon });

    // Ensure we have at least 3 vertices for a valid polygon
    if (simplified.length < 3) {
      logger.warn(LOG_PREFIX, `Simplified contour has insufficient points`, { pointCount: simplified.length });
      return [];
    }

    const normalized = normalizeVertices(simplified, targetSize);
    logger.info(LOG_PREFIX, `Vertices extracted successfully`, { vertexCount: normalized.length });
    return normalized;
  } catch (error) {
    logger.error(LOG_PREFIX, `Failed to extract vertices from image`, { error: String(error) });
    return [];
  }
}
