'use strict';
// Isolated synthetic UI exercise: no production requests, email, accounts or writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const asset = suffix => fs.readFileSync(path.join(root, 'assets', `kt-discussion-${suffix}.html`), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const current = 'Public v0.57a', historical = 'Public v0.56';
  window.reads = []; window.posts = []; window.summaries = []; window.locked = false;
  window.turnstile = { render(slot, options) { queueMicrotask(() => options.callback('synthetic-only')); return 1; }, remove() {} };
  const row = (n, publicationLocale, version = current, scope = 'versioned') => ({ id: id(n), publicationLocale,
    status: 'published', canReply: !window.locked, displayName: `Synthetic ${n}`, authorKind: 'guest',
    body: publicationLocale === 'en' ? 'Original English content' : '保留原始中文内容',
    guideVersion: version, discussionScope: scope, createdAt: '2026-10-12T12:00:00Z',
    parentCommentId: null, replyToCommentId: null, pageHash: '#original-section', pinnedAt: null, replies: [] });
  window.__ktDiscussionFixtureTransport = {
    fixtureCanWrite: true, turnstileSitekey: '0xSynthetic',
    async readDiscussion(request) {
      window.reads.push({ ...request });
      const english = row(1, 'en', request.guideVersion); english.pinnedAt = '2026-10-12T12:00:00Z'; english.authorKind = 'maintainer';
      english.replies = [{ ...row(3, 'zh-CN', request.guideVersion), parentCommentId: id(1), replyToCommentId: id(1),
        replyTo: { id: id(1), status: 'published', displayName: english.displayName, authorKind: 'maintainer' }, pageHash: null }];
      const legacy = row(4); delete legacy.publicationLocale;
      const comments = request.cursor ? [row(2, 'zh-CN', request.guideVersion), legacy] : [english];
      return { ok: true, thread: { id: 'synthetic-shared', status: window.locked ? 'locked' : 'open' },
        currentVersion: { guideVersion: request.guideVersion, comments, nextCursor: request.cursor ? null : 'c1' },
        persistent: { comments: [row(5, 'zh-CN', historical, 'persistent')], nextCursor: null },
        earlierVersions: [{ guideVersion: historical, commentCount: 2 }] };
    },
    async postComment(input) {
      window.posts.push({ ...input });
      const e = Error('Synthetic definite failure'); e.code = 'SERVICE_UNAVAILABLE'; e.outcomeUnknown = false; throw e;
    },
    async readSummary(input) {
      window.summaries.push({ ...input });
      const en = input.locale === 'en';
      return { ok: true, discussions: [1, 2].map(n => ({ rootCommentId: id(n), locale: n === 1 ? 'en' : 'zh-CN',
        pageTitle: en ? 'Redroot' : '红根镇', publicUrl: `https://killigans-treasure.carambi.com/${n === 1 ? 'en/' : ''}guide/redroot.html#kt-comment-${id(n)}`,
        guideVersion: current, discussionScope: 'versioned', replyCount: 1, summary: n === 1 ? 'Original English content' : '保留原始中文内容', lastActivityAt: '2026-10-12T12:00:00Z' })), nextCursor: null };
    },
  };
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const en = url.pathname.startsWith('/en/'), hub = url.pathname.endsWith('/discussions.html');
  if (!url.pathname.endsWith('/guide/redroot.html') && !hub) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="${en ? 'en' : 'zh-CN'}"><head><meta charset="utf-8">${asset('config')}</head><body>
    <div id="quarto-content"><main id="quarto-document-content"><h1>Local synthetic Discussion</h1><p id="original-section">Section</p>${hub ? '<div id="kt-discussion-hub"></div>' : ''}</main></div>
    <script>(${fixture.toString()})();</script>${asset('runtime')}${hub ? asset('hub') : asset('ui')}</body></html>`);
});
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let checks = 0;
  try {
    for (const [name, launcher] of [['Chromium', chromium], ['WebKit', webkit]]) {
      const executablePath = process.env[`DISCUSSION_${name.toUpperCase()}_EXECUTABLE`];
      const browser = await launcher.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
      try {
        for (const locale of ['en', 'zh-CN']) for (const width of [390, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          const errors = []; page.on('pageerror', e => errors.push(e.message));
          let remoteRequests = 0;
          await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : (remoteRequests++, route.abort()));
          const pagePath = `${locale === 'en' ? '/en' : ''}/guide/redroot.html`;
          await page.goto(base + pagePath);
          const settled = () => page.waitForFunction(() => document.querySelector('.kt-discussion-comments')?.getAttribute('aria-busy') === 'false');
          await settled();
          const find = n => page.locator(`#kt-comment-${id(n)}`);
          assert.equal(await find(1).locator('> .kt-discussion-body').innerText(), 'Original English content');
          assert.equal(await find(3).locator('> .kt-discussion-body').innerText(), '保留原始中文内容');
          assert.equal(await find(1).locator('> .kt-discussion-actions > .kt-discussion-fragment').getAttribute('href'), '/en/guide/redroot.html#original-section');
          assert.equal(await find(5).locator('> .kt-discussion-actions > .kt-discussion-fragment').getAttribute('href'), '/guide/redroot.html#original-section');
          assert.equal(await page.locator('#kt-discussion-title').innerText(), locale === 'en' ? 'Discussion' : '讨论');
          assert.equal(await page.evaluate(() => window.reads[0].locale), locale);
          await page.locator('.kt-discussion-comments + button').click(); await settled();
          assert.equal(await find(2).locator('> .kt-discussion-actions > .kt-discussion-fragment').getAttribute('href'), '/guide/redroot.html#original-section');
          assert.equal(await find(4).locator('> .kt-discussion-actions > .kt-discussion-fragment').getAttribute('href'), pagePath + '#original-section');
          await find(3).locator('> .kt-discussion-reply-reference').click();
          await page.waitForFunction(expected => document.activeElement?.id === expected, `kt-comment-${id(1)}`);
          assert.equal(new URL(page.url()).pathname, pagePath, 'Precise reply navigation retains UI language');
          await find(3).locator('> .kt-discussion-actions > .kt-discussion-reply-action').click();
          await page.locator('#kt-discussion-new-body').fill('Synthetic cross-language reply draft');
          await page.waitForFunction(() => !document.querySelector('.kt-discussion-submit').disabled);
          await page.locator('.kt-discussion-submit').click();
          await page.waitForFunction(() => window.posts.length === 1 && !document.querySelector('.kt-discussion-submit').disabled);
          const posted = await page.evaluate(() => window.posts[0]);
          assert.equal(posted.locale, locale); assert.equal(posted.parentCommentId, id(1)); assert.equal(posted.replyToCommentId, id(3));
          assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Synthetic cross-language reply draft');
          await page.evaluate(() => { window.locked = true; }); await page.locator('.kt-discussion-refresh').click(); await settled();
          assert.equal(await page.locator('.kt-discussion-submit').isDisabled(), true);
          assert.equal(await page.locator('.kt-discussion-reply-action').count(), 0);
          assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Synthetic cross-language reply draft');
          await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}discussions.html`);
          await page.waitForFunction(() => window.summaries.length && document.querySelectorAll('#discussions article').length === 2);
          assert.equal(await page.locator('#language').count(), 0);
          assert.equal(await page.evaluate(() => window.summaries[0].locale), locale);
          assert.deepEqual(await page.locator('#discussions .summary').allTextContents(), ['Original English content', '保留原始中文内容']);
          assert.deepEqual(await page.locator('#discussions h2').allTextContents(), [locale === 'en' ? 'Redroot' : '红根镇', locale === 'en' ? 'Redroot' : '红根镇']);
          assert.equal(await page.locator('#discussions a').first().getAttribute('href'), `https://killigans-treasure.carambi.com/en/guide/redroot.html#kt-comment-${id(1)}`);
          assert.deepEqual(errors, []); assert.equal(remoteRequests, 0);
          await page.close(); checks++;
        }
      } finally { await browser.close(); }
    }
    console.log(`KT shared locales UI: ${checks} Chromium/WebKit × locale × viewport cases PASS; original text/anchors, precise target, draft/lock, pagination, persistent and summary; zero remote requests`);
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
