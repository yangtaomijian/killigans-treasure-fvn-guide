'use strict';
// Local previews only. Exercise the real discussion renderer through its existing
// read-only fixture hook, so the mount remains a real main-content sibling.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const prefix = process.env.TOC_LAYOUT_SITE || 'kt';
const site = {
  kt: { route: 'guide/redroot.html', breakpoint: 992, cap: 840, collapse: '#kt-desktop-toc-collapse', expand: '#kt-desktop-toc-expand' },
  pw: { route: 'collectibles/compendium.html', breakpoint: 1100, cap: 960, collapse: '.pw-panel-toggle-right', expand: '.pw-edge-toggle-right' },
  dw: { route: 'guide/choices.html', breakpoint: 1100, cap: 960, collapse: '#dw-page-toc-panel .dw-panel-toggle', expand: '.dw-edge-right' },
}[prefix];
assert(site, 'Unknown TOC_LAYOUT_SITE');
const base = process.env.GUIDE_BASE_URL;
assert(base && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Use a local bilingual preview');
const out = process.env.TOC_LAYOUT_OUTPUT;
if (out) fs.mkdirSync(out, { recursive: true });
const quick = process.env.TOC_LAYOUT_QUICK === '1';
const records = [];
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function fixture(context, loaded) {
  await context.addInitScript(({ prefix, loaded }) => {
    const transport = { async readDiscussion(request) {
      const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
      const comment = (n, parent = null) => ({ id: id(n), status: 'published', parentCommentId: parent === null ? null : id(parent),
        authorKind: 'guest', displayName: 'Local layout fixture',
        body: ('A visible read-only layout fixture checks wrapping, discussion alignment and replies. ').repeat(8) + 'long-unbroken-token-' + 'x'.repeat(180),
        guideVersion: request.guideVersion, pageHash: null, pinnedAt: null, createdAt: '2026-10-05T09:01:11.045Z' });
      const comments = loaded && request.section !== 'persistent' ? [
        { ...comment(1), replies: [comment(2, 1), comment(3, 1)] },
        { ...comment(4), replies: [] }, { ...comment(5), replies: [comment(6, 5)] },
      ] : [];
      return { ok: true, thread: { id: 'layout-fixture', status: 'open' },
        currentVersion: { guideVersion: request.guideVersion, comments, nextCursor: null }, earlierVersions: [] };
    } };
    Object.defineProperty(window, `__${prefix}DiscussionFixtureTransport`, { get: () => transport, set() {} });
  }, { prefix, loaded });
}
async function geometry(page, meta) {
  await frames(page);
  const g = await page.evaluate(prefix => {
    const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, right: r.right, bottom: r.bottom }; };
    const main = document.querySelector('main.content'), discussion = document.getElementById(`${prefix}-public-discussion`);
    const articleText = main.querySelector('h1') || main;
    const title = discussion.querySelector('h2');
    const footer = document.querySelector('footer.footer');
    return { main: rect(main), discussion: rect(discussion), footer: rect(footer),
      articleTextLeft: articleText.getBoundingClientRect().x, discussionTextLeft: title.getBoundingClientRect().x,
      sibling: main.parentElement === discussion.parentElement,
      after: Boolean(main.compareDocumentPosition(discussion) & Node.DOCUMENT_POSITION_FOLLOWING),
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      roots: document.querySelectorAll(`.${prefix}-discussion-comment`).length,
      replies: document.querySelectorAll(`.${prefix}-discussion-reply`).length,
      theme: document.body.classList.contains('quarto-dark') ? 'dark' : 'light' };
  }, prefix);
  assert.equal(g.theme, meta.theme, 'Actual rendered theme');
  assert(g.sibling && g.after, 'Discussion remains the following main-content sibling');
  assert(Math.abs(g.articleTextLeft - g.discussionTextLeft) <= 1, `Discussion text must align with article text: ${JSON.stringify(g)}`);
  assert(g.discussion.y >= g.main.bottom - 1, 'Discussion follows the article vertically');
  assert(g.footer.y >= g.discussion.bottom - 1, 'Footer follows the discussion');
  assert(g.main.width <= 961, 'Article retains 960px cap');
  assert(Math.abs(g.discussion.width - Math.min(site.cap, g.main.width)) <= 1, 'Discussion uses the available article width up to its existing cap');
  assert(g.discussion.right <= g.main.right + 1 && g.discussion.x >= g.main.x - 1, 'Discussion fits the article region');
  assert(g.documentWidth <= g.viewportWidth, 'No horizontal document overflow');
  assert.equal(g.roots, meta.loaded ? 3 : 0, 'Real rendered comment roots');
  assert.equal(g.replies, meta.loaded ? 3 : 0, 'Real rendered replies');
  records.push({ site: prefix, ...meta, ...g });
  return g;
}
(async () => {
  const engines = [['Edge', chromium, { executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' }],
    ['WebKit', webkit, process.env.WEBKIT_EXECUTABLE ? { executablePath: process.env.WEBKIT_EXECUTABLE } : {}]];
  for (const [engine, type, options] of quick ? engines.slice(0, 1) : engines) {
    const browser = await type.launch({ headless: true, ...options });
    try {
      for (const theme of quick ? ['light'] : ['light', 'dark']) for (const locale of quick ? [''] : ['', 'en/']) for (const loaded of quick ? [false] : [false, true]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 800 }, colorScheme: theme, reducedMotion: 'reduce' });
        await fixture(context, loaded);
        const writes = [], errors = [];
        await context.route('**/*', route => {
          const request = route.request();
          if (!['GET', 'HEAD'].includes(request.method())) { writes.push(request.url()); return route.abort(); }
          return new URL(request.url()).origin === new URL(base).origin ? route.continue() : route.abort();
        });
        const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
        await page.goto(`${base}/${locale}${site.route}`);
        await page.locator(`.${prefix}-discussion`).waitFor();
        await page.waitForFunction(prefix => document.querySelector(`.${prefix}-discussion-comments`)?.getAttribute('aria-busy') === 'false', prefix);
        for (const width of quick ? [1440] : [site.breakpoint, site.breakpoint + 32, 1280, 1440, 1920]) {
          await page.setViewportSize({ width, height: 800 });
          const meta = { engine, theme, locale: locale ? 'en' : 'zh-CN', loaded, width };
          await geometry(page, { ...meta, state: 'expanded' });
          await page.locator(site.collapse).focus(); await page.keyboard.press('Enter');
          await page.locator(site.expand).waitFor({ state: 'visible' }); await frames(page);
          assert(await page.locator(site.expand).evaluate(e => e === document.activeElement), 'Collapse transfers keyboard focus');
          assert.equal(await page.locator(site.expand).getAttribute('aria-expanded'), 'false');
          await geometry(page, { ...meta, state: 'collapsed' });
          await page.locator(`#${prefix}-public-discussion`).scrollIntoViewIfNeeded();
          await geometry(page, { ...meta, state: 'collapsed-discussion' });
          if (out && width === 1440) await page.screenshot({ path: path.join(out, `${prefix}-${engine}-${meta.locale}-${theme}-${loaded ? 'loaded' : 'empty'}.png`) });
          await page.locator(site.expand).focus(); await page.keyboard.press('Space');
          await page.locator(site.collapse).waitFor({ state: 'visible' }); await frames(page);
          assert(await page.locator(site.collapse).evaluate(e => e === document.activeElement), 'Expand restores keyboard focus');
          await geometry(page, { ...meta, state: 'expanded-again' });
        }
        const meta = { engine, theme, locale: locale ? 'en' : 'zh-CN', loaded, width: 1440 };
        await page.setViewportSize({ width: 1440, height: 800 });
        await page.locator(site.collapse).click(); await frames(page); await page.reload();
        await page.waitForFunction(prefix => document.querySelector(`.${prefix}-discussion-comments`)?.getAttribute('aria-busy') === 'false', prefix);
        await page.locator(site.expand).waitFor({ state: 'visible' });
        await geometry(page, { ...meta, state: 'collapsed-reloaded' });
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await geometry(page, { ...meta, state: 'collapsed-footer' });
        await page.locator(site.expand).click();
        await geometry(page, { ...meta, state: 'expanded-footer' });
        assert.deepEqual(writes, [], 'No write requests'); assert.deepEqual(errors, [], 'No JavaScript errors');
        await context.close();
        console.log(`${prefix} ${engine} ${theme} ${locale || 'zh-CN'} ${loaded ? 'loaded replies' : 'empty'}: PASS`);
      }
    } finally { await browser.close(); }
  }
  console.log(`PASS ${records.length} discussion/article/footer geometry assertions`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (out) fs.writeFileSync(path.join(out, `${prefix}-results.json`), JSON.stringify({ passed: !process.exitCode, records }, null, 2));
});
