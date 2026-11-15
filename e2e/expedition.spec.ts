import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadMissionLessons } from '../lib/lesson.ts';

const LESSONS = loadMissionLessons();

test('expedition renders chapters and navigates to a mission record', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/NASA Mission Gallery/);
  const link = page.locator('a[href^="/mission/"]').first();
  await expect(link).toBeAttached();
  const href = await link.getAttribute('href');
  await page.goto(href!);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the expedition' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /structured record/i }).first()).toBeAttached();
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

test('homepage has expanded paragraphs, timeline, quiz and model inspection', async ({ page }) => {
  await page.goto('/#apollo-11-lesson');
  const lesson = page.locator('#apollo-11-lesson');
  await expect(page.locator('#apollo-11 h3').filter({ hasText: 'Could people land and return?' })).toBeAttached();
  await expect(lesson.getByText('Funding Agency')).toHaveCount(0);
  await expect(lesson.getByText('Complete captured page text')).toHaveCount(0);
  await expect(lesson.getByLabel('Apollo 11 LM timeline')).toContainText('Rejoining Michael Collins');
  await expect(lesson.locator('section[aria-labelledby="apollo-11-craft"] > p')).toHaveCount(2);
  await expect(lesson.locator('section[aria-labelledby="apollo-11-learned"] > p')).toHaveCount(2);
  await lesson.getByRole('button', { name: 'Explore the 3D spacecraft' }).click();
  await expect(lesson.getByRole('button', { name: 'Close inspection' })).toBeVisible();
  await expect(lesson.locator('canvas')).toBeVisible();
  await lesson.getByRole('button', { name: 'Close inspection' }).click();
  await lesson.getByRole('heading', { name: 'A two-part Moon elevator' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/expanded-lesson-desktop.png' });
  await expect(lesson.getByRole('link', { name: 'Explore the full mission' })).toHaveAttribute('href', '/mission/apollo-11');
});

test('homepage lesson remains readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/#apollo-11-lesson');
  const lesson = page.locator('#apollo-11-lesson');
  await expect(page.getByRole('heading', { name: 'Could people land and return?' })).toBeAttached();
  await expect(lesson.locator('noscript ol li').first()).toBeAttached();
  await lesson.locator('noscript details summary').first().click();
  await expect(lesson.locator('noscript details[open] p').first()).toBeVisible();
  await context.close();
});

test('image mission lesson stays readable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#apollo-12-lesson');
  const lesson = page.locator('#apollo-12-lesson');
  await expect(lesson.getByRole('heading', { name: 'Intrepid’s clever return trip' })).toBeVisible();
  await expect(lesson.locator('figure img')).toBeVisible();
  await lesson.getByRole('heading', { name: 'Intrepid’s clever return trip' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/expanded-lesson-mobile.png', fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

async function openMission(page: Page, slug: string) {
  await page.goto(`/#${slug}-lesson`);
  const quiz = page.locator(`#${slug}-lesson`).getByRole('group', { name: /mission control$/ });
  await quiz.scrollIntoViewIfNeeded();
  await expect(quiz.getByRole('button', { name: 'Start mission' })).toBeVisible();
  return quiz;
}

// The button can be clicked before hydration; retry until the first decision appears.
async function startMission(quiz: Locator) {
  await expect(async () => {
    await quiz.getByRole('button', { name: 'Start mission' }).click({ timeout: 1500 });
    await expect(quiz.getByRole('heading', { name: /Decision 1/ })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20000 });
}

async function decide(quiz: Locator, choice: number | RegExp) {
  const choices = quiz.getByRole('group', { name: 'Choose an answer' }).getByRole('button');
  await (typeof choice === 'number' ? choices.nth(choice) : choices.filter({ hasText: choice })).click();
  await quiz.getByRole('button', { name: 'Commit decision' }).click();
}

test('mission control scores decisions and replays', async ({ page }) => {
  const quiz = await openMission(page, 'apollo-11');
  await expect(quiz.getByText('SCORE 0 / 300')).toBeVisible();
  await expect(quiz.getByText('Connect the mission’s challenge, spacecraft, and discoveries. Make three decisions using the field notes above.')).toBeVisible();
  await expect(quiz.getByText('100 points per correct decision. No timer.')).toBeVisible();
  await page.screenshot({ path: 'test-results/mission-briefing.png' });
  await startMission(quiz);
  await expect(quiz.getByRole('heading', { name: 'Decision 1 · Objective' })).toBeFocused();
  await expect(quiz.getByRole('listitem').filter({ hasText: 'Objective' })).toHaveAttribute('aria-current', 'step');
  await expect(quiz.getByRole('button', { name: 'Commit decision' })).toBeDisabled();
  await decide(quiz, /Build a permanent Moon base/);
  await expect(quiz.getByRole('status')).toContainText('Course correction · +0 points');
  await expect(quiz.getByRole('status').getByRole('link', { name: 'NASA source' })).toHaveAttribute('href', LESSONS[0].quiz[0].source);
  await expect(quiz.getByRole('button', { name: /Build a permanent Moon base/ })).toBeDisabled();
  await expect(quiz.getByRole('button', { name: 'Commit decision' })).toHaveCount(0);
  await expect(quiz.getByText('SCORE 0 / 300')).toBeVisible();
  await page.screenshot({ path: 'test-results/mission-feedback.png' });
  await quiz.getByRole('button', { name: 'Next stage' }).click();
  await expect(quiz.getByRole('heading', { name: 'Decision 2 · Spacecraft' })).toBeFocused();
  await decide(quiz, /lower part could stay as a launchpad/i);
  await expect(quiz.getByRole('status')).toContainText('Decision confirmed · +100 points');
  await quiz.getByRole('button', { name: 'Next stage' }).click();
  await decide(quiz, /Keep gathering measurements/i);
  await expect(quiz.getByText('SCORE 200 / 300')).toBeVisible();
  await quiz.getByRole('button', { name: 'View debrief' }).click();
  await expect(quiz.getByRole('heading', { name: 'Mission debrief' })).toBeFocused();
  await expect(quiz.getByText('200 points')).toBeVisible();
  await expect(quiz.getByText('2 / 3 correct decisions')).toBeVisible();
  await expect(quiz.getByText('Mission explorer')).toBeVisible();
  await expect(quiz.getByText(LESSONS[0].quiz[0].feedback)).toBeVisible();
  await page.screenshot({ path: 'test-results/mission-debrief.png' });
  await quiz.getByRole('button', { name: 'Replay mission' }).click();
  await expect(quiz.getByRole('heading', { name: 'Mission briefing' })).toBeFocused();
  await expect(quiz.getByText('SCORE 0 / 300')).toBeVisible();
  await startMission(quiz);
  const first = quiz.getByRole('group', { name: 'Choose an answer' }).getByRole('button').filter({ hasText: /Land astronauts and bring them back/i });
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(quiz.getByText('SCORE 0 / 300')).toBeVisible();
  await expect(quiz.getByRole('status')).toHaveText('');
});

for (const run of [
  { name: 'three correct decisions', offset: 0, points: 300, rank: 'Mission specialist' },
  { name: 'three wrong decisions', offset: 1, points: 0, rank: 'Cadet in training' },
]) {
  test(`mission control ranks ${run.name}`, async ({ page }) => {
    const quiz = await openMission(page, 'apollo-11');
    await startMission(quiz);
    for (const [i, question] of LESSONS[0].quiz.entries()) {
      await decide(quiz, (question.correct + run.offset) % question.choices.length);
      await quiz.getByRole('button', { name: i === LESSONS[0].quiz.length - 1 ? 'View debrief' : 'Next stage' }).click();
    }
    await expect(quiz.getByText(`${run.points} points`)).toBeVisible();
    await expect(quiz.getByText(run.rank)).toBeVisible();
  });
}

test('mission control works for image missions', async ({ page }) => {
  const quiz = await openMission(page, 'apollo-12');
  await startMission(quiz);
  await decide(quiz, 0);
  await expect(quiz.getByRole('status')).toContainText(/Decision confirmed|Course correction/);
  await expect(quiz.getByRole('status').getByRole('link', { name: 'NASA source' })).toHaveAttribute('href', LESSONS[1].quiz[0].source);
  await expect(quiz.locator('canvas')).toHaveCount(0);
});

test('reading navigation reaches its field guide section', async ({ page }) => {
  await page.goto('/#apollo-11-lesson');
  const lesson = page.locator('#apollo-11-lesson');
  const guide = lesson.getByRole('navigation', { name: 'Apollo 11 LM field guide' });
  for (const [link, id, title] of [
    ['Inspect the craft', 'apollo-11-craft', LESSONS[0].headings.craft],
    ['Take command', 'apollo-11-quiz', 'Your mission challenge'],
  ]) {
    await guide.getByRole('link', { name: link }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    const heading = lesson.getByRole('heading', { name: title, exact: true });
    await expect(heading).toBeFocused();
    await page.waitForTimeout(400);
    expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(80);
  }
  const milestones = LESSONS[0].milestones;
  await expect(lesson.getByLabel('Apollo 11 LM timeline')).toContainText('Rejoining Michael Collins');
  await expect(lesson.getByLabel('Apollo 11 LM timeline').getByRole('link', { name: 'Read the NASA reference' }).last()).toHaveAttribute('href', milestones[milestones.length - 1].source);
  const calm = await page.context().browser()!.newContext({ reducedMotion: 'reduce' });
  const still = await calm.newPage();
  await still.goto('/#apollo-11-lesson');
  await expect(still.locator('[data-cinematic]')).toHaveCount(0);
  for (const paragraph of await still.locator('section[aria-labelledby="apollo-11-craft"] > p').all()) await expect(paragraph).toBeVisible();
  await expect(still.locator('#apollo-11-lesson [data-reading-reveal]').first()).toHaveCSS('opacity', '1');
  await calm.close();
});

for (const slug of ['apollo-11', 'insight', 'pioneer-10']) {
  test(`inspection lighting changes the rendered model: ${slug}`, async ({ page }) => {
    const { canvas, shot } = await openViewer(page, slug);
    const natural = page.getByRole('button', { name: 'Natural light' });
    const raking = page.getByRole('button', { name: 'Raking light' });
    await expect(natural).toHaveAttribute('aria-pressed', 'true');
    const initial = await shot();
    await raking.click();
    await expect(raking).toHaveAttribute('aria-pressed', 'true');
    await expect(natural).toHaveAttribute('aria-pressed', 'false');
    expect(Buffer.compare(await shot(), initial)).not.toBe(0);
    await page.getByRole('button', { name: 'Reset view' }).click();
    await expect(natural).toHaveAttribute('aria-pressed', 'true');
    expect(Buffer.compare(await shot(), initial)).toBe(0);
    await raking.click();
    await canvas.focus();
    await page.keyboard.press('Home');
    await expect(natural).toHaveAttribute('aria-pressed', 'true');
    expect(Buffer.compare(await shot(), initial)).toBe(0);
  });
}

const CONTROL_NAMES = ['Labels', 'Spin', 'Natural light', 'Raking light', 'Reset view', 'Front view', 'Side view', 'Top view', 'Zoom in', 'Zoom out'];

test('inspection expansion preserves exploration', async ({ page }) => {
  const models: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.glb')) models.push(request.url()); });
  const { canvas, shot } = await openViewer(page, 'apollo-11');
  await page.getByRole('button', { name: 'Top view' }).click();
  // Compare the canvas interior: re-layout can shift the outermost row by a subpixel.
  const interior = async () => {
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
    const box = (await canvas.boundingBox())!;
    return page.screenshot({ animations: 'disabled', clip: { x: Math.ceil(box.x), y: Math.ceil(box.y), width: Math.floor(box.width) - 2, height: Math.floor(box.height) - 6 } });
  };
  const top = await interior();
  const originalBox = (await canvas.boundingBox())!;
  const expand = page.getByRole('button', { name: 'Expand viewer' });
  const stage = page.locator(`[id="${await expand.getAttribute('aria-controls')}"]`);
  const collapsedHeight = (await stage.boundingBox())!.height;
  const requests = models.length;
  await expand.click();
  await expect(page.getByRole('button', { name: 'Collapse viewer' })).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await stage.boundingBox())!.height).toBeGreaterThan(collapsedHeight);
  await page.getByRole('button', { name: 'Collapse viewer' }).click();
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(originalBox.height);
  expect(Buffer.compare(await interior(), top)).toBe(0);
  expect(models.length).toBe(requests);
});

test('inspection expansion keeps controls below the canvas on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { canvas } = await openViewer(page, 'apollo-11');
  const canvasBox = (await canvas.boundingBox())!;
  const boxes = [];
  for (const name of CONTROL_NAMES) {
    const button = page.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    boxes.push((await button.boundingBox())!);
  }
  const canvasNow = (await canvas.boundingBox())!;
  expect(canvasNow.y + canvasNow.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);
  for (const [i, box] of boxes.entries()) {
    expect(box.width, CONTROL_NAMES[i]).toBeGreaterThanOrEqual(44);
    expect(box.height, CONTROL_NAMES[i]).toBeGreaterThanOrEqual(44);
  }
  const canvasTop = await canvas.evaluate(element => element.getBoundingClientRect().bottom + scrollY);
  for (const [i, name] of CONTROL_NAMES.entries()) {
    const bottom = await page.getByRole('button', { name, exact: true }).evaluate(element => element.getBoundingClientRect().top + scrollY);
    expect(bottom, `${name} sits below the canvas`).toBeGreaterThanOrEqual(canvasTop - 1);
    for (let j = i + 1; j < CONTROL_NAMES.length; j++) {
      const other = await page.getByRole('button', { name: CONTROL_NAMES[j], exact: true }).evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; });
      const self = await page.getByRole('button', { name, exact: true }).evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; });
      const overlap = self.x < other.x + other.width && other.x < self.x + self.width && self.y < other.y + other.height && other.y < self.y + self.height;
      expect(overlap, `${name} overlaps ${CONTROL_NAMES[j]}`).toBe(false);
    }
  }
  await page.getByRole('button', { name: 'Expand viewer' }).click();
  await expect(page.getByRole('button', { name: 'Collapse viewer' })).toBeVisible();
});

for (const scenario of [
  { name: 'desktop', width: 1440, height: 900, reducedMotion: false, javaScriptEnabled: true },
  { name: 'mobile', width: 390, height: 844, reducedMotion: false, javaScriptEnabled: true },
  { name: 'short viewport', width: 844, height: 390, reducedMotion: false, javaScriptEnabled: true },
  { name: 'reduced motion', width: 390, height: 844, reducedMotion: true, javaScriptEnabled: true },
  { name: 'without JavaScript', width: 390, height: 844, reducedMotion: false, javaScriptEnabled: false },
]) {
  test(`homepage expanded copy stays readable: ${scenario.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      javaScriptEnabled: scenario.javaScriptEnabled,
      reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    // Allow the existing scroll enhancement to measure the loaded fonts.
    if (scenario.javaScriptEnabled) await page.waitForTimeout(500);
    const chapters = page.locator('[data-chapter]');
    await expect(chapters).toHaveCount(13);
    if (scenario.name === 'desktop' || scenario.name === 'mobile') {
      await expect(page.locator('[data-hero-item]').last()).toHaveCSS('opacity', '1');
      await page.locator('main > header').screenshot({ path: `test-results/expanded-hero-${scenario.name}.png` });
    }
    for (const chapter of await chapters.all()) {
      const slug = await chapter.getAttribute('id');
      for (const section of ['craft', 'learned']) {
        const paragraphs = chapter.locator(`section[aria-labelledby="${slug}-${section}"] > p`);
        await expect(paragraphs).toHaveCount(2);
        for (const paragraph of await paragraphs.all()) {
          const dimensions = await paragraph.evaluate(element => ({
            width: element.clientWidth, height: element.clientHeight,
            scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
          }));
          expect(dimensions.scrollWidth, `${slug} ${section} width`).toBeLessThanOrEqual(dimensions.width + 1);
          expect(dimensions.scrollHeight, `${slug} ${section} height`).toBeLessThanOrEqual(dimensions.height + 1);
          await expect(paragraph).toBeVisible();
        }
      }
      const panel = chapter.locator('[data-beat="reading"]');
      const scene = chapter.locator('[data-story-scene]');
      if (await scene.getAttribute('data-cinematic') !== null) {
        const fits = await panel.evaluate(element => {
          const beat = element.parentElement!;
          const style = getComputedStyle(beat);
          return element.clientHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) <= beat.clientHeight + 1;
        });
        expect(fits, `${slug}: cinematic text must fit inside stage padding`).toBe(true);
      } else {
        await expect(panel).toBeVisible();
      }
    }
    if (scenario.reducedMotion || !scenario.javaScriptEnabled || scenario.height < 400) {
      await expect(page.locator('[data-cinematic]')).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const heading = page.locator('#apollo-11-craft');
    await heading.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const headingBox = await heading.boundingBox();
    expect(headingBox!.y).toBeGreaterThanOrEqual(80);
    await expect(page.getByRole('link', { name: 'NASA Gallery home' })).toBeVisible();
    await page.screenshot({ path: `test-results/expanded-${scenario.name.replaceAll(' ', '-')}.png` });
    await context.close();
  });
}

const tourSection = (page: Page) => page.getByRole('region', { name: 'Guided model tour' });

test('guided tour: starts only on request, pages by visitor, and never auto-advances', async ({ page }) => {
  const glb: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.glb')) glb.push(request.url()); });
  const { canvas, shot } = await openViewer(page, 'apollo-11');
  const tour = tourSection(page);
  const start = tour.getByRole('button', { name: 'Take a tour' });
  await expect(start).toBeEnabled();
  await expect(tour.getByRole('heading')).toHaveCount(0);
  const natural = await shot();
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(tour.getByRole('heading', { name: 'Front profile' })).toBeFocused();
  await expect(tour).toContainText('1 / 3');
  const milestoneSource = tour.getByRole('link', { name: /NASA reference/ });
  await expect(milestoneSource).toHaveAttribute('target', '_blank');
  await expect(milestoneSource).toHaveAttribute('href', /nasa\.gov/);
  await expect(tour.getByRole('button', { name: 'Previous stop' })).toBeDisabled();
  const front = await shot();
  expect(Buffer.compare(front, natural)).not.toBe(0);
  await tour.getByRole('button', { name: 'Next stop' }).click();
  await expect(tour.getByRole('heading', { name: 'Side profile' })).toBeFocused();
  const side = await shot();
  expect(Buffer.compare(side, front)).not.toBe(0);
  await tour.getByRole('button', { name: 'Next stop' }).click();
  await expect(tour.getByRole('heading', { name: 'Overhead view' })).toBeFocused();
  await expect(tour.getByRole('button', { name: 'Next stop' })).toHaveCount(0);
  await tour.getByRole('button', { name: 'Previous stop' }).click();
  await tour.getByRole('button', { name: 'Previous stop' }).click();
  await expect(tour.getByRole('heading', { name: 'Front profile' })).toBeVisible();
  expect(Buffer.compare(await shot(), front)).toBe(0);
  await page.waitForTimeout(3000);
  await expect(tour).toContainText('1 / 3');
  // Tour sits below the stage and never overlays the canvas.
  const box = (await canvas.boundingBox())!;
  expect((await tour.boundingBox())!.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
  await tour.getByRole('button', { name: 'Exit tour' }).click();
  await expect(start).toBeFocused();
  expect(glb.length).toBe(1);
});

for (const slug of MODEL_ROUTES) {
  test(`guided tour: ${slug} visits three stops and restarts at the first`, async ({ page }) => {
    await openViewer(page, slug);
    const tour = tourSection(page);
    await tour.getByRole('button', { name: 'Take a tour' }).click();
    await expect(tour).toContainText('1 / 3');
    await tour.getByRole('button', { name: 'Next stop' }).click();
    await tour.getByRole('button', { name: 'Next stop' }).click();
    await expect(tour).toContainText('3 / 3');
    await tour.getByRole('button', { name: 'Finish tour' }).click();
    await expect(tour.getByRole('button', { name: 'Take a tour' })).toBeFocused();
    await tour.getByRole('button', { name: 'Take a tour' }).click();
    await expect(tour).toContainText('1 / 3');
  });
}

test('guided tour: manual input, commands and Escape end the tour; Reset matches Natural', async ({ page }) => {
  const { canvas } = await openViewer(page, 'apollo-11');
  // Focus moves scroll the page by sub-pixels; compare the canvas interior only.
  const shot = async () => {
    await page.waitForTimeout(450);
    await canvas.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo({ top: Math.round(window.scrollY), behavior: 'instant' }));
    const b = (await canvas.boundingBox())!;
    return page.screenshot({ clip: { x: b.x + 2, y: b.y + 2, width: b.width - 4, height: b.height - 4 }, animations: 'disabled' });
  };
  const tour = tourSection(page);
  const start = tour.getByRole('button', { name: 'Take a tour' });
  const natural = await shot();
  await start.click();
  const front = await shot();
  await tour.getByRole('button', { name: 'Exit tour' }).click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await start.click();
  await page.waitForTimeout(100);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  await expect(start).toBeVisible();
  // An interrupted move must not complete later and snap to the front pose.
  await page.waitForTimeout(1500);
  expect(Buffer.compare(await shot(), front)).not.toBe(0);
  for (const name of ['Raking light', 'Top view', 'Spin']) {
    await start.click();
    await expect(tour).toContainText('1 / 3');
    await page.getByRole('button', { name }).click();
    await expect(start).toBeVisible();
    if (name === 'Spin') await page.getByRole('button', { name: 'Spin' }).click();
  }
  await start.click();
  await tour.getByRole('button', { name: 'Next stop' }).click();
  await page.keyboard.press('Escape');
  await expect(start).toBeFocused();
  await start.click();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(start).toBeVisible();
  expect(Buffer.compare(await shot(), natural)).toBe(0);
});

test('guided tour: rapid paging lands on the last stop and expanding exits cleanly without reloading the model', async ({ page }) => {
  const glb: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.glb')) glb.push(request.url()); });
  await openViewer(page, 'insight');
  const tour = tourSection(page);
  await tour.getByRole('button', { name: 'Take a tour' }).click();
  await tour.getByRole('button', { name: 'Next stop' }).click();
  await tour.getByRole('button', { name: 'Previous stop' }).click();
  await tour.getByRole('button', { name: 'Next stop' }).click();
  await expect(tour).toContainText('2 / 3');
  await page.getByRole('button', { name: 'Expand viewer' }).click();
  await expect(tour.getByRole('button', { name: 'Take a tour' })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse viewer' }).click();
  expect(glb.length).toBe(1);
});

test('guided tour: homepage lesson restarts after close and mobile layouts stay reachable', async ({ page }) => {
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto('/#apollo-11-lesson');
    const lesson = page.locator('#apollo-11-lesson');
    await expect(async () => {
      const explore = lesson.getByRole('button', { name: 'Explore the 3D spacecraft' });
      if (await explore.count()) await explore.click({ timeout: 2000 });
      await expect(lesson.locator('canvas')).toBeAttached({ timeout: 2000 });
    }).toPass({ timeout: 30000 });
    await lesson.locator('canvas').scrollIntoViewIfNeeded();
    const tour = tourSection(page);
    await expect(tour.getByRole('button', { name: 'Take a tour' })).toBeEnabled({ timeout: 60000 });
    await tour.getByRole('button', { name: 'Take a tour' }).click();
    for (const name of ['Previous stop', 'Next stop', 'Exit tour']) {
      const button = tour.getByRole('button', { name });
      await button.scrollIntoViewIfNeeded();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await expect(lesson.locator('canvas')).toHaveCount(1);
    await lesson.getByRole('button', { name: 'Close inspection' }).click();
    await lesson.getByRole('button', { name: 'Explore the 3D spacecraft' }).click();
    await expect(tour.getByRole('button', { name: 'Take a tour' })).toBeVisible();
    await expect(tour.getByRole('heading')).toHaveCount(0);
  }
});

test('guided tour: reduced motion applies each stop immediately; failed loads never offer a tour', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { shot } = await openViewer(page, 'apollo-11');
  const tour = tourSection(page);
  await tour.getByRole('button', { name: 'Take a tour' }).click();
  const first = await shot();
  await tour.getByRole('button', { name: 'Next stop' }).click();
  const second = await shot();
  expect(Buffer.compare(first, second)).not.toBe(0);
  expect(Buffer.compare(await shot(), second)).toBe(0);
  const failed = await page.context().newPage();
  await failed.route('**/models/**', route => route.abort());
  await failed.goto('/mission/apollo-11');
  await launchViewer(failed);
  await expect(failed.getByText('Could not load model')).toBeVisible();
  await expect(failed.getByRole('button', { name: 'Take a tour' })).toHaveCount(0);
});

const APOLLO = LESSONS[0].milestones;

test('journey timeline: every Apollo milestone is visible without clicking, with its source', async ({ page }) => {
  await page.goto('/#apollo-11-lesson');
  const timeline = page.locator('#apollo-11-lesson').getByLabel('Apollo 11 LM timeline');
  await expect(timeline.getByRole('listitem')).toHaveCount(APOLLO.length);
  await expect(timeline.getByRole('button')).toHaveCount(0);
  for (const [index, moment] of APOLLO.entries()) {
    const item = timeline.getByRole('listitem').nth(index);
    await expect(item.getByRole('heading', { name: moment.title })).toBeAttached();
    await expect(item).toContainText(moment.explanation.slice(0, 40));
    await expect(item.getByRole('link', { name: 'Read the NASA reference' })).toHaveAttribute('href', moment.source);
  }
});

test('journey timeline: mobile has no horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/#apollo-11-lesson');
  await expect(page.locator('#apollo-11-lesson').getByLabel('Apollo 11 LM timeline')).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await context.close();
});
