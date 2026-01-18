import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Get the absolute path to the bundled fonts directory.
 * This is useful for build tools or scripts that need to copy fonts.
 *
 * @example
 * ```typescript
 * import { getBundledFontsPath } from '@blorkfield/overlay-core/fonts';
 *
 * const fontsPath = getBundledFontsPath();
 * // Returns: /path/to/node_modules/@blorkfield/overlay-core/fonts
 * ```
 */
export function getBundledFontsPath(): string {
  // In ESM, __dirname is not available, so we derive it from import.meta.url
  // However, since this might be called from CJS context after build,
  // we use a workaround that works in both contexts
  try {
    // Try ESM approach first
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
    // From dist/fonts.js, fonts are at ../fonts
    return resolve(currentDir, '..', 'fonts');
  } catch {
    // Fallback for CJS - use __dirname if available
    if (typeof __dirname !== 'undefined') {
      return resolve(__dirname, '..', 'fonts');
    }
    throw new Error('Unable to determine fonts path');
  }
}

/**
 * Default fonts included with the package.
 */
export const DEFAULT_FONTS = {
  /** Block/pixel style font with uppercase, lowercase, and digits */
  block: 'block',
  /** Handwritten style font with uppercase letters and digits */
  handwritten: 'handwritten',
  /** Roboto TTF font (all characters) */
  roboto: 'Roboto',
} as const;

/**
 * Information about bundled fonts.
 */
export interface BundledFontInfo {
  /** Font directory name */
  name: string;
  /** Font type */
  type: 'png' | 'ttf';
  /** Characters supported (or '*' for TTF) */
  characters: string;
  /** Description of the font */
  description: string;
}

/**
 * Get information about all bundled fonts.
 */
export function getBundledFontsInfo(): BundledFontInfo[] {
  return [
    {
      name: 'block',
      type: 'png',
      characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      description: 'Block/pixel style font with uppercase, lowercase, and digits',
    },
    {
      name: 'handwritten',
      type: 'png',
      characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      description: 'Handwritten style font with uppercase letters and digits',
    },
    {
      name: 'Roboto',
      type: 'ttf',
      characters: '*',
      description: 'Roboto TTF font (all characters supported)',
    },
  ];
}
