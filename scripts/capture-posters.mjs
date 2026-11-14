import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, readFile, copyFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/models/optimized/manifest.json', 'utf8'));
const output = process.env.OUTPUT_DIR ?? 'public/images/posters';
await mkdir(output, { recursive: true });
if (process.env.BASELINE_DIR) await mkdir(process.env.BASELINE_DIR, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  for (const slug of Object.keys(manifest)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => console.error(`${slug}: ${error.message}`));
    await page.goto(`${process.env.BASE_URL ?? 'http://127.0.0.1:3000'}/mission/${slug}`);
    const inspect = page.getByRole('button', { name: 'Inspect model', exact: true });
    if (await inspect.count()) await inspect.click();
    await page.locator('[data-model-state="ready"]').waitFor({ timeout: 120000 });
    const canvas = page.locator('[data-model-state="ready"] canvas');
    const file = `${output}/${slug}.webp`;
    // Locator screenshots include overlapping DOM; hide it only during the canvas export.
    await sharp(await canvas.screenshot({
      style: 'body * { visibility: hidden !important; } [data-model-state=\"ready\"] canvas { visibility: visible !important; }',
    })).webp({ quality: 82 }).toFile(file);
    if (process.env.BASELINE_DIR) await copyFile(file, `${process.env.BASELINE_DIR}/${slug}.webp`);
    console.log(`Captured ${slug}: ${file}`);
    await page.close();
  }
} finally {
  await browser.close();
}
