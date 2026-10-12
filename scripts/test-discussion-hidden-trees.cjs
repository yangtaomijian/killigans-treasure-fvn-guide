'use strict';
// Complete-root synthetic responses only. No production reads, writes, mail, or accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = process.env.GUIDE_ROOT || path.resolve(__dirname, '..');
const prefix = ['pw', 'dw', 'kt'].find(p => fs.existsSync(path.join(root, 'assets', `${p}-discussion-ui.html`)));
assert(prefix, 'Run inside a guide site or set GUIDE_ROOT');
const config = {
  pw: { route: 'guide/route-overview.html', current: 'b0.85', historical: 'b0.7' },
  dw: { route: 'guide/choices.html', current: 'Public 14.6', historical: 'Public 14.5' },
  kt: { route: 'guide/redroot.html', current: 'Public v0.57a', historical: 'Public v0.56' },
}[prefix];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function installFixture({ prefix, current, historical, scenario }) {
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  window.fixtureMode = scenario;
  window.fixtureReads = []; window.fixtureWrites = []; window.fixtureRaw = [];
  const row = (n, status = 'published', parent = null, target = null, version = current, scope = 'versioned') => ({
    id: id(n), status, authorKind: 'guest', displayName: status === 'published' ? 'Synthetic reader' : null,
    body: status === 'published' ? `Visible synthetic ${n}` : null, canReply: status === 'published',
    parentCommentId: parent === null ? null : id(parent), replyToCommentId: target === null ? null : id(target),
    replyTo: target === null ? null : { id: id(target), status: 'hidden', displayName: null, authorKind: null },
    guideVersion: version, discussionScope: scope, createdAt: '2026-10-12T00:00:00Z',
    pinnedAt: null, pageHash: null, replies: [],
  });
  const tree = (n, status, replies = [], version = current, scope = 'versioned') => {
    const r = row(n, status, null, null, version, scope); r.replies = replies;
    const targets = new Map([r, ...replies].map(c => [c.id, c]));
    for (const c of replies) {
      c.parentCommentId = r.id;
      if (c.replyToCommentId) {
        const target = targets.get(c.replyToCommentId);
        c.replyTo = target ? { id: target.id, status: target.status,
          displayName: target.status === 'published' ? target.displayName : null,
          authorKind: target.status === 'published' ? target.authorKind : null } : null;
      }
    }
    return r;
  };
  const dead = n => tree(n, 'hidden', [row(n + 1, 'hidden', n, n), row(n + 2, 'deleted', n, n + 1)]);
  const mixed = () => [dead(1), tree(10, 'deleted', [row(11, 'hidden', 10)]),
    tree(20, 'hidden', [row(21, 'published', 20, 20), row(22, 'hidden', 20),
      row(23, 'deleted', 20, 20), row(24, 'published', 20, 23), row(25, 'published', 20, 24)]),
    tree(30, 'published', [row(31, 'hidden', 30), row(32, 'deleted', 30), row(33, 'published', 30, 30)]),
    tree(40, 'deleted', [row(41, 'published', 40, 40)])];
  const blockedWrite = async () => { window.fixtureWrites.push('UNEXPECTED_WRITE'); throw Error('Synthetic fixture forbids writes'); };
  window[`__${prefix}DiscussionFixtureTransport`] = {
    fixtureCanWrite: true,
    async readDiscussion(request) {
      window.fixtureReads.push({ ...request });
      let roots = [], nextCursor = null, persistent = { comments: [], nextCursor: null }, earlierVersions = [];
      const mode = window.fixtureMode;
      if (mode === 'mixed') roots = mixed();
      if (mode === 'all-hidden') roots = [dead(1), tree(10, 'deleted', [row(11, 'hidden', 10)])];
      if (mode === 'revoked') roots = [tree(20, 'hidden', [row(21, 'hidden', 20, 20)])];
      if (['paging', 'all-pages-hidden', 'direct-hidden', 'direct-hidden-root'].includes(mode)) {
        roots = request.cursor === 'c2' ? [dead(20)] : request.cursor === 'c1' ? [dead(1), dead(10)] : [dead(1)];
        nextCursor = request.cursor === 'c2' ? null : request.cursor === 'c1' ? 'c2' : 'c1';
        if (mode === 'paging' && request.cursor === 'c2') {
          // Replies are NOT independently paginated: public content beyond row 50 must keep the tree.
          roots = [dead(10), tree(20, 'hidden', Array.from({ length: 60 }, (_, i) =>
            row(201 + i, i === 59 ? 'published' : i === 58 ? 'deleted' : 'hidden', 20, i === 59 ? 259 : 20)))];
        }
      }
      if (['persistent', 'persistent-empty', 'direct-persistent'].includes(mode)) {
        roots = [dead(1)];
        const last = request.section === 'persistent' && request.cursor === 'p1';
        persistent = { comments: last && mode !== 'persistent-empty'
          ? [tree(80, 'hidden', [row(81, 'published', 80, 80, current, 'persistent')], historical, 'persistent')]
          : [tree(last ? 80 : 70, 'hidden', [], historical, 'persistent')], nextCursor: last ? null : 'p1' };
      }
      if (['historical', 'historical-empty', 'direct-historical'].includes(mode)) {
        earlierVersions = [{ guideVersion: historical, commentCount: 999 }];
        roots = [dead(1)];
        if (request.guideVersion === historical) {
          roots = request.cursor === 'h1'
            ? [tree(52, 'hidden', mode === 'historical-empty' ? [] : [row(53, 'published', 52, 52, historical)], historical)]
            : [tree(50, 'hidden', [row(51, 'hidden', 50, 50, historical)], historical)];
          nextCursor = request.cursor ? null : 'h1';
        }
      }
      const result = { ok: true, thread: { id: 'synthetic-only', status: 'open' },
        currentVersion: { guideVersion: request.guideVersion, comments: roots, nextCursor }, persistent, earlierVersions };
      const before = JSON.stringify(result);
      window.fixtureRaw.push({ value: result, before });
      return result;
    }, postComment: blockedWrite, sendFeedback: blockedWrite, enrollSubscription: blockedWrite,
    readSubscriptionStatus: blockedWrite, setReaction: blockedWrite,
  };
}
function html(url) {
  const en = url.pathname.startsWith('/en/');
  const assetRoot = prefix === 'pw' && en && fs.existsSync(path.join(root, 'site-en/assets'))
    ? path.join(root, 'site-en/assets') : path.join(root, 'assets');
  const asset = suffix => fs.readFileSync(path.join(assetRoot, suffix === 'css' ? `${prefix}-discussion.css` : `${prefix}-discussion-${suffix}`), 'utf8');
  const fixture = `<script>(${installFixture.toString()})(${JSON.stringify({ prefix, ...config, scenario: url.searchParams.get('fixture') || 'mixed' })});</script>`;
  return `<!doctype html><html lang="${en ? 'en' : 'zh-CN'}"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:">
    ${asset('config.html')}<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:20px;font:16px system-ui} main{max-width:900px} ${asset('css')}</style></head><body>
    <div id="quarto-content"><main id="quarto-document-content"><h1>${prefix.toUpperCase()} — local synthetic hidden-tree preview</h1>
    <p>No live data, mail, writes or browser accounts. Fixture: ${url.searchParams.get('fixture') || 'mixed'}</p><p id="fixture-section">Guide context.</p></main></div>
    ${fixture}${asset('runtime.html')}${asset('ui.html')}</body></html>`;
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (![ '/' + config.route, '/en/' + config.route ].includes(url.pathname)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html(url));
});
async function run() {
  await new Promise(resolve => server.listen(Number(process.env.PREVIEW_PORT || 0), '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  if (process.argv.includes('--preview')) {
    console.log(`${prefix} local-only synthetic preview: ${base}/${config.route}?fixture=mixed`);
    console.log(`English: ${base}/en/${config.route}?fixture=all-hidden; cases: mixed, all-hidden, paging, all-pages-hidden, persistent, persistent-empty, historical, historical-empty`);
    return;
  }
  const { chromium, webkit } = require('playwright');
  let checks = 0;
  const results = [];
  try {
    for (const [engine, launcher] of [['Chromium', chromium], ['WebKit', webkit]]) {
      const executablePath = process.env[`DISCUSSION_${engine.toUpperCase()}_EXECUTABLE`];
      const browser = await launcher.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
      try {
        for (const locale of ['en', 'zh-CN']) {
          const width = locale === 'en' ? 1440 : 390;
          for (const scenario of ['mixed', 'all-hidden', 'paging', 'all-pages-hidden', 'direct-hidden', 'direct-hidden-root',
            'persistent', 'persistent-empty', 'direct-persistent', 'historical', 'historical-empty', 'direct-historical']) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            const errors = []; page.on('pageerror', error => errors.push(error.message));
            let remoteRequests = 0;
            await page.route('**/*', route => {
              if (new URL(route.request().url()).origin === base) return route.continue();
              remoteRequests++; return route.abort();
            });
            const find = n => page.locator(`#${prefix}-comment-${id(n)}`);
            const more = page.locator(`.${prefix}-discussion-comments + button`);
            const persistentMore = page.locator(`.${prefix}-discussion-persistent > button`);
            const empty = page.locator(`.${prefix}-discussion-empty`);
            const settled = () => page.waitForFunction(p => document.querySelector(`.${p}-discussion-comments`)?.getAttribute('aria-busy') === 'false', prefix);
            const url = new URL(`${base}/${locale === 'en' ? 'en/' : ''}${config.route}`); url.searchParams.set('fixture', scenario);
            if (scenario === 'direct-hidden' || scenario === 'direct-hidden-root') url.hash = `${prefix}-comment-${id(scenario === 'direct-hidden-root' ? 1 : 2)}`;
            if (scenario === 'direct-persistent') { url.searchParams.set('discussionScope', 'persistent'); url.hash = `${prefix}-comment-${id(81)}`; }
            if (scenario === 'direct-historical') { url.searchParams.set('discussionVersion', config.historical); url.hash = `${prefix}-comment-${id(53)}`; }
            await page.goto(url.toString()); await settled();
            if (scenario === 'mixed') {
              for (const n of [1, 2, 3, 10, 11, 32]) assert.equal(await find(n).count(), 0, `${prefix} removed ${n}`);
              for (const n of [20, 21, 22, 23, 24, 25, 30, 31, 33, 40, 41]) assert.equal(await find(n).count(), 1, `${prefix} preserved ${n}`);
              const reference = find(24).locator(`[data-reply-to-comment-id="${id(23)}"]`);
              assert((await reference.getAttribute('href')).includes(`${prefix}-comment-${id(23)}`));
              await reference.click(); await settled();
              await page.waitForFunction(expected => document.activeElement?.id === expected, `${prefix}-comment-${id(23)}`);
              assert.equal(await find(23).locator('strong').count(), 0, 'Anonymous deleted reference');
              await page.evaluate(() => { window.fixtureMode = 'revoked'; });
              await page.locator(`.${prefix}-discussion-refresh`).click(); await settled();
              assert.equal(await find(20).count(), 0, 'Refresh removes tree after last published reply becomes hidden');
              assert.equal(await empty.count(), 1);
            } else if (scenario === 'paging' || scenario === 'all-pages-hidden') {
              assert.equal(await page.locator('article[data-comment-id]').count(), 0);
              assert.equal(await empty.count(), 0, 'Do not show final empty state while raw cursor remains');
              assert(await more.isVisible()); await more.click(); await settled();
              assert.equal(await empty.count(), 0); assert(await more.isVisible());
              await more.click(); await settled(); assert.equal(await more.isVisible(), false);
              if (scenario === 'paging') {
                assert.equal(await find(20).count(), 1); assert.equal(await find(260).count(), 1);
                assert.equal(await find(259).count(), 1, 'Retain exact target for far public reply');
                assert.equal(await empty.count(), 0); assert.equal(await find(1).count(), 0);
              } else { assert.equal(await empty.count(), 1); assert.equal(await page.locator('article[data-comment-id]').count(), 0); }
            } else if (scenario === 'all-hidden') {
              assert.equal(await page.locator('article[data-comment-id]').count(), 0); assert.equal(await empty.count(), 1);
            } else if (scenario === 'direct-hidden' || scenario === 'direct-hidden-root') {
              await page.waitForFunction(p => document.querySelector(`.${p}-discussion-post-notice`)?.textContent.includes(document.documentElement.lang === 'en' ? 'unavailable' : '不可用'), prefix);
              assert.equal(await find(1).count(), 0); assert.equal(await find(2).count(), 0);
              assert.equal(await empty.count(), 1); assert.equal(await more.isVisible(), false);
            } else if (scenario.startsWith('persistent') || scenario === 'direct-persistent') {
              if (scenario === 'direct-persistent') {
                await page.waitForFunction(expected => document.activeElement?.id === expected, `${prefix}-comment-${id(81)}`);
              } else { assert(await persistentMore.isVisible()); await persistentMore.click(); await settled(); }
              if (scenario === 'persistent-empty') assert.equal(await page.locator(`.${prefix}-discussion-persistent`).isVisible(), false);
              else { assert.equal(await find(80).count(), 1); assert.equal(await find(81).count(), 1); assert.equal(await find(70).count(), 0); }
            } else {
              const history = page.locator(`.${prefix}-discussion-version-buttons button`).filter({ hasText: config.historical });
              if (scenario === 'direct-historical') {
                await page.waitForFunction(expected => document.activeElement?.id === expected, `${prefix}-comment-${id(53)}`);
              } else { assert.equal(await history.innerText(), config.historical); await history.click(); await settled(); assert(await more.isVisible()); await more.click(); await settled(); }
              const count = scenario === 'historical-empty' ? 0 : 2;
              assert((await history.innerText()).includes(locale === 'en' ? `${count} comments` : `${count} 条评论`));
              assert.equal(await find(50).count(), 0); assert.equal(await find(52).count(), count ? 1 : 0);
              if (!count) assert.equal(await empty.count(), 1);
            }
            assert.deepEqual(await page.evaluate(() => window.fixtureWrites), [], 'Zero writes');
            // UI may append roots to its response page while paging, so compare each root's reply data only.
            assert(await page.evaluate(() => window.fixtureRaw.every(entry => {
              const original = JSON.parse(entry.before);
              return original.currentVersion.comments.every(root => {
                const actual = entry.value.currentVersion.comments.find(c => c.id === root.id);
                return JSON.stringify(root) === JSON.stringify(actual);
              });
            })), 'Projection does not change root/reply data');
            assert.deepEqual(errors, []); assert.equal(remoteRequests, 0);
            if (process.env.DISCUSSION_EVIDENCE_DIR && ['all-hidden', 'paging', 'direct-hidden'].includes(scenario)) {
              fs.mkdirSync(process.env.DISCUSSION_EVIDENCE_DIR, { recursive: true });
              await page.screenshot({ path: path.join(process.env.DISCUSSION_EVIDENCE_DIR, `${prefix}-${engine}-${locale}-${scenario}.png`), fullPage: true });
            }
            await page.close(); checks++; results.push({ engine, locale, width, scenario, status: 'PASS' });
          }
        }
      } finally { await browser.close(); }
      console.log(`${prefix} ${engine}: PASS ${checks} cumulative complete-tree, paging, empty, scope, exact-link and refresh groups`);
    }
    if (process.env.DISCUSSION_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.DISCUSSION_EVIDENCE_DIR, `${prefix}-RESULT.json`), JSON.stringify({ prefix, checks, results, productionCalls: 0, fixtureWrites: 0 }, null, 2) + '\n');
  } finally { server.close(); }
}
run().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
