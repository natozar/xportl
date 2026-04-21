/**
 * One-shot OG image generator.
 *
 * Reads public/og-image.svg, rasterizes to public/og-image.png at
 * 1200x630 (standard Open Graph size, also used by Twitter, Telegram,
 * WhatsApp, Discord, LinkedIn). Fonts are system-safe (Georgia italic
 * + Arial) so rasterization is deterministic across Windows/macOS/Linux.
 *
 * Run with: node scripts/generate-og.mjs
 */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const svg = await readFile(join(root, 'public', 'og-image.svg'));
const png = await sharp(svg, { density: 192 })
  .resize(1200, 630, { fit: 'cover' })
  .png({ quality: 92, compressionLevel: 9 })
  .toBuffer();

await writeFile(join(root, 'public', 'og-image.png'), png);
console.log(`[OG] wrote public/og-image.png — ${(png.length / 1024).toFixed(1)}KB`);
