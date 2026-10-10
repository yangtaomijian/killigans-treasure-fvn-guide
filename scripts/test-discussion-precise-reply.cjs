'use strict';
// Local synthetic exact-target tests. Block all non-local browser requests.
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const base = process.env.GUIDE_BASE_URL;
assert(base && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const article = n => `#kt-comment-${id(n)}`;
const reply = n => `${article(n)} > .kt-discussion-actions > .kt-discussion-reply-action`;
const body = '#kt-discussion-new-body';
const current = 'Public v0.57a', historical = 'Public v0.56';
async function settled(page) { await page.waitForFunction(() => document.querySelector('.kt-discussion-comments')?.getAttribute('aria-busy') === 'false'); }
async function ready(page) { await page.waitForFunction(() => !document.querySelector('.kt-discussion-submit').disabled); }
async function open(browser, locale, width, suffix = '') {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.addInitScript(({ current, historical }) => {
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    window.posts = []; window.reads = []; window.targetStatus = 'published'; window.postMode = 'unknown'; window.shifted = false; window.locked = false; window.omitTarget = false; window.rootReplyable = true; window.failNextRead = false;
    window.turnstile = { render(slot, options) { queueMicrotask(() => options.callback('local-token')); return 1; }, remove() {} };
    const row = (n, rootId = null, version = current, scope = 'version', status = 'published', targetId = null, targetStatus = 'published') => ({
      id: id(n), parentCommentId: rootId === null ? null : id(rootId), replyToCommentId: targetId === null ? null : id(targetId),
      replyTo: targetId === null ? null : { id: id(targetId), status: targetStatus, displayName: 'Same', authorKind: 'guest' },
      status, canReply: status === 'published' && !window.locked, displayName: 'Same', authorKind: 'guest', body: `Synthetic ${n}`,
      guideVersion: version, discussionScope: scope, pageHash: null, pinnedAt: null, createdAt: '2026-10-10T00:00:00Z', replies: [],
    });
    const tree = (rootId, version = current, scope = 'version') => {
      const root = row(rootId, null, version, scope); root.canReply = window.rootReplyable && !window.locked;
      root.replies = [row(rootId + 1, rootId, version, scope, window.targetStatus, rootId),
        row(rootId + 2, rootId, version, scope, 'published', rootId + 1, window.targetStatus),
        row(rootId + 3, rootId, version, scope, 'published', rootId + 2), row(rootId + 4, rootId, version, scope)];
      root.replies.push(row(rootId + 5, rootId, version, scope, 'hidden'));
      root.replies.push(row(rootId + 6, rootId, version, scope, 'published', rootId + 5, 'hidden'));
      root.replies.push(row(rootId + 7, rootId, version, scope, 'deleted'));
      root.replies.push(row(rootId + 8, rootId, version, scope, 'published', rootId + 7, 'deleted'));
      root.replies.push({ ...row(rootId + 9, rootId, version, scope), canReply: false });
      if (window.omitTarget) { root.replies = root.replies.filter(reply => reply.id !== id(rootId + 1)); root.replies.find(reply => reply.id === id(rootId + 2)).replyTo = null; }
      return root;
    };
    const transport = { fixtureCanWrite: true, turnstileSitekey: '0xFixture', async readDiscussion(request) {
      window.reads.push({ ...request });
      if (window.failNextRead) { window.failNextRead = false; throw Error('Synthetic refresh failure'); }
      const version = request.guideVersion; let roots, nextCursor;
      if (!request.cursor) { roots = window.shifted ? [row(50)] : [tree(version === historical ? 101 : 1, version)]; nextCursor = 'c1'; }
      else if (window.shifted && request.cursor === 'c1') { roots = [tree(version === historical ? 101 : 1, version)]; nextCursor = 'c2'; }
      else { roots = [tree(201, version)]; nextCursor = null; }
      const persistent = request.section === 'persistent' && request.cursor ? [tree(401, historical, 'persistent')] : [tree(301, historical, 'persistent')];
      return { ok: true, thread: { id: 'local', status: window.locked ? 'locked' : 'open' },
        currentVersion: { guideVersion: version, comments: roots, nextCursor }, persistent: { comments: persistent, nextCursor: request.section === 'persistent' && request.cursor ? null : 'p1' }, earlierVersions: [{ guideVersion: historical, commentCount: 10 }] };
    }, async postComment(input) {
      window.posts.push({ ...input });
      if (window.postMode === 'success') return { ok: true, httpStatus: 201, commentId: null };
      const error = Error('Local synthetic refusal');
      if (['invalid', 'root-invalid'].includes(window.postMode)) { error.code = 'VALIDATION_FAILED'; error.outcomeUnknown = false; error.fieldErrors = window.postMode === 'root-invalid' ? { parentCommentId: 'NOT_REPLYABLE' } : { replyToCommentId: 'NOT_REPLYABLE' }; }
      else error.outcomeUnknown = true;
      throw error;
    } };
    Object.defineProperty(window, '__ktDiscussionFixtureTransport', { get: () => transport, set() {} });
  }, { current, historical });
  await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}guide/redroot.html${suffix}`);
  await page.locator('.kt-discussion-refresh').waitFor(); await settled(page); return page;
}
async function run(name, engine, executablePath) {
  const browser = await engine.launch({ headless: true, executablePath }); let cases = 0;
  try {
    for (const locale of ['zh-CN', 'en']) for (const width of [390, 1440]) {
      let page = await open(browser, locale, width);
      for (const n of [1, 2, 3, 4, 5]) assert.equal(await page.locator(reply(n)).count(), 1);
      for (const n of [6, 8, 10]) assert.equal(await page.locator(reply(n)).count(), 0);
      assert.equal(await page.locator(`${article(5)} > .kt-discussion-reply-reference`).count(), 0, 'Historical unknown must have no invented marker');
      for (const n of [2, 3, 4]) {
        const marker = page.locator(`${article(n)} > .kt-discussion-reply-reference`);
        assert.equal(await marker.getAttribute('data-reply-to-comment-id'), id(n - 1));
        await marker.click(); await page.waitForFunction(id => document.activeElement?.id === 'kt-comment-' + id, id(n - 1));
      }
      const positions = await page.locator('.kt-discussion-comments .kt-discussion-reply').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().left));
      assert(positions.every(x => Math.abs(x - positions[0]) < 1), 'Reply chains stay single-level');
      for (const n of [7, 9]) {
        const marker = page.locator(`${article(n)} > .kt-discussion-reply-reference`);
        assert.equal(await marker.evaluate(n => n.tagName), 'A'); assert(!(await marker.innerText()).includes('Same'));
        await marker.click(); await page.waitForFunction(id => document.activeElement?.id === 'kt-comment-' + id, id(n - 1));
      }
      assert.equal(await page.locator(article(8) + ' > .kt-discussion-tombstone').count(), 1, 'Referenced deleted target has a privacy-safe tombstone');
      await page.locator(reply(2)).click(); await page.locator(body).fill('Draft for B'); await ready(page);
      assert.equal(await page.locator('.kt-discussion-composer-target').getAttribute('data-reply-to-comment-id'), id(2));
      await page.locator(reply(3)).click(); await page.locator(body).fill('Draft for C'); await ready(page);
      await page.locator(reply(2)).click(); assert.equal(await page.locator(body).inputValue(), 'Draft for B');
      await page.locator('.kt-discussion-submit').click(); await page.locator('.kt-discussion-confirm-unposted').waitFor();
      assert.equal(await page.evaluate(() => window.posts.at(-1).parentCommentId), id(1));
      assert.equal(await page.evaluate(() => window.posts.at(-1).replyToCommentId), id(2));
      await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert(await page.locator('.kt-discussion-confirm-unposted').isVisible()); assert(await page.locator('.kt-discussion-submit').isDisabled());
      await page.evaluate(() => { window.targetStatus = 'hidden'; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert(await page.locator('.kt-discussion-confirm-unposted').isDisabled());
      await page.locator('.kt-discussion-confirm-unposted').evaluate(n => n.click()); assert.equal(await page.evaluate(() => window.posts.length), 1);
      await page.evaluate(() => { window.targetStatus = 'published'; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert(await page.locator('.kt-discussion-submit').isDisabled());
      await page.locator('.kt-discussion-confirm-unposted').click(); await ready(page);
      await page.evaluate(() => { window.postMode = 'invalid'; }); await page.locator('.kt-discussion-submit').click(); await page.waitForFunction(() => document.querySelector('.kt-discussion-submit').disabled);
      assert.equal(await page.locator(body).inputValue(), 'Draft for B');
      assert((await page.locator('.kt-discussion-form-status').innerText()).includes(locale === 'en' ? 'reply target is unavailable' : '回复对象当前不可用'));
      await page.evaluate(() => { window.targetStatus = 'hidden'; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert.equal(await page.locator(body).inputValue(), 'Draft for B'); assert(await page.locator('.kt-discussion-submit').isDisabled());
      assert(!(await page.locator('.kt-discussion-composer-target').innerText()).includes('Same'));
      const count = await page.evaluate(() => window.posts.length);
      await page.locator('.kt-discussion-composer').evaluate(n => n.requestSubmit()); assert.equal(await page.evaluate(() => window.posts.length), count);
      await page.evaluate(() => { window.targetStatus = 'deleted'; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert.equal(await page.locator(body).inputValue(), 'Draft for B'); assert(await page.locator('.kt-discussion-submit').isDisabled());
      await page.evaluate(() => { window.omitTarget = true; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert.equal(await page.locator(body).inputValue(), 'Draft for B'); assert(await page.locator('.kt-discussion-submit').isDisabled());
      assert.equal(await page.locator(`${article(3)} > .kt-discussion-reply-reference`).evaluate(n => n.tagName), 'SPAN');
      await page.evaluate(() => { window.omitTarget = false; window.rootReplyable = true; window.targetStatus = 'published'; }); await page.locator('.kt-discussion-refresh').click(); await settled(page); await ready(page);
      assert.equal(await page.locator(body).inputValue(), 'Draft for B');
      await page.locator(reply(3)).click(); assert.equal(await page.locator(body).inputValue(), 'Draft for C'); await ready(page);
      await page.locator('.kt-discussion-submit').click(); await page.waitForFunction(() => document.querySelector('.kt-discussion-submit').disabled);
      assert.equal(await page.evaluate(() => window.posts.at(-1).parentCommentId), id(1)); assert.equal(await page.evaluate(() => window.posts.at(-1).replyToCommentId), id(3));
      await page.evaluate(() => { window.rootReplyable = false; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert.equal(await page.locator(reply(2)).count(), 0, 'Child canReply cannot bypass false root canReply');
      assert.equal(await page.locator(reply(3)).count(), 0); assert(await page.locator('.kt-discussion-submit').isDisabled());
      assert.equal(await page.locator(body).inputValue(), 'Draft for C');
      await page.evaluate(() => { window.rootReplyable = true; window.locked = true; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert(await page.locator('.kt-discussion-composer-host').isVisible()); assert(await page.locator('.kt-discussion-submit').isDisabled());
      assert.equal(await page.locator(body).inputValue(), 'Draft for C');
      await page.evaluate(() => { window.locked = false; }); await page.locator('.kt-discussion-refresh').click(); await settled(page); await ready(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `${process.env.DISCUSSION_EVIDENCE_DIR || '/tmp'}/${name}-${locale}-${width}-precise.png` });
      await page.close(); cases++;
      page = await open(browser, locale, width);
      await page.locator(reply(2)).click(); await page.locator(body).fill('Only target rejected'); await ready(page);
      await page.evaluate(() => { window.postMode = 'invalid'; }); await page.locator('.kt-discussion-submit').click();
      await page.waitForFunction(() => document.querySelector('.kt-discussion-submit').disabled);
      assert.equal(await page.locator(reply(2)).count(), 0); assert.equal(await page.locator(reply(3)).count(), 1, 'Target refusal must preserve eligible sibling');
      assert(!(await page.locator('.kt-discussion-composer-target').innerText()).includes('Same'));
      await page.locator(reply(3)).click(); await page.locator('#kt-discussion-name').fill('Saved name'); await page.locator(body).fill('Root rejection draft'); await ready(page);
      await page.evaluate(() => { window.postMode = 'root-invalid'; }); await page.locator('.kt-discussion-submit').click();
      await page.waitForFunction(() => document.querySelector('.kt-discussion-submit').disabled);
      assert.equal(await page.locator(`${article(1)} .kt-discussion-reply-action`).count(), 0, 'Root refusal must revoke all sibling reply actions');
      assert.equal(await page.locator(reply(302)).count(), 1, 'Other root remains replyable');
      assert(await page.locator('.kt-discussion-composer-host').isVisible());
      assert.equal(await page.locator(body).inputValue(), 'Root rejection draft'); assert.equal(await page.locator('#kt-discussion-name').inputValue(), 'Saved name');
      assert(!(await page.locator('.kt-discussion-composer-target').innerText()).includes('Same'));
      const rejectedPosts = await page.evaluate(() => window.posts.length);
      await page.locator('.kt-discussion-composer').evaluate(n => n.requestSubmit()); assert.equal(await page.evaluate(() => window.posts.length), rejectedPosts);
      await page.evaluate(() => { window.failNextRead = true; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert.equal(await page.locator(`${article(1)} .kt-discussion-reply-action`).count(), 0);
      assert(await page.locator('.kt-discussion-composer-host').isVisible()); assert(await page.locator('.kt-discussion-submit').isDisabled());
      assert.equal(await page.locator(body).inputValue(), 'Root rejection draft'); assert(!(await page.locator('.kt-discussion-composer-target').innerText()).includes('Same'));
      assert.equal(await page.locator('.kt-discussion-composer-target').getAttribute('data-reply-to-comment-id'), id(3));
      await page.locator(body).focus(); await page.locator(body).evaluate(n => n.select());
      assert.equal(await page.locator(body).evaluate(n => n.value.slice(n.selectionStart, n.selectionEnd)), 'Root rejection draft', 'Visible draft remains selectable/copyable');
      await page.locator('.kt-discussion-composer').evaluate(n => n.requestSubmit()); assert.equal(await page.evaluate(() => window.posts.length), rejectedPosts);
      await page.locator('.kt-discussion-status button').click(); await settled(page); await ready(page);
      assert.equal(await page.locator('.kt-discussion-composer-target').getAttribute('data-reply-to-comment-id'), id(3));
      assert.equal(await page.locator(body).inputValue(), 'Root rejection draft'); assert.equal(await page.evaluate(() => window.posts.length), rejectedPosts);
      await page.close(); cases++;
      page = await open(browser, locale, width);
      await page.locator('.kt-discussion-comments + button').click(); await settled(page);
      await page.locator(reply(202)).click(); await page.locator(body).fill('Tail child draft'); await ready(page);
      await page.evaluate(() => { window.shifted = true; }); await page.locator('.kt-discussion-refresh').click(); await settled(page);
      assert.equal(await page.locator('.kt-discussion-composer').evaluate(n => n.closest('article').dataset.commentId), id(202));
      assert.equal(await page.locator(body).inputValue(), 'Tail child draft');
      assert.equal(await page.evaluate(() => window.reads.filter(r => r.section !== 'persistent').at(-1).cursor), 'c2');
      await page.close(); cases++;
      for (const [suffix, target, root] of [[`?discussionVersion=${encodeURIComponent(historical)}`, 102, 101], ['?discussionScope=persistent', 302, 301]]) {
        page = await open(browser, locale, width, suffix);
        await page.locator(reply(target)).waitFor(); await page.locator(reply(target)).click(); await page.locator(body).fill('Version/scope child draft'); await ready(page);
        await page.locator('.kt-discussion-refresh').click(); await settled(page); assert.equal(await page.locator(body).inputValue(), 'Version/scope child draft');
        await page.locator('.kt-discussion-submit').click(); await page.locator('.kt-discussion-confirm-unposted').waitFor();
        assert.equal(await page.evaluate(() => window.posts.at(-1).parentCommentId), id(root)); assert.equal(await page.evaluate(() => window.posts.at(-1).replyToCommentId), id(target));
        await page.close(); cases++;
      }
    }
    console.log(`KT ${name}: PASS ${cases} precise-target bilingual desktop/mobile scenario groups`);
  } finally { await browser.close(); }
}
(async () => {
  await run('Chromium', chromium, process.env.KT_CHROMIUM_EXECUTABLE || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  await run('WebKit', webkit, process.env.KT_WEBKIT_EXECUTABLE || '/Users/yangtao/Library/Caches/ms-playwright/webkit-2365/pw_run.sh');
})().catch(error => { console.error(error); process.exitCode = 1; });
