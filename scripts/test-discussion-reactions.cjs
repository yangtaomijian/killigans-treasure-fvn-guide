'use strict';
// Synthetic-only reaction contract and real-source browser tests; no external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium, webkit } = require('playwright');
const base = process.env.GUIDE_BASE_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const types = ['like', 'heart', 'smile', 'celebrate', 'thinking'];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const panel = n => `.kt-discussion-reactions[data-comment-id="${id(n)}"]`;
const add = n => panel(n) + ' .kt-discussion-reaction-add';
const chip = (n, type) => `${panel(n)} .kt-discussion-reaction-chip[data-reaction-type="${type}"]`;
const option = (n, type) => `${panel(n)} [role="menuitemcheckbox"][data-reaction-type="${type}"]`;
const key = 'carambi:kt:emoji-visitor:v1';
const current = 'Public v0.57a', historical = 'Public v0.56';
async function transportChecks() {
  const source = fs.readFileSync(path.join(__dirname, '../assets/kt-discussion-remote.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = { window: {}, location: { hostname: 'killigans-treasure.carambi.com' }, document: { querySelector: q => ({ content: q.includes('environment') ? 'production' : q.includes('sitekey') ? '0xFixture' : 'https://discussion.carambi.com' }) }, URL, AbortController, setTimeout, clearTimeout, fetch: null };
  vm.createContext(context); vm.runInContext(source, context); const transport = context.window.__ktDiscussionRemoteTransport;
  const row = { commentId: id(1), counts: { like: 1, heart: 0, smile: 0, celebrate: 0, thinking: 0 }, selected: ['like'], canReact: true };
  context.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body); assert(!url.includes('visitor')); assert.equal(opts.method, 'POST'); assert.equal(opts.credentials, 'omit'); assert(opts.signal);
    assert(body.visitorId === 'a'.repeat(64)); assert(!Object.hasOwn(body, 'site')); assert(!Object.hasOwn(body, 'guideVersion'));
    return { status: 200, json: async () => ({ ok: true, requestId: 'synthetic-request', receivedAt: '2026-10-10T00:00:00Z', unexpected: 'must not echo', ...(url.endsWith('/read') ? { reactions: [row] } : { reaction: row }) }) };
  };
  const read = await transport.readReactions({ pageKey: 'guide.redroot', locale: 'en', commentIds: [id(1)], visitorId: 'a'.repeat(64) });
  assert.deepEqual(Object.keys(read).sort(), ['ok', 'reactions']);
  const write = await transport.setReaction({ pageKey: 'guide.redroot', locale: 'en', commentId: id(1), type: 'like', visitorId: 'a'.repeat(64), intent: 'add' });
  assert.deepEqual(Object.keys(write).sort(), ['ok', 'reaction']);
  for (const bad of [{ ...row, counts: { ...row.counts, like: -1 } }, { ...row, counts: { ...row.counts, extra: 1 } }, { ...row, selected: ['like', 'like'] }, { ...row, visitorId: 'must not echo' }, { ...row, canReact: 1 }]) {
    context.fetch = async () => ({ status: 200, json: async () => ({ ok: true, reaction: bad }) });
    await assert.rejects(transport.setReaction({ commentId: id(1), type: 'like', visitorId: 'a'.repeat(64), intent: 'add' }));
  }
  for (const status of [201, 429, 500]) {
    context.fetch = async () => ({ status, json: async () => ({ ok: status === 201, reaction: row }) });
    await assert.rejects(transport.setReaction({ commentId: id(1), type: 'like', visitorId: 'a'.repeat(64), intent: 'add' }), error => error.status === status);
  }
  await assert.rejects(transport.readReactions({ commentIds: Array.from({ length: 51 }, (_, n) => id(n)) }));
  await assert.rejects(transport.setReaction({ commentId: id(1), type: 'laugh', visitorId: 'a'.repeat(64), intent: 'toggle' }));
  // Fire only the reaction timeout immediately; no 15-second blocking wait.
  context.setTimeout = fn => setTimeout(fn, 0); context.clearTimeout = clearTimeout;
  context.fetch = async (url, opts) => new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(Error('synthetic abort')), { once: true }));
  await assert.rejects(transport.setReaction({ commentId: id(1), type: 'like', visitorId: 'a'.repeat(64), intent: 'add' }), error => error.outcomeUnknown === true);
  console.log('KT transport PASS: real envelope, clean output, strict rows/status/input, body-only identity, timeout unknown');
}
async function settled(page) { await page.waitForFunction(() => document.querySelector('.kt-discussion-comments')?.getAttribute('aria-busy') === 'false'); }
async function reactReady(page, n = 1) { await page.waitForFunction(n => !document.querySelector(`.kt-discussion-reactions[data-comment-id="${n}"] .kt-discussion-reaction-add`)?.disabled, id(n)); }
async function chosen(page, n, type, value) { await page.waitForFunction(({ n, type, value }) => document.querySelector(`.kt-discussion-reactions[data-comment-id="${n}"] .kt-discussion-reaction-chip[data-reaction-type="${type}"]`)?.getAttribute('aria-pressed') === String(value), { n: id(n), type, value }); }
async function open(browser, locale, width, config = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ current, historical, config }) => {
    if (config.storageBlocked) Object.defineProperty(Storage.prototype, 'getItem', { value() { throw Error('Synthetic blocked storage'); } });
    const types = ['like', 'heart', 'smile', 'celebrate', 'thinking'];
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    window.reactionReads = []; window.reactionWrites = []; window.commentPosts = []; window.selectionMap = {};
    window.reactionMode = 'success'; window.readMode = config.readFail ? 'fail' : 'success'; window.delayWrite = false; window.delayRead = false; window.locked = false; window.noReply = false; window.rootStatus = 'published';
    window.turnstile = { render(slot, opts) { queueMicrotask(() => opts.callback('synthetic-token')); return 1; }, remove() {} };
    const comment = (n, version = current, scope = 'version', root = null, status = 'published') => ({ id: id(n), parentCommentId: root === null ? null : id(root), replyToCommentId: root === null ? null : id(root), replyTo: root === null ? null : { id: id(root), status: 'published', displayName: 'Same', authorKind: 'guest' }, status, displayName: status === 'published' ? (config.longName ? 'A very long display name '.repeat(8) : '<img src=x onerror=alert(1)> Same') : null, authorKind: n === 1 ? 'maintainer' : 'guest', body: status === 'published' ? `Comment ${n}` : null, guideVersion: version, discussionScope: scope, canReply: !window.locked && !window.noReply && status === 'published', pageHash: null, createdAt: '2026-10-10T00:00:00Z', replies: [] });
    function reaction(commentId, visitor) {
      const counts = Object.fromEntries(types.map(type => [type, config.longCount ? 123456789 : config.five ? 1 : type === 'like' && !config.empty ? 1 : 0]));
      for (const [entry, selections] of Object.entries(window.selectionMap)) if (entry.endsWith(':' + commentId)) for (const type of selections) counts[type]++;
      return { commentId, counts, selected: visitor ? [...(window.selectionMap[visitor + ':' + commentId] || [])] : [], canReact: !window.locked && ![id(6), id(7)].includes(commentId) };
    }
    const transport = { fixtureCanWrite: true, turnstileSitekey: '0xFixture', async readDiscussion(request) {
      const root = comment(request.guideVersion === historical ? 11 : 1, request.guideVersion, 'version', null, window.rootStatus); root.replies = [comment(request.guideVersion === historical ? 12 : 2, request.guideVersion, 'version', request.guideVersion === historical ? 11 : 1)];
      const hidden = comment(6, current, 'version', null, 'hidden'); hidden.replies = [comment(7, current, 'version', 6)];
      const persistent = comment(101, historical, 'persistent'); persistent.replies = [comment(102, historical, 'persistent', 101)];
      return { ok: true, thread: { id: 'fixture', status: window.locked ? 'locked' : 'open' }, currentVersion: { guideVersion: request.guideVersion, comments: [root, hidden], nextCursor: null }, persistent: { comments: [persistent], nextCursor: null }, earlierVersions: [{ guideVersion: historical, commentCount: 2 }] };
    }, async postComment(input) { window.commentPosts.push({ ...input }); return { ok: true, httpStatus: 201, commentId: null }; }, async sendFeedback() { return { ok: true, httpStatus: 202 }; } };
    if (!config.legacy) Object.assign(transport, { async readReactions(input) {
      window.reactionReads.push({ ...input }); const rows = input.commentIds.map(commentId => reaction(commentId, input.visitorId));
      if (window.delayRead) await new Promise(resolve => { window.releaseReactionRead = resolve; });
      if (window.readMode === 'fail') throw Error('Synthetic read failure');
      return { ok: true, reactions: rows };
    }, async setReaction(input) {
      window.reactionWrites.push({ ...input });
      if (window.reactionMode === 'rate') { const error = Error('Synthetic limit'); error.status = 429; throw error; }
      const entry = input.visitorId + ':' + input.commentId; const selected = new Set(window.selectionMap[entry] || []);
      if (input.intent === 'add') selected.add(input.type); else selected.delete(input.type); window.selectionMap[entry] = [...selected];
      const result = { ok: true, reaction: reaction(input.commentId, input.visitorId) };
      if (window.delayWrite) await new Promise(resolve => { window.releaseReactionWrite = resolve; });
      if (window.reactionMode === 'unknown') { const error = Error('Lost synthetic response'); error.outcomeUnknown = true; throw error; }
      if (window.reactionMode === 'malformed') result.reaction.counts.like = -1;
      return result;
    } });
    Object.defineProperty(window, '__ktDiscussionFixtureTransport', { get: () => transport, set() {} });
  }, { current, historical, config });
  await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}guide/redroot.html${config.suffix || ''}`);
  await page.locator('.kt-discussion-refresh').waitFor(); await settled(page); return page;
}
async function choose(page, n, type) { await reactReady(page, n); await page.locator(add(n)).click(); await page.locator(option(n, type)).click(); await reactReady(page, n); }
async function draft(page) {
  await page.locator('.kt-discussion-add').click(); await page.locator('#kt-discussion-new-body').fill('Keep comment draft');
  await page.waitForFunction(() => !document.querySelector('.kt-discussion-submit').disabled);
}
async function run(name, engine, executablePath) {
  const browser = await engine.launch({ headless: true, executablePath }); let groups = 0;
  try {
    for (const locale of ['zh-CN', 'en']) for (const width of [390, 1440]) {
      let page;
      if (process.env.KT_REACTION_LAYOUT_ONLY !== 'true') {
      page = await open(browser, locale, width); await reactReady(page);
      assert.equal(await page.locator(panel(6)).count(), 0); assert.equal(await page.locator(panel(7)).count(), 0);
      assert.equal(await page.locator('#kt-public-discussion img').count(), 0, 'Nickname remains text');
      for (const type of types) { await choose(page, 1, type); await chosen(page, 1, type, true); assert((await page.locator(chip(1, type)).innerText()).includes('✓')); }
      assert.equal(await page.locator(panel(1) + ' .kt-discussion-reaction-chip').count(), 5);
      for (const type of types) { await page.locator(chip(1, type)).click(); await reactReady(page); }
      assert.equal(await page.locator(panel(1) + ' .kt-discussion-reaction-chip').count(), 1);
      await page.locator(add(1)).focus(); await page.keyboard.press('Enter'); await page.locator(option(1, 'like')).waitFor();
      await page.keyboard.press('ArrowRight'); assert.equal(await page.evaluate(() => document.activeElement.dataset.reactionType), 'heart');
      await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.activeElement.className), 'kt-discussion-reaction-add');
      await page.locator(add(1)).click(); await page.locator(option(1, 'heart')).focus(); await page.keyboard.press('Enter'); await chosen(page, 1, 'heart', true);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.reactionType), 'heart');
      await page.locator(chip(1, 'heart')).focus(); await page.keyboard.press('Enter'); await reactReady(page);
      assert.equal(await page.locator(chip(1, 'heart')).count(), 0); assert.equal(await page.evaluate(() => document.activeElement.className), 'kt-discussion-reaction-add');
      await draft(page); await page.locator(panel(2)).evaluate(n => n.scrollIntoView({ block: 'center' })); const scroll = await page.evaluate(() => scrollY);
      await choose(page, 2, 'thinking'); assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Keep comment draft');
      assert(Math.abs(await page.evaluate(() => scrollY) - scroll) < 3, 'Reaction does not move browsing position');
      await page.evaluate(() => { window.noReply = true; }); await page.locator('.kt-discussion-refresh').click(); await settled(page); await reactReady(page, 2);
      assert.equal(await page.locator(`#kt-comment-${id(2)} .kt-discussion-reply-action`).count(), 0); assert(!(await page.locator(add(2)).isDisabled()), 'canReact independent of canReply');
      assert.equal(await page.evaluate(({ key }) => { const visitor = localStorage.getItem(key); return !!visitor && /^[0-9a-f]{64}$/.test(visitor) && !document.body.textContent.includes(visitor) && !location.href.includes(visitor); }, { key }), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator(add(1)).click(); await page.locator(panel(1)).screenshot({ path: `${process.env.DISCUSSION_EVIDENCE_DIR || '/tmp'}/${name}-${locale}-${width}-reactions.png` });
      await page.context().close(); groups++;

      page = await open(browser, locale, width); await reactReady(page);
      await page.locator(`#kt-comment-${id(2)} .kt-discussion-reply-action`).click();
      await page.locator('#kt-discussion-new-body').fill('Keep comment draft'); await page.locator('#kt-discussion-name').fill('Keep name');
      await page.evaluate(() => { window.delayWrite = true; }); await page.locator(add(1)).click(); await page.locator(option(1, 'heart')).focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => typeof window.releaseReactionWrite === 'function');
      assert(await page.locator(add(1)).isDisabled()); await page.locator(add(1)).evaluate(n => n.click()); assert.equal(await page.evaluate(() => window.reactionWrites.length), 1);
      const body = page.locator('#kt-discussion-new-body');
      const editorTop = await body.evaluate(n => {
        n.scrollIntoView({ block: 'center' }); n.focus({ preventScroll: true }); n.setSelectionRange(3, 9);
        return n.getBoundingClientRect().top;
      });
      await page.evaluate(() => { window.delayWrite = false; window.releaseReactionWrite(); }); await chosen(page, 1, 'heart', true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'kt-discussion-new-body'); assert.equal(await body.inputValue(), 'Keep comment draft');
      assert.equal(await page.locator('#kt-discussion-name').inputValue(), 'Keep name');
      assert.deepEqual(await body.evaluate(n => [n.selectionStart, n.selectionEnd]), [3, 9]);
      assert(Math.abs(await body.evaluate(n => n.getBoundingClientRect().top) - editorTop) < 3, 'Completed reaction preserves active reply composer viewport');
      await page.context().close(); groups++;

      page = await open(browser, locale, width); await reactReady(page);
      await page.evaluate(() => { window.reactionMode = 'unknown'; window.readMode = 'fail'; }); await chooseUnknown(page, 1, 'heart');
      await page.locator(panel(1) + ' .kt-discussion-reaction-retry').waitFor();
      assert(await page.locator(add(1)).isDisabled()); await page.locator(add(1)).evaluate(n => n.click());
      assert.equal(await page.evaluate(() => window.reactionWrites.length), 1); await page.locator(panel(1) + ' .kt-discussion-reaction-retry').click();
      assert.equal(await page.evaluate(() => window.reactionWrites.length), 1); assert(await page.locator(add(1)).isDisabled());
      await page.evaluate(() => { window.readMode = 'success'; }); await page.locator(panel(1) + ' .kt-discussion-reaction-retry').click(); await chosen(page, 1, 'heart', true);
      assert.equal(await page.evaluate(() => window.reactionWrites.length), 1);
      await page.evaluate(() => { window.reactionMode = 'rate'; }); await page.locator(chip(1, 'heart')).click(); await reactReady(page);
      assert((await page.locator(panel(1) + ' .kt-discussion-reaction-status').innerText()).includes(locale === 'en' ? 'Too many' : '过于频繁'));
      await chosen(page, 1, 'heart', true); await page.context().close(); groups++;

      page = await open(browser, locale, width); await reactReady(page);
      await page.evaluate(() => { window.delayWrite = true; }); await page.locator(add(1)).click(); await page.locator(option(1, 'heart')).click();
      await page.waitForFunction(() => typeof window.releaseReactionWrite === 'function');
      await page.evaluate(() => { window.locked = true; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert(await page.locator(add(1)).isDisabled()); await page.locator(add(1)).evaluate(n => n.click()); assert.equal(await page.evaluate(() => window.reactionWrites.length), 1);
      await page.evaluate(() => { window.delayWrite = false; window.releaseReactionWrite(); }); await page.waitForFunction(n => document.querySelector(`.kt-discussion-reactions[data-comment-id="${n}"]`)?.getAttribute('aria-busy') === 'false', id(1));
      assert(await page.locator(add(1)).isDisabled()); assert((await page.locator(panel(1) + ' .kt-discussion-reaction-status').innerText()).includes(locale === 'en' ? 'unavailable' : '不能修改'));
      await page.context().close(); groups++;

      page = await open(browser, locale, width); await reactReady(page);
      await page.evaluate(() => { window.delayRead = true; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      await page.waitForFunction(() => typeof window.releaseReactionRead === 'function');
      await page.evaluate(() => { window.delayRead = false; window.locked = true; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      await page.waitForFunction(n => document.querySelector(`.kt-discussion-reactions[data-comment-id="${n}"] .kt-discussion-reaction-status`)?.textContent.includes(document.documentElement.lang === 'en' ? 'unavailable' : '不能修改'), id(1));
      await page.evaluate(() => window.releaseReactionRead()); assert(await page.locator(add(1)).isDisabled()); await page.context().close(); groups++;

      page = await open(browser, locale, width); await reactReady(page); await choose(page, 2, 'heart');
      await page.evaluate(() => { window.rootStatus = 'hidden'; window.readMode = 'fail'; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert.equal(await page.locator(panel(1)).count(), 0); assert.equal(await page.locator(panel(2)).count(), 0, 'Hidden root must not expose cached child reaction counts');
      assert.equal(await page.locator(`#kt-comment-${id(2)} > .kt-discussion-body`).count(), 1, 'Existing published child body projection remains unchanged');
      await page.evaluate(() => { window.rootStatus = 'deleted'; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert.equal(await page.locator(panel(2)).count(), 0, 'Deleted root must not expose cached child reaction counts');
      await page.context().close(); groups++;

      page = await open(browser, locale, width, { storageBlocked: true }); await page.locator(chip(1, 'like')).waitFor(); assert(await page.locator(add(1)).isDisabled());
      assert.equal(await page.evaluate(() => window.reactionReads.every(row => !Object.hasOwn(row, 'visitorId'))), true);
      await draft(page); await page.locator('.kt-discussion-submit').click(); await page.waitForFunction(() => window.commentPosts.length === 1);
      assert.equal(await page.evaluate(() => Object.hasOwn(window.commentPosts[0], 'visitorId')), false); await page.context().close(); groups++;

      page = await open(browser, locale, width, { readFail: true }); await page.locator(panel(1) + ' .kt-discussion-reaction-retry').waitFor();
      await draft(page); await page.locator('.kt-discussion-submit').click(); await page.waitForFunction(() => window.commentPosts.length === 1);
      assert.equal(await page.locator('#kt-comment-' + id(1)).count(), 1); await page.context().close(); groups++;

      page = await open(browser, locale, width); await reactReady(page);
      await page.evaluate(({ id }) => { window.selectionMap['a'.repeat(64) + ':' + id] = ['thinking']; }, { id: id(1) });
      const other = await page.context().newPage(); await other.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()); await other.goto(base + '/index.html');
      await other.evaluate(({ key }) => localStorage.setItem(key, 'a'.repeat(64)), { key }); await chosen(page, 1, 'thinking', true);
      await other.close(); await page.context().close(); groups++;

      for (const [suffix, n] of [[`?discussionVersion=${encodeURIComponent(historical)}`, 12], ['?discussionScope=persistent', 102]]) {
        page = await open(browser, locale, width, { suffix }); await choose(page, n, 'celebrate'); await chosen(page, n, 'celebrate', true);
        assert.equal(await page.evaluate(() => window.reactionWrites.at(-1).commentId), id(n)); assert(new URL(page.url()).search.includes(suffix.slice(1).split('=')[0]));
        await page.context().close(); groups++;
      }
      }
      for (const [state, config] of [['empty', { empty: true }], ['five', { five: true }], ['long', { longCount: true, longName: true }]]) {
        page = await open(browser, locale, width, config); await reactReady(page);
        const toolbar = page.locator(`#kt-comment-${id(1)} > .kt-discussion-actions`);
        assert.equal(await toolbar.locator(':scope > .kt-discussion-reactions').count(), 1);
        assert.equal(await toolbar.locator(':scope > .kt-discussion-reply-action').count(), 1);
        assert.equal(await toolbar.locator(':scope > .kt-discussion-report-action').count(), 1);
        await toolbar.scrollIntoViewIfNeeded();
        const geometry = await toolbar.evaluate(n => {
          const plus = n.querySelector('.kt-discussion-reaction-add'), reply = n.querySelector('.kt-discussion-reply-action'), report = n.querySelector('.kt-discussion-report-action');
          return { tops: [plus, reply, report].map(b => b.getBoundingClientRect().top), plus: plus.getBoundingClientRect().height,
            actions: n.getBoundingClientRect().height, reply: reply.getBoundingClientRect().height, report: report.getBoundingClientRect().height };
        });
        if (state === 'empty') assert(Math.max(...geometry.tops) - Math.min(...geometry.tops) < 3, 'Zero reaction add/reply/report share one toolbar line');
        if (width === 390) assert([geometry.plus, geometry.reply, geometry.report].every(h => h >= 44), 'Mobile toolbar touch height');
        else assert(geometry.plus <= 34 && geometry.reply <= 34 && geometry.report <= 34, 'Compact desktop toolbar height');
        const before = await page.locator(`#kt-comment-${id(1)}`).evaluate(n => n.getBoundingClientRect().height);
        await page.locator(add(1)).click(); const menu = page.locator(panel(1) + ' .kt-discussion-reaction-menu'); await menu.waitFor();
        assert.equal(await page.locator(`#kt-comment-${id(1)}`).evaluate(n => n.getBoundingClientRect().height), before, 'Floating menu never changes comment layout');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await menu.evaluate(n => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), true, 'Menu stays inside viewport');
        assert.equal(await menu.locator('button').evaluateAll(nodes => nodes.every(n => {
          const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return n === hit || n.contains(hit);
        })), true, 'Every option center is tappable without ancestor clipping');
        assert.equal(await toolbar.evaluate(n => {
          const menu = n.querySelector('.kt-discussion-reaction-menu').getBoundingClientRect(), tools = n.getBoundingClientRect();
          return menu.bottom <= tools.top || menu.top >= tools.bottom;
        }), true, 'Menu never overlaps its own toolbar including wrapped Reply/Report');
        assert.equal(await toolbar.locator(':scope > .kt-discussion-reply-action, :scope > .kt-discussion-report-action, .kt-discussion-reaction-chips > button').evaluateAll(nodes => nodes.every(n => {
          const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return n === hit || n.contains(hit);
        })), true, 'Reply/Report/chip centers remain tappable while menu is open');
        if (width === 390) assert.equal(await menu.locator('button').evaluateAll(nodes => nodes.every(n => n.getBoundingClientRect().height >= 44 && n.getBoundingClientRect().width >= 44)), true);
        await page.screenshot({ path: `${process.env.DISCUSSION_EVIDENCE_DIR || '/tmp'}/${name}-${locale}-${width}-toolbar-${state}.png` });
        // A synthetic visible viewport isolates zoom/keyboard offset geometry without real-device access.
        await page.evaluate(() => {
          Object.defineProperty(window, 'visualViewport', { configurable: true, value: { offsetLeft: 12, offsetTop: 80, width: 300, height: 280 } });
          window.dispatchEvent(new Event('resize'));
        });
        assert.equal(await menu.evaluate(n => { const r = n.getBoundingClientRect(); return r.left >= 20 && r.right <= 304 && r.top >= 88 && r.bottom <= 352; }), true, 'Floating menu clamps to visible viewport offsets and size');
        assert.equal(await menu.locator('button').evaluateAll(nodes => nodes.every(n => { const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return n === hit || n.contains(hit); })), true);
        await page.keyboard.press('Escape'); await page.context().close(); groups++;
      }
      if (process.env.KT_REACTION_LAYOUT_ONLY !== 'true') {
        page = await open(browser, locale, width, { legacy: true }); assert.equal(await page.locator('.kt-discussion-reactions').count(), 0);
        await draft(page); await page.locator('.kt-discussion-submit').click(); await page.waitForFunction(() => window.commentPosts.length === 1); await page.context().close(); groups++;
      }
    }
    console.log(`KT ${name}: PASS ${groups} bilingual desktop/mobile reaction scenario groups`);
  } finally { await browser.close(); }
}
async function chooseUnknown(page, n, type) { await page.locator(add(n)).click(); await page.locator(option(n, type)).click(); }
(async () => { await transportChecks(); await run('Chromium', chromium, process.env.KT_CHROMIUM_EXECUTABLE || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'); await run('WebKit', webkit, process.env.KT_WEBKIT_EXECUTABLE || '/Users/yangtao/Library/Caches/ms-playwright/webkit-2365/pw_run.sh'); })().catch(error => { console.error(error); process.exitCode = 1; });
