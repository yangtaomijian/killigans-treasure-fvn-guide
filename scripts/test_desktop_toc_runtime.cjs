'use strict';
// Targeted public TOC checks. No application write requests are allowed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium, webkit } = require('playwright');
const base = process.env.KT_BASE_URL;
assert(base, 'KT_BASE_URL required');
const output = process.env.KT_QA_DIR || path.resolve(__dirname, '../test-results/desktop-toc');
fs.mkdirSync(output, { recursive: true });
const records = [], loaded = [], errors = [], writes = [];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const settle = page => page.waitForTimeout(160);
function state() {
  const panel = document.querySelector('#kt-page-toc-panel');
  const bar = panel.querySelector('.kt-desktop-toc-toolbar');
  let active = document.querySelector('#TOC a.active');
  while (active && !active.getClientRects().length)
    active = active.closest('ul')?.parentElement?.querySelector(':scope > a.nav-link');
  const r = panel.getBoundingClientRect(), b = bar.getBoundingClientRect(), a = active?.getBoundingClientRect();
  return { bodyY: scrollY, hash: location.hash, railX: r.x, railWidth: r.width,
    railTop: r.top, toolbarTop: b.top, toolbarHeight: b.height,
    toolbarBackground: getComputedStyle(bar).backgroundColor,
    panelBackground: getComputedStyle(panel).backgroundColor,
    tocY: panel.scrollTop, max: panel.scrollHeight - panel.clientHeight,
    safeTop: b.bottom + 24, safeBottom: r.bottom - 24, activeTop: a?.top, activeBottom: a?.bottom,
    current: document.querySelector('#TOC a.active')?.dataset.scrollTarget,
    visible: active?.dataset.scrollTarget, activeWeight: active && getComputedStyle(active).fontWeight,
    overflow: document.documentElement.scrollWidth - innerWidth };
}
function visible(s) {
  assert(s.activeTop >= s.safeTop - 2 || s.tocY <= 1, 'active link clears toolbar safe edge');
  assert(s.activeBottom <= s.safeBottom + 2 || s.max - s.tocY <= 1, 'minimal bottom-edge reveal');
}
function typeStyles() {
  const get = selector => {
    const e = document.querySelector(selector), s = getComputedStyle(e);
    return { family: s.fontFamily, size: s.fontSize, weight: s.fontWeight,
      line: s.lineHeight, padding: s.padding, whiteSpace: s.whiteSpace,
      wordBreak: s.wordBreak, overflowWrap: s.overflowWrap };
  };
  return { level2: get('#TOC a[data-kt-toc-level="2"]'), level3: get('#TOC a[data-kt-toc-level="3"]') };
}
function opaqueHeader() {
  const panel = document.querySelector('#kt-page-toc-panel'), bar = panel.querySelector('.kt-desktop-toc-toolbar');
  const r = panel.getBoundingClientRect(), b = bar.getBoundingClientRect();
  return [b.left + 2, (b.left + b.right) / 2, b.right - 2].every(x =>
    [2, 8, 13].every(y => { const e = document.elementFromPoint(x, r.top + y); return e === bar || bar.contains(e); }));
}
(async () => {
  const engines = [
    ['Edge', chromium, process.platform === 'darwin' ? { executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' } : {}],
    ['WebKit', webkit, process.env.WEBKIT_EXECUTABLE ? { executablePath: process.env.WEBKIT_EXECUTABLE } : {}]
  ];
  for (const [engine, type, options] of engines) {
    const browser = await type.launch({ headless: true, ...options });
    try {
      for (const locale of ['zh', 'en']) for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
        await context.route('**/*', route => {
          const req = route.request();
          if (!['GET', 'HEAD'].includes(req.method())) { writes.push(req.url()); return route.abort(); }
          return new URL(req.url()).origin === new URL(base).origin ? route.continue() : route.abort();
        });
        const page = await context.newPage(), pending = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('response', response => {
          const file = path.basename(new URL(response.url()).pathname);
          if (['kt-page-toc.js', 'kt-layout.css'].includes(file)) pending.push((async () => {
            const hash = sha(await response.body());
            assert.equal(hash, sha(fs.readFileSync(path.resolve(__dirname, '../assets', file))), 'actual loaded public asset bytes');
            loaded.push({ engine, locale, theme, file, sha256: hash });
          })());
        });
        await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}collectibles/equipment.html`);
        await page.evaluate(() => document.fonts.ready); await settle(page);
        assert.equal(await page.locator('#kt-ai-launcher,#kt-ai-panel').count(), 0, 'public page contains no AI entry or panel');
        assert.equal(await page.evaluate(() => document.body.classList.contains('quarto-dark')), theme === 'dark');
        const types = await page.evaluate(typeStyles);
        assert.equal(types.level2.size, '13.6px'); assert.equal(types.level2.weight, '400');
        assert(Math.abs(parseFloat(types.level2.line) - 19.04) < .00001); assert.equal(types.level3.size, '12.92px');
        assert.equal(types.level3.weight, '400'); assert(Math.abs(parseFloat(types.level3.line) - 18.088) < .00001);
        for (const t of Object.values(types)) {
          assert(t.family.includes('SF Pro Text')); assert(!t.family.includes('Segoe UI'));
          assert.equal(t.whiteSpace, 'normal'); assert.equal(t.wordBreak, 'normal'); assert.equal(t.overflowWrap, 'anywhere');
        }
        const initial = await page.evaluate(state);
        assert.equal(initial.railX, 0); assert.equal(initial.railWidth, 220);
        assert.equal(initial.toolbarHeight, 57.5); assert.equal(initial.overflow, 0);
        assert.equal(initial.toolbarBackground, initial.panelBackground);
        const branches = page.locator('#TOC .kt-toc-branch-toggle');
        assert(await branches.count() > 2);
        for (const b of await branches.all()) assert.equal(await b.getAttribute('aria-expanded'), 'true');
        const retainedTitles = await page.locator('#TOC a.nav-link').allTextContents();
        await page.locator('#kt-page-toc-panel').hover();
        for (const y of [0, 17, 64, 200, 400]) {
          await page.locator('#kt-page-toc-panel').evaluate((e, y) => e.scrollTop = y, y); await settle(page);
          assert(await page.evaluate(opaqueHeader), 'opaque sticky toolbar covers former top gap');
        }
        await page.locator('#kt-page-toc-panel').evaluate(e => e.scrollTop = 0);
        await page.screenshot({ path: path.join(output, `${engine}-${locale}-${theme}-desktop.png`) });
        const link = page.locator('#TOC a[data-scroll-target="#equipment-aris"]');
        const button = link.locator('xpath=..').locator(':scope > button');
        const before = await page.evaluate(state); await button.click();
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.evaluate(() => scrollY), before.bodyY); assert.equal(await page.evaluate(() => location.hash), before.hash);
        assert.equal(await branches.first().getAttribute('aria-expanded'), 'true', 'other branch remains independent');
        await page.evaluate(() => { const h = document.querySelector('#prime-attire h3'); scrollTo(0, scrollY + h.getBoundingClientRect().top - 180); });
        await page.mouse.move(800, 300); await page.mouse.wheel(0, 1); await settle(page);
        const folded = await page.evaluate(state);
        assert.equal(folded.current, '#prime-attire'); assert.equal(folded.visible, '#equipment-aris');
        assert.equal(folded.activeWeight, '650'); assert.equal(await button.getAttribute('aria-expanded'), 'false'); visible(folded);
        await button.focus(); await page.keyboard.press('Enter'); assert.equal(await button.getAttribute('aria-expanded'), 'true');
        await link.click(); await settle(page); assert.equal(decodeURIComponent(await page.evaluate(() => location.hash)), '#equipment-aris');
        assert.equal(await link.evaluate(e => getComputedStyle(e).fontWeight), '700');
        await page.mouse.move(800, 300); await page.locator('#kt-page-toc-panel').hover();
        await page.locator('#kt-page-toc-panel').evaluate(e => e.scrollTop = 0);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await settle(page);
        assert.equal(await page.locator('#kt-page-toc-panel').evaluate(e => e.scrollTop), 0, 'manual browsing pause survives article scroll');
        await page.mouse.move(800, 300); await page.mouse.wheel(0, -1); await settle(page);
        const resumed = await page.evaluate(state); assert(resumed.tocY > 0); visible(resumed);
        await page.locator('#kt-desktop-toc-collapse').click(); await page.locator('#kt-desktop-toc-expand').click(); await settle(page);
        await page.locator('#kt-page-toc-panel').evaluate(e => e.scrollTop = 0); await settle(page);
        visible(await page.evaluate(state));
        await page.mouse.move(800, 300); await page.locator('#kt-page-toc-panel').hover();
        await page.mouse.wheel(0, -180); await settle(page);
        const manualY = await page.locator('#kt-page-toc-panel').evaluate(e => e.scrollTop);
        await page.evaluate(() => dispatchEvent(new Event('quarto-sectionChanged'))); await settle(page);
        assert.equal(await page.locator('#kt-page-toc-panel').evaluate(e => e.scrollTop), manualY, 'fresh TOC entry still pauses');
        assert.deepEqual(await page.locator('#TOC a.nav-link').allTextContents(), retainedTitles, 'full titles preserved');
        await page.screenshot({ path: path.join(output, `${engine}-${locale}-${theme}-footer.png`) });
        records.push({ engine, locale, theme, initial, types, folded, resumed });
        for (const width of [1920, 992]) {
          await page.setViewportSize({ width, height: 900 }); await settle(page);
          const s = await page.evaluate(state); assert.equal(s.railX, 0); assert.equal(s.railWidth, 220); assert.equal(s.overflow, 0);
        }
        for (const width of [991, 390]) {
          await page.setViewportSize({ width, height: 900 }); await settle(page);
          // Native narrow headers may be unpinned at the desktop footer position.
          await page.evaluate(() => scrollTo(0, 0)); await settle(page);
          assert.equal(await page.locator('#TOC .kt-toc-branch-toggle:not([hidden])').count(), 0);
          await page.locator('#kt-page-toc-trigger').click();
          assert.equal(await page.locator('#kt-page-toc-trigger').getAttribute('aria-expanded'), 'true');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#kt-page-toc-trigger').getAttribute('aria-expanded'), 'false');
          assert.equal(await page.locator('#kt-page-toc-panel').evaluate(e => e.inert), false);
        }
        await Promise.all(pending); assert.equal(pending.length, 2);
        await context.close();
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  const report = { status: 'PASS_PUBLIC_DESKTOP_TOC', base, records, loaded, errors, writes };
  fs.writeFileSync(path.join(output, 'desktop-toc.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS ${records.length} bilingual/theme/engine contexts; ${loaded.length} browser-loaded asset hashes; desktop and mobile boundaries`);
})().catch(e => { console.error(e); process.exitCode = 1; });
