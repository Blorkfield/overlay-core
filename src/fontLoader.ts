import opentype from 'opentype.js';
import { logger } from './logger';

const LOG_PREFIX = 'FontLoader';

export interface Vector2D {
  x: number;
  y: number;
}

export interface GlyphData {
  vertices: Vector2D[];
  advanceWidth: number;
  leftSideBearing: number;
  boundingBox: { x1: number; y1: number; x2: number; y2: number } | null;
}

export interface LoadedFont {
  font: opentype.Font;
  unitsPerEm: number;
  ascender: number;
  descender: number;
}

// Cache for loaded fonts
const fontCache: Map<string, LoadedFont> = new Map();

/**
 * Load a TTF/OTF font from a URL
 */
export async function loadFont(fontUrl: string): Promise<LoadedFont> {
  const cached = fontCache.get(fontUrl);
  if (cached) {
    logger.debug(LOG_PREFIX, `Font cache hit`, { fontUrl });
    return cached;
  }

  logger.info(LOG_PREFIX, `Loading font`, { fontUrl });

  const font = await opentype.load(fontUrl);

  const loadedFont: LoadedFont = {
    font,
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender
  };

  fontCache.set(fontUrl, loadedFont);
  logger.info(LOG_PREFIX, `Font loaded`, { fontUrl, unitsPerEm: font.unitsPerEm });

  return loadedFont;
}

/**
 * Convert a glyph path to vertices for Matter.js collision
 * Returns vertices scaled to the target font size
 */
export function glyphToVertices(
  glyph: opentype.Glyph,
  fontSize: number,
  unitsPerEm: number
): Vector2D[] {
  const path = glyph.getPath(0, 0, fontSize);
  const commands = path.commands;

  if (commands.length === 0) {
    return [];
  }

  const vertices: Vector2D[] = [];
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': // Move to
        currentX = cmd.x;
        currentY = cmd.y;
        vertices.push({ x: currentX, y: currentY });
        break;

      case 'L': // Line to
        currentX = cmd.x;
        currentY = cmd.y;
        vertices.push({ x: currentX, y: currentY });
        break;

      case 'Q': // Quadratic bezier - sample points along curve
        {
          const steps = 4;
          for (let t = 1; t <= steps; t++) {
            const tNorm = t / steps;
            const x = (1 - tNorm) * (1 - tNorm) * currentX +
                      2 * (1 - tNorm) * tNorm * cmd.x1 +
                      tNorm * tNorm * cmd.x;
            const y = (1 - tNorm) * (1 - tNorm) * currentY +
                      2 * (1 - tNorm) * tNorm * cmd.y1 +
                      tNorm * tNorm * cmd.y;
            vertices.push({ x, y });
          }
          currentX = cmd.x;
          currentY = cmd.y;
        }
        break;

      case 'C': // Cubic bezier - sample points along curve
        {
          const steps = 6;
          for (let t = 1; t <= steps; t++) {
            const tNorm = t / steps;
            const mt = 1 - tNorm;
            const x = mt * mt * mt * currentX +
                      3 * mt * mt * tNorm * cmd.x1 +
                      3 * mt * tNorm * tNorm * cmd.x2 +
                      tNorm * tNorm * tNorm * cmd.x;
            const y = mt * mt * mt * currentY +
                      3 * mt * mt * tNorm * cmd.y1 +
                      3 * mt * tNorm * tNorm * cmd.y2 +
                      tNorm * tNorm * tNorm * cmd.y;
            vertices.push({ x, y });
          }
          currentX = cmd.x;
          currentY = cmd.y;
        }
        break;

      case 'Z': // Close path
        // Path closed, don't add duplicate vertex
        break;
    }
  }

  // Simplify vertices to reduce count (remove colinear points)
  return simplifyVertices(vertices, fontSize / 50);
}

/**
 * Simplify vertices by removing points that are too close together
 */
function simplifyVertices(vertices: Vector2D[], minDistance: number): Vector2D[] {
  if (vertices.length < 3) return vertices;

  const result: Vector2D[] = [vertices[0]];

  for (let i = 1; i < vertices.length; i++) {
    const last = result[result.length - 1];
    const curr = vertices[i];
    const dist = Math.sqrt((curr.x - last.x) ** 2 + (curr.y - last.y) ** 2);

    if (dist >= minDistance) {
      result.push(curr);
    }
  }

  return result;
}

/**
 * Get glyph data for a character including vertices and metrics
 */
export function getGlyphData(
  loadedFont: LoadedFont,
  char: string,
  fontSize: number
): GlyphData {
  const { font, unitsPerEm } = loadedFont;
  const glyph = font.charToGlyph(char);

  if (!glyph) {
    logger.warn(LOG_PREFIX, `Glyph not found for character`, { char });
    return {
      vertices: [],
      advanceWidth: fontSize / 2,
      leftSideBearing: 0,
      boundingBox: null
    };
  }

  const scale = fontSize / unitsPerEm;
  const advanceWidth = (glyph.advanceWidth ?? 0) * scale;
  const leftSideBearing = (glyph.leftSideBearing ?? 0) * scale;

  const bbox = glyph.getBoundingBox();
  const boundingBox = bbox ? {
    x1: bbox.x1 * scale,
    y1: bbox.y1 * scale,
    x2: bbox.x2 * scale,
    y2: bbox.y2 * scale
  } : null;

  const vertices = glyphToVertices(glyph, fontSize, unitsPerEm);

  return {
    vertices,
    advanceWidth,
    leftSideBearing,
    boundingBox
  };
}

/**
 * Get kerning adjustment between two characters
 */
export function getKerning(
  loadedFont: LoadedFont,
  char1: string,
  char2: string,
  fontSize: number
): number {
  const { font, unitsPerEm } = loadedFont;
  const glyph1 = font.charToGlyph(char1);
  const glyph2 = font.charToGlyph(char2);

  if (!glyph1 || !glyph2) return 0;

  const kerning = font.getKerningValue(glyph1, glyph2);
  const scale = fontSize / unitsPerEm;

  return kerning * scale;
}

/**
 * Calculate total width of a string with proper spacing and kerning
 */
export function measureText(
  loadedFont: LoadedFont,
  text: string,
  fontSize: number
): number {
  let width = 0;
  const chars = text.split('');

  for (let i = 0; i < chars.length; i++) {
    const glyphData = getGlyphData(loadedFont, chars[i], fontSize);
    width += glyphData.advanceWidth;

    // Add kerning with next character
    if (i < chars.length - 1) {
      width += getKerning(loadedFont, chars[i], chars[i + 1], fontSize);
    }
  }

  return width;
}

/**
 * Clear the font cache
 */
export function clearFontCache(): void {
  fontCache.clear();
  logger.debug(LOG_PREFIX, `Font cache cleared`);
}
