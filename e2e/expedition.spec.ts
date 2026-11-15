import { expect, test, type Page } from '@playwright/test';

test('expedition renders chapters and navigates to a mission record', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/NASA Mission Gallery/);
  const link = page.locator('a[href^="/mission/"]').first();
  await expect(link).toBeAttached();
  const href = await link.getAttribute('href');
  await page.goto(href!);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the expedition' })).toBeVisible();
});

test('model mission record offers lazy inspect control', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('a[href^="/mission/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  let found = false;
  for (const href of [...new Set(hrefs)]) {
    await page.goto(href!);
    if (await page.getByRole('button', { name: 'Inspect model' }).count()) { found = true; break; }
  }
  expect(found).toBe(true);
  await page.getByRole('button', { name: 'Inspect model' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
});

const MODEL_ROUTES = ['apollo-11', 'viking-1', 'mars-pathfinder', 'mars-exploration-rovers', 'insight', 'ingenuity', 'pioneer-10', 'near-shoemaker'];

// The launch button can be clicked before hydration; retry until the viewer actually mounts.
async function launchViewer(page: Page) {
  await expect(async () => {
    const button = page.getByRole('button', { name: 'Inspect model' });
    if (await button.count()) await button.click({ timeout: 2000 });
    await expect(page.locator('canvas')).toBeAttached({ timeout: 2000 });
  }).toPass({ timeout: 30000 });
}

async function openViewer(page: Page, slug: string) {
  await page.goto(`/mission/${slug}`);
  await launchViewer(page);
  await expect(page.locator('[data-model-state="ready"]')).toBeAttached({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeEnabled();
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  // Overlays (toolbar, labels, focus ring) are hidden so screenshots compare only the rendered model.
  await page.addStyleTag({ content: '[role="toolbar"], canvas ~ div[aria-hidden="true"] { opacity: 0 !important } canvas:focus-visible { outline: none !important }' });
  // Rendered pixels settle after damping; compare screenshots of the stage.
  const shot = async () => {
    await page.waitForTimeout(450);
    return canvas.screenshot({ animations: 'disabled' });
  };
  return { canvas, shot };
}

test('Apollo viewer: toolbar buttons do not overlap and views change the render', async ({ page }) => {
  const { canvas, shot } = await openViewer(page, 'apollo-11');
  const names = ['Labels', 'Spin', 'Reset view', 'Front view', 'Side view', 'Top view', 'Zoom in', 'Zoom out'];
  const boxes = [];
  for (const name of names) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    boxes.push(box!);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${names[i]} overlaps ${names[j]}`).toBe(false);
    }
  }
  const initial = await shot();
  await page.getByRole('button', { name: 'Top view' }).click();
  const top = await shot();
  expect(Buffer.compare(top, initial)).not.toBe(0);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(Buffer.compare(await shot(), top)).not.toBe(0);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 3 + 30, { steps: 8 });
  await page.mouse.up();
  const orbited = await shot();
  expect(Buffer.compare(orbited, top)).not.toBe(0);
  await page.getByRole('button', { name: 'Reset view' }).click();
  expect(Buffer.compare(await shot(), initial)).toBe(0);
});

test('Apollo viewer: keyboard controls act only on the focused canvas', async ({ page }) => {
  const { canvas, shot } = await openViewer(page, 'apollo-11');
  const initial = await shot();
  await page.getByRole('button', { name: 'Labels' }).focus();
  await page.keyboard.press('ArrowLeft');
  expect(Buffer.compare(await shot(), initial)).toBe(0);
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  const orbited = await shot();
  expect(Buffer.compare(orbited, initial)).not.toBe(0);
  await page.keyboard.press('+');
  const zoomed = await shot();
  expect(Buffer.compare(zoomed, orbited)).not.toBe(0);
  await page.keyboard.press('Home');
  expect(Buffer.compare(await shot(), initial)).toBe(0);
});

test('Apollo viewer: labels toggle; spin is opt-in', async ({ page }) => {
  await openViewer(page, 'apollo-11');
  await expect(page.getByRole('button', { name: 'Spin' })).toHaveAttribute('aria-pressed', 'false');
  const labels = page.getByRole('button', { name: 'Labels' });
  await expect(labels).toHaveAttribute('aria-pressed', 'true');
  await labels.click();
  await expect(labels).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Spin' }).click();
  await expect(page.getByRole('button', { name: 'Spin' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Front view' }).click();
  await expect(page.getByRole('button', { name: 'Spin' })).toHaveAttribute('aria-pressed', 'false');
});

for (const slug of MODEL_ROUTES) {
  test(`${slug}: loads on demand and supports presets, zoom and reset`, async ({ page }) => {
    const { shot } = await openViewer(page, slug);
    const hasLabels = slug === 'apollo-11';
    await expect(page.getByRole('button', { name: 'Labels' })).toHaveCount(hasLabels ? 1 : 0);
    const initial = await shot();
    for (const name of ['Front view', 'Side view', 'Top view', 'Zoom in']) {
      await page.getByRole('button', { name }).click();
      expect(Buffer.compare(await shot(), initial), name).not.toBe(0);
    }
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Reset view' }).click();
    expect(Buffer.compare(await shot(), initial)).toBe(0);
    await page.getByRole('button', { name: 'Spin' }).click();
    await expect(page.getByRole('button', { name: 'Spin' })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('article layout does not overflow at 390x844 and keeps image-only missions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of ['apollo-11', 'apollo-12']) {
    await page.goto(`/mission/${slug}`);
    await expect(page.locator('h1')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, slug).toBeLessThanOrEqual(0);
  }
  await expect(page.getByRole('button', { name: 'Inspect model' })).toHaveCount(0);
  await expect(page.locator('figure img')).toBeVisible();
});

test('a failed model request keeps the poster and article readable', async ({ page }) => {
  await page.route('**/models/**', route => route.abort());
  await page.goto('/mission/apollo-11');
  await launchViewer(page);
  await expect(page.getByText('Could not load model')).toBeVisible();
  await expect(page.locator('img[alt="3D view of Apollo 11 LM"]')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
});

test('reduced motion: article is static and viewer does not spin', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/mission/apollo-11');
  await expect(page.locator('section[data-reveal]').first()).toHaveCSS('opacity', '1');
  await launchViewer(page);
  await expect(page.locator('[data-model-state="ready"]')).toBeAttached({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Spin' })).toHaveAttribute('aria-pressed', 'false');
});

test('fonts: Syne headings, Plus Jakarta body, JetBrains Mono metadata', async ({ page }) => {
  await page.goto('/mission/apollo-11');
  await page.evaluate(() => document.fonts.ready);
  const families = await page.evaluate(() => ({
    h1: getComputedStyle(document.querySelector('h1')!).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    meta: getComputedStyle(document.querySelector('header p')!).fontFamily,
  }));
  expect(families.h1).toMatch(/Syne/);
  expect(families.body).toMatch(/Plus Jakarta Sans/);
  expect(families.meta).toMatch(/JetBrains Mono/);
});

test('homepage: chapter hash lands in its chapter and the page does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#insight');
  await page.waitForTimeout(800);
  await expect(page.locator('[data-active-chapter]')).toHaveAttribute('data-active-chapter', 'insight');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
