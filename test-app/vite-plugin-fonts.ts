import { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const VALID_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('');

// Horizontal padding (in pixels) to keep on left/right of character content when trimming
const TRIM_PADDING_X = 16;

/**
 * Find the horizontal content bounds (leftmost and rightmost non-transparent columns) in an image.
 * Returns { left, right } where left is the first column with content and right is the last.
 */
async function findHorizontalContentBounds(
  imageBuffer: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<{ left: number; right: number }> {
  // Alpha channel is the 4th channel (index 3) in RGBA
  const alphaOffset = channels === 4 ? 3 : (channels === 2 ? 1 : -1);

  if (alphaOffset === -1) {
    // No alpha channel, return full width
    return { left: 0, right: width - 1 };
  }

  let left = width;
  let right = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * channels;
      const alpha = imageBuffer[pixelIndex + alphaOffset];

      if (alpha > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  // If no content found, return full width
  if (left > right) {
    return { left: 0, right: width - 1 };
  }

  return { left, right };
}

interface AsepriteFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

interface AsepriteLayer {
  name: string;
  group?: string;
  opacity?: number;
  blendMode?: string;
}

interface AsepriteData {
  frames: { [key: string]: AsepriteFrame };
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
    layers: AsepriteLayer[];
    slices: unknown[];
  };
}

interface FontInfo {
  name: string;
  characters: string;
  type: 'png' | 'ttf';
  fontUrl?: string;
}

/**
 * Extract character names from Aseprite layers metadata.
 * Filters out group layers (those without opacity) and returns only character layers.
 */
function getCharacterNamesFromLayers(layers: AsepriteLayer[]): string[] {
  return layers
    .filter(layer => layer.opacity !== undefined) // Only actual layers, not groups
    .map(layer => layer.name);
}

/**
 * Process Aseprite spritesheets in a font directory.
 * Splits the spritesheet into individual character PNGs.
 */
async function processSpritesheets(fontDir: string): Promise<void> {
  const files = fs.readdirSync(fontDir);

  // Find JSON files that might be Aseprite data
  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('fonts.json'));

  for (const jsonFile of jsonFiles) {
    const jsonPath = path.join(fontDir, jsonFile);

    try {
      const data: AsepriteData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

      // Verify this is Aseprite data
      if (!data.meta?.app?.includes('aseprite') || !data.frames || !data.meta?.layers) {
        continue;
      }

      // Get the spritesheet image path
      const imageName = data.meta.image;
      const imagePath = path.join(fontDir, imageName);

      if (!fs.existsSync(imagePath)) {
        console.warn(`[vite-plugin-fonts] Spritesheet image not found: ${imagePath}`);
        continue;
      }

      // Get character names from layers (in order)
      const characterNames = getCharacterNamesFromLayers(data.meta.layers);

      // Get frames in order (they're keyed by name with index, e.g., "name 0.aseprite", "name 1.aseprite")
      const frameEntries = Object.entries(data.frames);
      frameEntries.sort((a, b) => {
        // Extract the index from frame names like "blockletter_alpha-numeric 0.aseprite"
        const indexA = parseInt(a[0].match(/\s(\d+)\.aseprite$/)?.[1] ?? '0');
        const indexB = parseInt(b[0].match(/\s(\d+)\.aseprite$/)?.[1] ?? '0');
        return indexA - indexB;
      });

      if (frameEntries.length !== characterNames.length) {
        console.warn(`[vite-plugin-fonts] Frame count (${frameEntries.length}) doesn't match character count (${characterNames.length}) in ${jsonFile}`);
        continue;
      }

      // Track which valid characters are in the spritesheet
      const validChars = new Set(VALID_CHARACTERS);
      const foundChars = characterNames.filter(c => validChars.has(c));

      // Check if we have at least a complete set of uppercase OR lowercase letters (plus digits)
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const lowercase = 'abcdefghijklmnopqrstuvwxyz'.split('');
      const digits = '0123456789'.split('');
      const foundSet = new Set(foundChars);

      const hasAllUppercase = uppercase.every(c => foundSet.has(c));
      const hasAllLowercase = lowercase.every(c => foundSet.has(c));
      const hasAllDigits = digits.every(c => foundSet.has(c));

      if (!hasAllUppercase && !hasAllLowercase) {
        console.warn(`[vite-plugin-fonts] Spritesheet ${jsonFile} has incomplete letter set (found: ${foundChars.filter(c => /[A-Za-z]/.test(c)).join('')})`);
      }
      if (!hasAllDigits) {
        const missingDigits = digits.filter(c => !foundSet.has(c));
        console.warn(`[vite-plugin-fonts] Spritesheet ${jsonFile} is missing digits: ${missingDigits.join(', ')}`);
      }

      console.log(`[vite-plugin-fonts] Processing spritesheet: ${imageName} (${frameEntries.length} frames, characters: ${characterNames.join('')})`);

      // Load the spritesheet image
      const spritesheet = sharp(imagePath);
      const metadata = await spritesheet.metadata();

      if (!metadata.width || !metadata.height) {
        console.warn(`[vite-plugin-fonts] Could not read spritesheet dimensions: ${imagePath}`);
        continue;
      }

      // Extract each frame as a separate PNG
      for (let i = 0; i < frameEntries.length; i++) {
        const [, frameData] = frameEntries[i];
        const charName = characterNames[i];

        // Skip if not a valid character
        if (!validChars.has(charName)) {
          continue;
        }

        const outputPath = path.join(fontDir, `${charName}.png`);

        // Skip if PNG already exists and is newer than the spritesheet
        if (fs.existsSync(outputPath)) {
          const spritesheetStat = fs.statSync(imagePath);
          const outputStat = fs.statSync(outputPath);
          if (outputStat.mtimeMs > spritesheetStat.mtimeMs) {
            continue; // Output is newer, skip
          }
        }

        const { x, y, w, h } = frameData.frame;

        // Extract the frame from spritesheet
        const frameImage = sharp(imagePath).extract({ left: x, top: y, width: w, height: h });

        // Get raw pixel data to find content bounds
        const { data: rawData, info } = await frameImage
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const bounds = await findHorizontalContentBounds(rawData, info.width, info.height, info.channels);

        // Calculate crop region with padding
        const cropLeft = Math.max(0, bounds.left - TRIM_PADDING_X);
        const cropRight = Math.min(info.width - 1, bounds.right + TRIM_PADDING_X);
        const cropWidth = cropRight - cropLeft + 1;

        // Re-extract the frame and apply horizontal trim
        await sharp(imagePath)
          .extract({ left: x + cropLeft, top: y, width: cropWidth, height: h })
          .toFile(outputPath);

        console.log(`[vite-plugin-fonts] Extracted ${charName}.png (${cropWidth}x${h}, trimmed from ${w}x${h})`);
      }

      console.log(`[vite-plugin-fonts] Finished processing spritesheet: ${imageName}`);

    } catch (error) {
      console.warn(`[vite-plugin-fonts] Error processing ${jsonFile}:`, error);
    }
  }
}

/**
 * Process all font directories for spritesheets.
 */
async function processAllSpritesheets(fontsDir: string): Promise<void> {
  if (!fs.existsSync(fontsDir)) {
    return;
  }

  const entries = fs.readdirSync(fontsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fontDir = path.join(fontsDir, entry.name);
    await processSpritesheets(fontDir);
  }
}

function scanFontsDirectory(fontsDir: string): FontInfo[] {
  const fonts: FontInfo[] = [];

  if (!fs.existsSync(fontsDir)) {
    return fonts;
  }

  const entries = fs.readdirSync(fontsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fontDir = path.join(fontsDir, entry.name);
    const files = fs.readdirSync(fontDir);

    // Check for TTF fonts first
    const ttfFiles = files.filter(f => f.endsWith('.ttf') || f.endsWith('.otf'));
    if (ttfFiles.length > 0) {
      // Use the first TTF file found, or look for common variants
      const preferredNames = ['Regular', 'Medium', 'Bold'];
      let selectedTtf = ttfFiles[0];

      for (const pref of preferredNames) {
        const match = ttfFiles.find(f => f.includes(pref) && !f.includes('Italic'));
        if (match) {
          selectedTtf = match;
          break;
        }
      }

      fonts.push({
        name: entry.name,
        characters: '*', // TTF fonts support all characters
        type: 'ttf',
        fontUrl: `/fonts/${entry.name}/${selectedTtf}`
      });

      // Also check for a 'static' subdirectory (common in Google Fonts)
      const staticDir = path.join(fontDir, 'static');
      if (fs.existsSync(staticDir)) {
        const staticFiles = fs.readdirSync(staticDir).filter(f => f.endsWith('.ttf') || f.endsWith('.otf'));
        if (staticFiles.length > 0) {
          let selectedStaticTtf = staticFiles[0];
          for (const pref of preferredNames) {
            const match = staticFiles.find(f => f.includes(pref) && !f.includes('Italic'));
            if (match) {
              selectedStaticTtf = match;
              break;
            }
          }
          // Update the fontUrl to use the static version
          fonts[fonts.length - 1].fontUrl = `/fonts/${entry.name}/static/${selectedStaticTtf}`;
        }
      }

      continue; // Skip PNG check for TTF font directories
    }

    // Check which valid characters have PNGs
    const validChars: string[] = [];
    for (const char of VALID_CHARACTERS) {
      if (files.includes(`${char}.png`)) {
        validChars.push(char);
      }
    }

    // Only include font if it has at least some valid character PNGs
    if (validChars.length > 0) {
      fonts.push({
        name: entry.name,
        type: 'png',
        characters: validChars.join('')
      });
    }
  }

  // Sort alphabetically by name
  fonts.sort((a, b) => a.name.localeCompare(b.name));

  return fonts;
}

async function generateManifest(fontsDir: string, outputPath: string): Promise<void> {
  // First, process any spritesheets to extract individual PNGs
  await processAllSpritesheets(fontsDir);

  // Then scan for fonts (including newly extracted PNGs)
  const fonts = scanFontsDirectory(fontsDir);
  const manifest = { fonts };
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`[vite-plugin-fonts] Generated fonts.json with ${fonts.length} fonts:`, fonts.map(f => f.name).join(', '));
}

export function fontsPlugin(): Plugin {
  let fontsDir: string;
  let manifestPath: string;
  let isProcessing = false;

  const runGeneration = async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await generateManifest(fontsDir, manifestPath);
    } finally {
      isProcessing = false;
    }
  };

  return {
    name: 'vite-plugin-fonts',

    configResolved(config) {
      fontsDir = path.join(config.publicDir, 'fonts');
      manifestPath = path.join(fontsDir, 'fonts.json');
    },

    async buildStart() {
      await generateManifest(fontsDir, manifestPath);
    },

    configureServer(server) {
      // Watch for changes in fonts directory
      server.watcher.add(fontsDir);

      server.watcher.on('all', (event, filePath) => {
        // Ignore generated files and manifest
        if (filePath.endsWith('fonts.json')) return;

        // Only trigger on spritesheet or PNG changes
        if (filePath.startsWith(fontsDir) && (filePath.endsWith('.png') || filePath.endsWith('.json'))) {
          console.log(`[vite-plugin-fonts] Font change detected: ${event} ${path.basename(filePath)}`);
          runGeneration();
        }
      });

      // Generate on server start
      runGeneration();
    }
  };
}
