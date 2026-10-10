'use strict';
// Local synthetic discussion tests. Never call remote APIs or notification services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium, webkit } = require('playwright');
const base = process.env.GUIDE_BASE_URL;
assert(base && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
const prefix = 'kt', current = 'Public v0.57a', historical = 'Public v0.56';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sel = name => `.${prefix}-discussion-${name}`;
async function remoteChecks() {
  const source = fs.readFileSync(path.join(__dirname, '../assets/kt-discussion-remote.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const host of ['killigans-treasure.carambi.com']) {
    const staging = host.startsWith('kt-staging');
    const origin = `https://discussion${staging ? '-staging' : ''}.carambi.com`;
    const context = { window: {}, location: { hostname: host }, document: { querySelector: q => ({ content: q.includes('environment') ? staging ? 'staging' : 'production' : q.includes('sitekey') ? '0xFixture' : origin }) }, URL, fetch: null };
    vm.createContext(context); vm.runInContext(source, context);
    const transport = context.window.__ktDiscussionRemoteTransport;
    for (const status of [201, 400, 403, 423, 429, 408, 500, 503, 200]) {
      context.fetch = async (url, options) => {
        assert.equal(url, origin + '/v1/discussion/comments'); assert.equal(options.credentials, 'omit');
        return { status, json: async () => { throw Error('Lost JSON response'); } };
      };
      if (status === 201) assert.equal((await transport.postComment({})).httpStatus, 201);
      else await assert.rejects(transport.postComment({}), e => e.outcomeUnknown === ![400, 403, 423, 429].includes(status));
    }
    context.fetch = async () => { throw Error('Connection lost'); };
    await assert.rejects(transport.postComment({}), e => e.outcomeUnknown === true);
  }
  console.log('kt remote: PASS production 201 missing body, known refusal, 408/5xx/invalid/network unknown');
}
async function open(browser, locale, width, suffix = '') {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ current, historical }) => {
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    window.discussionReads = []; window.discussionPosts = []; window.postMode = 'unknown';
    window.failCursor = null; window.slowRead = false; window.slowPost = false; window.locked = false;
    window.turnstile = { render(slot, options) { queueMicrotask(() => options.callback('fixture-token')); return 1; }, remove() {} };
    const comment = (n, version, scope = 'version', replies = []) => ({ id: id(n), authorKind: n === 1 ? 'maintainer' : 'guest', displayName: 'Synthetic', body: `Comment ${n}`, status: 'published', guideVersion: version, discussionScope: scope, parentCommentId: null, pageHash: null, pinnedAt: n === 1 ? '2026-10-01T00:00:00Z' : null, createdAt: '2026-10-01T00:00:00Z', replies });
    const transport = { fixtureCanWrite: true, turnstileSitekey: '0xFixture', async readDiscussion(request) {
      window.discussionReads.push({ ...request });
      if (window.slowRead) await new Promise(resolve => { window.releaseRead = resolve; });
      if (request.cursor && request.cursor === window.failCursor) { window.failCursor = null; throw Error('Fixture refresh failure'); }
      let roots = request.cursor === 'c1' ? [comment(2, request.guideVersion, 'version', [{ ...comment(22, current), parentCommentId: id(2) }])] : [comment(1, request.guideVersion)];
      let nextCursor = request.cursor ? null : 'c1';
      if (window.shifted && request.section !== 'persistent') {
        const n = !request.cursor ? 3 : request.cursor === 'c1' ? 1 : 2;
        roots = [comment(n, request.guideVersion)];
        nextCursor = !request.cursor ? 'c1' : request.cursor === 'c1' ? 'c2' : null;
      }
      const persistent = request.section === 'persistent' && request.cursor === 'p1' ? [comment(11, historical, 'persistent', [{ ...comment(23, current), parentCommentId: id(11) }])] : [comment(10, historical, 'persistent')];
      return { ok: true, thread: { id: 'fixture', status: window.locked ? 'locked' : 'open' }, currentVersion: { guideVersion: request.guideVersion, comments: roots, nextCursor }, persistent: { comments: persistent, nextCursor: request.section === 'persistent' && request.cursor ? null : 'p1' }, earlierVersions: [{ guideVersion: historical, commentCount: 2 }] };
    }, async postComment(input) {
      window.discussionPosts.push({ ...input });
      if (window.slowPost) await new Promise(resolve => { window.releasePost = resolve; });
      if (window.postMode === 'success') return { ok: true, httpStatus: 201, commentId: null };
      const error = Error('Synthetic error');
      if (window.postMode === 'rate') error.code = 'RATE_LIMITED';
      if (window.postMode === 'verification') error.code = 'VERIFICATION_FAILED';
      if (window.postMode === 'fields') error.fieldErrors = { displayName: 'Invalid name' };
      if (window.postMode === 'locked') { error.code = 'THREAD_LOCKED'; window.locked = true; }
      if (window.postMode === 'server') error.outcomeUnknown = true;
      throw error;
    } };
    Object.defineProperty(window, '__ktDiscussionFixtureTransport', { get: () => transport, set() {} });
  }, { current, historical });
  await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}guide/redroot.html${suffix}`);
  await page.locator(sel('refresh')).waitFor(); await settled(page);
  return page;
}
async function settled(page) { await page.waitForFunction(() => document.querySelector('.kt-discussion-comments')?.getAttribute('aria-busy') === 'false'); }
async function ready(page) { await page.waitForFunction(() => !document.querySelector('.kt-discussion-submit').disabled); }
async function composer(page, reply = false) {
  await page.locator(reply ? `#kt-comment-${id(1)} ${sel('reply-action')}` : sel('add')).click();
  await page.locator('#kt-discussion-name').fill('Reader'); await page.locator('#kt-discussion-new-body').fill('Saved synthetic draft'); await ready(page);
}
async function run(name, type, options) {
  const browser = await type.launch({ headless: true, ...options }); let cases = 0;
  try {
    for (const locale of ['zh-CN', 'en']) for (const width of [390, 1440]) {
      let page = await open(browser, locale, width);
      assert.equal(await page.locator(sel('refresh')).innerText(), locale === 'en' ? 'Refresh' : '刷新');
      await page.evaluate(() => { const p = document.createElement('p'); p.id = 'sample-paragraph'; p.textContent = 'Synthetic guide paragraph'; document.querySelector('main#quarto-document-content').append(p); });
      const hashes = ['#sample-paragraph', '#kt-discussion-title', `#kt-comment-${id(1)}`, '#toc-title', '#quarto-document-content', '#nonexistent', '#%ZZ', '#00000000-0000-4000-8000-000000000001'];
      assert.deepEqual(await page.evaluate(hashes => hashes.map(hash => window.__ktDiscussionRuntime.getContentHash(hash)), hashes), ['#sample-paragraph', ...hashes.slice(1).map(() => '')]);
      await page.evaluate(() => history.replaceState(null, '', '#sample-paragraph'));
      await page.locator(sel('heading')).screenshot({ path: `${process.env.DISCUSSION_EVIDENCE_DIR || '/tmp'}/${name}-${locale}-${width}-heading.png` });
      await composer(page); await page.locator(sel('submit')).click();
      await page.locator(sel('confirm-unposted')).waitFor();
      await page.locator(sel('composer')).screenshot({ path: `${process.env.DISCUSSION_EVIDENCE_DIR || '/tmp'}/${name}-${locale}-${width}-uncertain.png` });
      assert.equal(await page.locator(sel('submit')).isDisabled(), true);
      assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Saved synthetic draft');
      assert.equal(await page.evaluate(() => window.discussionPosts[0].pageHash), '#sample-paragraph');
      await page.evaluate(() => document.querySelector('.kt-discussion-composer').requestSubmit());
      assert.equal(await page.evaluate(() => window.discussionPosts.length), 1);
      await page.locator(sel('refresh')).click(); await settled(page);
      assert(await page.locator(sel('confirm-unposted')).isVisible()); assert(await page.locator(sel('submit')).isDisabled());
      await page.locator(`${sel('composer-actions')} button`).last().click();
      await page.locator(sel('add')).click(); assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Saved synthetic draft');
      assert(await page.locator(sel('confirm-unposted')).isVisible());
      await page.locator(sel('confirm-unposted')).click(); await ready(page);
      for (const mode of ['rate', 'verification', 'fields']) {
        await page.evaluate(mode => { window.postMode = mode; }, mode); await page.locator(sel('submit')).click(); await ready(page);
        assert.equal(await page.locator(sel('confirm-unposted')).isVisible(), false);
        assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Saved synthetic draft');
      }
      await page.evaluate(() => { window.postMode = 'success'; window.slowPost = true; });
      await page.locator(sel('submit')).click(); await page.waitForFunction(() => typeof window.releasePost === 'function');
      assert(await page.locator(sel('refresh')).isDisabled()); assert(await page.locator(sel('version-buttons') + ' button').first().isDisabled());
      const readCount = await page.evaluate(() => window.discussionReads.length);
      await page.evaluate(() => document.querySelector('.kt-discussion-refresh').click()); assert.equal(await page.evaluate(() => window.discussionReads.length), readCount);
      await page.evaluate(() => { window.slowPost = false; window.releasePost(); });
      await page.waitForFunction(() => document.querySelector('.kt-discussion-post-notice')?.dataset.state === 'success');
      await page.locator(sel('add')).click(); assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), '');
      await page.close(); cases++;

      page = await open(browser, locale, width);
      await page.locator(sel('comments') + ' + button').click(); await settled(page);
      await page.locator(sel('persistent') + ' > button').click(); await settled(page);
      await composer(page, true);
      assert.equal(await page.locator(sel('comment')).count(), 4);
      const beforeIds = await page.locator(sel('comment')).evaluateAll(nodes => nodes.map(n => n.id));
      await page.evaluate(() => { window.failCursor = 'c1'; });
      await page.locator(sel('refresh')).click(); await settled(page);
      assert.deepEqual(await page.locator(sel('comment')).evaluateAll(nodes => nodes.map(n => n.id)), beforeIds);
      assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Saved synthetic draft');
      assert(await page.locator(sel('status') + ' button').isVisible());
      await page.locator(sel('status') + ' button').click(); await settled(page);
      assert.equal(await page.locator(sel('comment')).count(), 4);
      assert.equal(await page.locator(sel('composer')).evaluate(n => n.closest('article').dataset.commentId), id(1));
      assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Saved synthetic draft');
      await page.evaluate(() => { window.slowRead = true; document.querySelector('#kt-discussion-new-body').focus(); window.beforeScroll = scrollY; document.querySelector('.kt-discussion-refresh').click(); document.querySelector('.kt-discussion-refresh').click(); });
      await page.waitForFunction(() => typeof window.releaseRead === 'function');
      assert(await page.locator(sel('refresh')).isDisabled()); assert(await page.locator(sel('submit')).isDisabled());
      await page.evaluate(() => { window.slowRead = false; window.releaseRead(); }); await settled(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'kt-discussion-new-body');
      assert(Math.abs(await page.evaluate(() => scrollY - window.beforeScroll)) < 3);
      await page.locator(sel('version-buttons') + ' button').filter({ hasText: historical }).click(); await settled(page);
      await page.locator(sel('refresh')).click(); await settled(page);
      assert.equal(await page.locator(sel('version-buttons') + ' button[aria-pressed="true"]').innerText(), historical);
      assert.equal(await page.evaluate(() => window.discussionReads.filter(read => read.section !== 'persistent').at(-1).guideVersion), historical);
      await page.locator(sel('version-buttons') + ' button').first().click(); await settled(page);
      await page.locator(`#kt-comment-${id(1)} ${sel('reply-action')}`).click();
      assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Saved synthetic draft');
      await page.evaluate(() => { window.postMode = 'server'; }); await ready(page); await page.locator(sel('submit')).click();
      await page.locator(sel('confirm-unposted')).waitFor(); assert.equal(await page.evaluate(() => window.discussionPosts.at(-1).parentCommentId), id(1)); assert.equal(await page.evaluate(() => window.discussionPosts.at(-1).pageHash), '');
      assert(await page.locator(sel('submit')).isDisabled());
      await page.locator(sel('confirm-unposted')).click(); await ready(page);
      await page.evaluate(() => { window.postMode = 'locked'; }); await page.locator(sel('submit')).click(); await page.locator(sel('locked')).waitFor();
      assert.equal(await page.locator(sel('composer-host')).isVisible(), false);
      assert(await page.locator(sel('comment')).count() >= 2);
      assert.equal(await page.locator(sel('heading')).evaluate(n => n.scrollWidth <= n.clientWidth), true);
      await page.screenshot({ path: `${process.env.DISCUSSION_EVIDENCE_DIR || '/tmp'}/${name}-${locale}-${width}.png`, fullPage: false });
      await page.close(); cases++;
      page = await open(browser, locale, width);
      await page.locator(sel('comments') + ' + button').click(); await settled(page);
      await page.locator(`#kt-comment-${id(2)} ${sel('reply-action')}`).click();
      await page.locator('#kt-discussion-new-body').fill('Tail-page reply draft'); await ready(page);
      await page.evaluate(() => { window.shifted = true; });
      await page.locator(sel('refresh')).click(); await settled(page);
      assert.equal(await page.locator(sel('composer')).evaluate(node => node.closest('article').dataset.commentId), id(2));
      assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Tail-page reply draft');
      assert.equal(await page.evaluate(() => window.discussionReads.filter(read => read.section !== 'persistent').at(-1).cursor), 'c2');
      await page.close(); cases++;
      for (const operation of ['refresh', 'post']) {
        page = await open(browser, locale, width);
        await page.evaluate(historical => { history.pushState(null, '', '?discussionVersion=' + encodeURIComponent(historical)); dispatchEvent(new PopStateEvent('popstate')); }, historical);
        await page.waitForFunction(historical => document.querySelector('.kt-discussion-version-buttons button[aria-pressed="true"]')?.textContent.includes(historical), historical);
        await settled(page);
        await composer(page, true);
        if (operation === 'refresh') {
          await page.evaluate(() => { window.slowRead = true; });
          await page.locator(sel('refresh')).click();
          await page.waitForFunction(() => typeof window.releaseRead === 'function');
        } else {
          await page.evaluate(() => { window.slowPost = true; window.postMode = 'server'; });
          await page.locator(sel('submit')).click();
          await page.waitForFunction(() => typeof window.releasePost === 'function');
        }
        const readCount = await page.evaluate(() => window.discussionReads.length);
        await page.goBack();
        assert.equal(new URL(page.url()).search, '');
        assert.equal(await page.evaluate(() => window.discussionReads.length), readCount);
        await page.evaluate(operation => { if (operation === 'refresh') { window.slowRead = false; window.releaseRead(); } else { window.slowPost = false; window.releasePost(); } }, operation);
        await page.waitForFunction(current => document.querySelector('.kt-discussion-version-buttons button[aria-pressed="true"]')?.textContent.includes(current), current);
        await settled(page);
        if (!await page.locator(sel('composer-host')).isVisible()) await page.locator(`#kt-comment-${id(1)} ${sel('reply-action')}`).click();
        assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Saved synthetic draft');
        if (operation === 'post') { assert(await page.locator(sel('confirm-unposted')).isVisible()); assert(await page.locator(sel('submit')).isDisabled()); }
        await page.close(); cases++;
      }
      for (const [suffix, target] of [[`#kt-comment-${id(22)}`, 22], [`?discussionVersion=${encodeURIComponent(historical)}#kt-comment-${id(22)}`, 22], [`?discussionScope=persistent#kt-comment-${id(23)}`, 23]]) {
        page = await open(browser, locale, width, suffix);
        await page.locator(`#kt-comment-${id(target)}`).waitFor();
        await page.waitForFunction(target => document.activeElement?.id === `kt-comment-${target}`, id(target));
        assert.equal(await page.locator(`#kt-comment-${id(target)}`).isVisible(), true);
        await page.close(); cases++;
      }
    }
    console.log(`kt ${name}: PASS ${cases} bilingual desktop/mobile incremental submit/hash/refresh cases`);
  } finally { await browser.close(); }
}
(async () => { await remoteChecks(); await run('Edge', chromium, { executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' }); await run('WebKit', webkit, { executablePath: process.env.WEBKIT_EXECUTABLE || '/Users/yangtao/Library/Caches/ms-playwright/webkit-2365/pw_run.sh' }); })().catch(error => { console.error(error); process.exitCode = 1; });
