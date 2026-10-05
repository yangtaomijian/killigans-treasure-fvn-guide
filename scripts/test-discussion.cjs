'use strict';
// Run against a completed local bilingual preview. No remote writes or browser accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const prefix = ['pw', 'dw', 'kt'].find(name => fs.existsSync(path.join(__dirname, `../assets/${name}-discussion-ui.html`)));
const base = process.env.GUIDE_BASE_URL;
assert(base && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'Use a local bilingual preview');
const { route, current, historical } = {
  pw: { route: 'guide/route-overview.html', current: 'b0.85', historical: 'b0.7' },
  dw: { route: 'guide/choices.html', current: 'Public 14.6', historical: 'Public 14.5' },
  kt: { route: 'guide/redroot.html', current: 'Public v0.57a', historical: 'Public v0.56' },
}[prefix];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const selectors = { root: `.${prefix}-discussion-comment`, reply: `.${prefix}-discussion-reply`,
  empty: `.${prefix}-discussion-empty`, more: `.${prefix}-discussion-comments + button`,
  versions: `.${prefix}-discussion-version-buttons button` };

async function open(browser, locale, width, scenario) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  if (scenario) await page.addInitScript(({ prefix, scenario, current, historical }) => {
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const comment = (n, status = 'published', parent = null, version = current, maintainer = false) => ({
      id: id(n), status, parentCommentId: parent === null ? null : id(parent),
      authorKind: maintainer ? 'maintainer' : 'guest', displayName: status === 'published' ? maintainer ? 'Carambi' : n === 1 ? 'Z3r0' : 'Reader' : null,
      body: status === 'published' ? n === 1 ? 'Original player comment' : maintainer ? 'Exact replacement — thanks!' : 'Normal published content' : null,
      guideVersion: version, pageHash: null, pinnedAt: null, createdAt: '2026-10-05T09:01:11.045Z',
    });
    window.discussionReads = []; window.discussionFailNext = false; window.discussionRaw = [];
    const transport = { async readDiscussion(request) {
      window.discussionReads.push({ ...request });
      if (window.discussionFailNext) { window.discussionFailNext = false; throw Error('Fixture read failed'); }
      const version = request.guideVersion;
      const root = (n, status, replies = []) => ({ ...comment(n, status, null, version), replies });
      const reply = (n, status, parent, maintainer = false) => comment(n, status, parent, current, maintainer);
      let roots, nextCursor = null;
      if (scenario === 'tree') roots = [
        root(1, 'published', [reply(2, 'deleted', 1), reply(3, 'published', 1, true)]),
        root(4, 'hidden', [reply(5, 'hidden', 4), reply(6, 'deleted', 4), reply(7, 'published', 4)]),
        root(8, 'deleted'), root(9, 'deleted', [reply(10, 'deleted', 9)]),
        root(11, 'deleted', [reply(12, 'published', 11), reply(13, 'hidden', 11), reply(14, 'deleted', 11)]),
        root(15, 'published', [reply(16, 'published', 15)]),
      ];
      else if (request.cursor === null) { roots = [root(20, 'deleted')]; nextCursor = 'raw-c1'; }
      else if (request.cursor === 'raw-c1') {
        roots = [root(20, 'deleted'), root(21, 'deleted', [reply(23, 'deleted', 21)])];
        nextCursor = scenario === 'all-deleted' ? null : 'raw-c2';
      } else if (request.cursor === 'raw-c2') roots = [root(21, 'deleted'), root(22, 'published', [reply(24, 'deleted', 22), reply(25, 'published', 22, true)])];
      else throw Error('Unexpected cursor');
      window.discussionRaw.push(roots);
      return { ok: true, thread: { id: 'fixture-thread', status: 'open' },
        currentVersion: { guideVersion: version, comments: roots, nextCursor },
        earlierVersions: [{ guideVersion: historical, commentCount: 999 }] };
    } };
    Object.defineProperty(window, `__${prefix}DiscussionFixtureTransport`, { get: () => transport, set() {} });
  }, { prefix, scenario, current, historical });
  await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}${route}`);
  await page.locator(`.${prefix}-discussion`).waitFor();
  await page.waitForFunction(prefix => document.querySelector(`.${prefix}-discussion-comments`)?.getAttribute('aria-busy') === 'false', prefix);
  return { page };
}
const ids = locator => locator.evaluateAll(nodes => nodes.map(node => node.dataset.commentId));
async function settled(page) {
  await page.waitForFunction(prefix => document.querySelector(`.${prefix}-discussion-comments`).getAttribute('aria-busy') === 'false', prefix);
}
async function run(name, type, options) {
  const browser = await type.launch({ headless: true, ...options });
  let checks = 0;
  try {
    for (const locale of ['zh-CN', 'en']) for (const width of [390, 1440]) {
      const hiddenText = locale === 'en' ? 'This comment was hidden by the maintainer.' : '此评论已由维护者隐藏。';
      const deletedText = locale === 'en' ? 'This comment was deleted.' : '此评论已删除。';
      const countText = n => locale === 'en' ? `${n} ${n === 1 ? 'comment' : 'comments'}` : `${n} 条评论`;
      let { page } = await open(browser, locale, width, 'tree');
      assert.deepEqual(await ids(page.locator(selectors.root)), [1,4,11,15].map(id));
      assert.deepEqual(await ids(page.locator(selectors.reply)), [3,5,7,12,13,16].map(id));
      assert.equal(await page.locator(`.${prefix}-discussion-tombstone`).filter({ hasText: deletedText }).count(), 1);
      assert.equal(await page.locator(`.${prefix}-discussion-tombstone`).filter({ hasText: hiddenText }).count(), 3);
      const replacement = page.locator(`#${prefix}-comment-${id(1)}`);
      assert.equal(await replacement.locator(selectors.reply).count(), 1);
      assert((await replacement.innerText()).includes('Z3r0'));
      assert((await replacement.innerText()).includes('Carambi'));
      assert((await replacement.innerText()).includes(locale === 'en' ? 'Maintainer' : '维护者'));
      assert(!(await replacement.innerText()).includes(deletedText));
      assert.equal(await page.locator(`#${prefix}-comment-${id(3)} .${prefix}-discussion-body`).innerText(), 'Exact replacement — thanks!');
      assert.equal(await page.locator(`#${prefix}-comment-${id(16)} .${prefix}-discussion-body`).innerText(), 'Normal published content');
      const history = page.locator(selectors.versions).filter({ hasText: historical });
      assert.equal(await history.innerText(), historical); // API count=999 must not be shown.
      await history.click(); await settled(page);
      assert.equal(await history.innerText(), `${historical} · ${countText(10)}`);
      assert.equal(await page.locator('article[data-comment-id]').count(), 10);
      assert.equal(await page.evaluate(() => window.discussionRaw[0][0].replies[0].status), 'deleted');
      await page.close(); checks++;

      ({ page } = await open(browser, locale, width, 'pagination'));
      assert.equal(await page.locator(selectors.root).count(), 0);
      assert.equal(await page.locator(selectors.empty).count(), 0); // More raw pages still exist.
      assert(await page.locator(selectors.more).isVisible());
      await page.evaluate(() => { window.discussionFailNext = true; });
      await page.locator(selectors.more).click(); await settled(page);
      const retry = page.locator(`.${prefix}-discussion-status button`);
      assert(await retry.isVisible());
      await retry.click(); await settled(page);
      assert.equal(await page.locator(selectors.empty).count(), 0);
      await page.locator(selectors.more).click(); await settled(page);
      assert.deepEqual(await ids(page.locator(selectors.root)), [id(22)]);
      assert.deepEqual(await ids(page.locator(selectors.reply)), [id(25)]);
      assert(!(await page.locator(selectors.more).isVisible()));
      assert.deepEqual(await page.evaluate(() => window.discussionReads.map(r => r.cursor)), [null,'raw-c1','raw-c1','raw-c2']);
      await page.locator(selectors.versions).filter({ hasText: historical }).click(); await settled(page);
      assert.equal(await page.locator(selectors.versions).filter({ hasText: historical }).innerText(), historical);
      await page.locator(selectors.more).click(); await settled(page);
      assert.equal(await page.locator(selectors.versions).filter({ hasText: historical }).innerText(), historical);
      await page.locator(selectors.more).click(); await settled(page);
      assert.equal(await page.locator(selectors.versions).filter({ hasText: historical }).innerText(), `${historical} · ${countText(2)}`);
      assert.equal(await page.locator('article[data-comment-id]').count(), 2);
      await page.close(); checks++;

      ({ page } = await open(browser, locale, width, 'all-deleted'));
      assert.equal(await page.locator(selectors.empty).count(), 0);
      await page.locator(selectors.more).click(); await settled(page);
      assert.equal(await page.locator(selectors.empty).count(), 1);
      assert.equal(await page.locator('article[data-comment-id]').count(), 0);
      await page.locator(selectors.versions).filter({ hasText: historical }).click(); await settled(page);
      await page.locator(selectors.more).click(); await settled(page);
      assert.equal(await page.locator(selectors.versions).filter({ hasText: historical }).innerText(), `${historical} · ${countText(0)}`);
      assert.equal(await page.locator(selectors.empty).count(), 1);
      await page.close(); checks++;

      // Switching between cached versions keeps the same projected tree/counts.
      ({ page } = await open(browser, locale, width, 'tree'));
      await page.locator(selectors.versions).filter({ hasText: historical }).click(); await settled(page);
      await page.locator(selectors.versions).first().click(); await settled(page);
      assert.deepEqual(await ids(page.locator(selectors.root)), [1,4,11,15].map(id));
      assert.deepEqual(await ids(page.locator(selectors.reply)), [3,5,7,12,13,16].map(id));
      assert.equal(await page.evaluate(() => window.discussionReads.length), 2);
      assert.equal(await page.locator(selectors.versions).filter({ hasText: historical }).innerText(), `${historical} · ${countText(10)}`);
      await page.close(); checks++;
    }
    console.log(`${prefix} ${name}: PASS ${checks} bilingual/mobile/desktop tree, count, cursor/retry projection scenarios`);
  } finally { await browser.close(); }
}
(async () => {
  await run('Edge', chromium, { executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' });
  await run('WebKit', webkit, process.env.WEBKIT_EXECUTABLE ? { executablePath: process.env.WEBKIT_EXECUTABLE } : {});
})().catch(error => { console.error(error); process.exitCode = 1; });
