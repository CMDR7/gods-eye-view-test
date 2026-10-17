import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(process.cwd());
const source = resolve(root, 'public/icons/gev-target.svg');
const outputDir = resolve(root, 'dist-web-core/icons');

const sizes = [32, 180, 192, 512];
const maskableSize = 512;

await mkdir(outputDir, { recursive: true });
const svg = await readFile(source);

for (const size of sizes) {
  await sharp(svg).resize(size, size, { fit: 'cover' }).png().toFile(resolve(outputDir, `icon-${size}.png`));
}

await sharp(svg)
  .resize(maskableSize, maskableSize, { fit: 'cover' })
  .png()
  .toFile(resolve(outputDir, 'icon-512-maskable.png'));

console.log(`Generated original GEV target icons: ${[...sizes, maskableSize].join(', ')}px`);
