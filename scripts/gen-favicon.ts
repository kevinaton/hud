/**
 * gen-favicon.ts
 *
 * Generates favicon.ico (16x16 + 32x32) and apple-touch-icon.png (180x180)
 * from apps/web/public/favicon.svg using the sharp library.
 *
 * sharp is a transitive dependency of Next.js (already in the pnpm virtual
 * store). We load it from the pnpm store path so no extra dependency is needed.
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/gen-favicon.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Minimal interface for the sharp methods this script actually calls.
interface SharpInstance {
  resize(width: number, height: number): SharpInstance;
  png(): SharpInstance;
  toBuffer(): Promise<Buffer>;
}
type SharpFactory = (input: Buffer) => SharpInstance;

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function loadSharp(): SharpFactory {
  // sharp is installed as a dependency of next@15 which is in apps/web.
  // Resolve it from the pnpm virtual store where it is guaranteed to exist.
  const sharpPath = path.resolve(
    import.meta.dirname,
    '../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp',
  );
  try {
    return require(sharpPath) as SharpFactory;
  } catch (err) {
    process.stderr.write(
      `Could not load sharp from ${sharpPath}.\nRun: pnpm add -D -w sharp  then re-run this script.\nError: ${String(err)}\n`,
    );
    process.exit(1);
  }
}

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'apps/web/public');
const SVG_PATH = path.join(PUBLIC_DIR, 'favicon.svg');

/**
 * Assembles a multi-resolution .ico file from an array of PNG Buffers.
 * Implements the ICO file format (ICONDIR + ICONDIRENTRY[] + PNG data).
 *
 * ICO with embedded PNGs is supported by all modern browsers and Windows
 * since Vista. Browsers prefer the embedded PNG over raw BMP data.
 */
function assembleFaviconIco(pngBuffers: Buffer[]): Buffer {
  const count = pngBuffers.length;

  // ICO header: reserved(2) + type(2) + count(2) = 6 bytes
  const headerSize = 6;
  // Each ICONDIRENTRY is 16 bytes
  const dirSize = 16 * count;
  const dataOffset = headerSize + dirSize;

  let totalSize = dataOffset;
  for (const buf of pngBuffers) {
    totalSize += buf.length;
  }

  const ico = Buffer.alloc(totalSize);
  let pos = 0;

  // ICONDIR header
  ico.writeUInt16LE(0, pos);
  pos += 2; // reserved
  ico.writeUInt16LE(1, pos);
  pos += 2; // type = 1 (ICO)
  ico.writeUInt16LE(count, pos);
  pos += 2; // image count

  // Pre-compute per-image metadata
  const entries: Array<{
    width: number;
    height: number;
    dataOffset: number;
    dataSize: number;
  }> = [];
  let imageDataOffset = dataOffset;
  for (const buf of pngBuffers) {
    // PNG dimensions live at bytes 16–23 of the PNG blob:
    //   8-byte PNG signature + 4-byte IHDR length + 4-byte "IHDR" type
    //   = offset 16 (width, 4 bytes BE) / 20 (height, 4 bytes BE)
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    entries.push({ width, height, dataOffset: imageDataOffset, dataSize: buf.length });
    imageDataOffset += buf.length;
  }

  // Write ICONDIRENTRY records (16 bytes each)
  for (const entry of entries) {
    ico.writeUInt8(entry.width >= 256 ? 0 : entry.width, pos);
    pos += 1;
    ico.writeUInt8(entry.height >= 256 ? 0 : entry.height, pos);
    pos += 1;
    ico.writeUInt8(0, pos);
    pos += 1; // color count (0 = no palette / truecolour)
    ico.writeUInt8(0, pos);
    pos += 1; // reserved
    ico.writeUInt16LE(1, pos);
    pos += 2; // planes
    ico.writeUInt16LE(32, pos);
    pos += 2; // bit count (32bpp — PNG carries its own header)
    ico.writeUInt32LE(entry.dataSize, pos);
    pos += 4;
    ico.writeUInt32LE(entry.dataOffset, pos);
    pos += 4;
  }

  // Write PNG image data
  for (const buf of pngBuffers) {
    buf.copy(ico, pos);
    pos += buf.length;
  }

  return ico;
}

async function main(): Promise<void> {
  const sharp = loadSharp();
  const svgBuffer = fs.readFileSync(SVG_PATH);
  log(`Read ${SVG_PATH} (${svgBuffer.length} bytes)`);

  const png16 = (await sharp(svgBuffer).resize(16, 16).png().toBuffer()) as Buffer;
  log(`Generated 16x16 PNG (${png16.length} bytes)`);

  const png32 = (await sharp(svgBuffer).resize(32, 32).png().toBuffer()) as Buffer;
  log(`Generated 32x32 PNG (${png32.length} bytes)`);

  const png180 = (await sharp(svgBuffer).resize(180, 180).png().toBuffer()) as Buffer;
  log(`Generated 180x180 PNG (${png180.length} bytes)`);

  // Build .ico: 16x16 first, then 32x32 (browsers pick the best fit)
  const icoBuffer = assembleFaviconIco([png16, png32]);
  const icoPath = path.join(PUBLIC_DIR, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  log(`Wrote ${icoPath} (${icoBuffer.length} bytes)`);

  const touchIconPath = path.join(PUBLIC_DIR, 'apple-touch-icon.png');
  fs.writeFileSync(touchIconPath, png180);
  log(`Wrote ${touchIconPath} (${png180.length} bytes)`);

  log('\nDone. All favicon assets generated successfully.');
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
