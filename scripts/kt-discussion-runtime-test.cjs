// All browser requests are fulfilled or aborted locally. This never posts to the live service.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const assembled = process.env.KT_DISCUSSION_ASSEMBLED === '1';
const asset = name => fs.readFileSync(path.join(root, 'assets', name), 'utf8');
const files = ['kt-discussion-remote.html', 'kt-discussion-runtime.html', 'kt-discussion-ui.html', 'kt-feedback-ui.html'];
const pages = ['guide/redroot', 'guide/aris', 'guide/crystal-plains-shieldfall', 'guide/spiceport',
  'guide/blueleaf-grove', 'reference/relationships', 'reference/personality', 'reference/combat',
  'collectibles/memories', 'collectibles/equipment', 'collectibles/dressing-room', 'collectibles/codex'];
const version = 'Public v0.57a';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function html(url, dark) {
  const en = url.pathname.startsWith('/en/');
  const file = path.join(root, '_site', url.pathname.replace(/^\//, '') || 'index.html');
  let text = assembled ? fs.readFileSync(file, 'utf8') : `<!doctype html><html lang="${en ? 'en' : 'zh-CN'}"><head>
    ${asset('kt-discussion-config.html')}<style>${asset('kt-foundation.css')}
    body { margin: 0; } #quarto-content { display: grid; grid-template-columns: [body-content-start] 1fr [body-content-end]; }
    main { min-width: 0; padding: 1rem; } ${asset('kt-discussion.css')} ${asset('kt-feedback.css')}</style></head><body>
    <div id="quarto-content"><main id="quarto-document-content"><h1>KT</h1><p id="section">Sample guide</p></main></div>
    <footer class="footer"><button class="kt-feedback-slot" type="button" disabled>Feedback</button></footer>
    ${files.map(asset).join('\n')}</body></html>`;
  if (dark && !assembled) text = text.replace('</head>', `<style>:root { --kt-bg:#211f1b; --kt-surface:#292620; --kt-text:#ece6dc;
    --kt-heading:#fff6e6; --kt-text-muted:#c1b5a1; --kt-border:#625642; --kt-border-strong:#8c7857;
    --kt-link:#e5bd77; --kt-link-hover:#ffe0a0; --kt-surface-muted:#342f27; }</style></head>`);
  return text;
}
async function run(engine, launch) {
  const executablePath = engine === 'Chromium' ? process.env.KT_CHROMIUM_EXECUTABLE : process.env.KT_WEBKIT_EXECUTABLE;
  const browser = await launch.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let dark = false, locked = false, postError = null, paginated = false;
  const posted = [], feedback = [], reads = [], rows = new Map();
  await context.addInitScript(() => {
    // The assembled site owns theme switching and its native stylesheet state.
    localStorage.removeItem('quarto-color-scheme');
    // Fake only the challenge SDK; production payload paths stay exercised.
    window.turnstile = { render(node, options) {
      window.__challengeActions ??= []; window.__challengeActions.push(options.action);
      queueMicrotask(() => options.callback('local-only-token')); return 'local-widget';
    }, remove() {} };
  });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname === 'discussion.carambi.com') {
      const json = (status, data) => route.fulfill({ status, headers: {
        'content-type': 'application/json', 'access-control-allow-origin': 'https://killigans-treasure.carambi.com',
        'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' }, body: JSON.stringify(data) });
      if (request.method() === 'OPTIONS') return json(204, {});
      if (request.method() === 'GET') {
        reads.push(Object.fromEntries(url.searchParams));
        const key = `${url.searchParams.get('locale')}:${url.searchParams.get('pageKey')}`;
        const comments = rows.get(key) || [];
        const current = paginated ? [{ id: uuid(url.searchParams.has('cursor') ? 92 : 91), authorKind:'guest',
          displayName:'Visitor', body:'<img src=x onerror=alert(1)>', status:'published', createdAt:'2026-10-01T00:00:00Z', replies:[] }] : comments;
        return json(200, { ok:true, thread:{ id:uuid(900), status:locked ? 'locked' : 'open' },
          currentVersion:{ guideVersion:url.searchParams.get('guideVersion'), comments:current,
            nextCursor:paginated && !url.searchParams.has('cursor') ? 'local-cursor' : null }, earlierVersions:[] });
      }
      const payload = request.postDataJSON(); assert.equal(payload.schemaVersion, 1);
      assert(!Object.hasOwn(payload, 'site'), 'Site identity must come from Origin, not client JSON');
      assert.equal(payload.guideVersion, version); assert.equal(payload.turnstileToken, 'local-only-token');
      if (url.pathname === '/v1/feedback') { feedback.push(payload); return json(202, { ok:true }); }
      posted.push(payload);
      if (postError) return json(429, { ok:false, code:postError });
      const key = `${payload.locale}:${payload.pageKey}`; const comments = rows.get(key) || [];
      const item = { id:uuid(posted.length), authorKind:'guest', displayName:payload.displayName,
        body:payload.body, pageHash:payload.pageHash, status:'published', createdAt:'2026-10-01T00:00:00Z', replies:[] };
      if (payload.parentCommentId) comments.find(x => x.id === payload.parentCommentId).replies.push(item);
      else comments.unshift(item);
      rows.set(key, comments); return json(201, { ok:true, commentId:item.id });
    }
    if (request.isNavigationRequest()) return route.fulfill({ contentType:'text/html', body:html(url, dark) });
    if (['killigans-treasure.carambi.com', 'localhost', 'untrusted.example'].includes(url.hostname)) {
      const file = path.join(root, '_site', decodeURIComponent(url.pathname));
      if (file.startsWith(path.join(root, '_site') + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile())
        return route.fulfill({ path:file });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => console.error(`${engine} page error: ${error.message}`));
  const go = async (route, host = 'killigans-treasure.carambi.com') => page.goto(`https://${host}/${route}`);
  try {
    for (const prefix of ['', 'en/']) for (const route of pages) {
      await go(`${prefix}${route}.html`);
      try { await page.locator('.kt-discussion-add').waitFor({ timeout:10000 }); }
      catch (error) {
        console.error(engine, page.url(), await page.evaluate(() => ({ mode:window.__ktDiscussionRuntime?.mode,
          context:window.__ktDiscussionRuntime?.getContext(), status:document.querySelector('.kt-discussion-status')?.textContent })));
        throw error;
      }
      const result = await page.evaluate(() => ({ context:window.__ktDiscussionRuntime.getContext(),
        mode:window.__ktDiscussionRuntime.mode, mounts:document.querySelectorAll('#kt-public-discussion').length }));
      assert.equal(result.mode, 'production'); assert.equal(result.mounts, 1);
      assert.equal(result.context.site, 'killigans-treasure');
      assert.equal(result.context.pageKey, route.replace('/', '.'));
      assert.equal(result.context.locale, prefix ? 'en' : 'zh-CN');
      assert.equal(result.context.guideVersion, version);
    }
    await go('en/guide/redroot.html#section');
    await page.locator('.kt-discussion-add').click();
    await page.locator('#kt-discussion-new-body').fill('Local root');
    await page.locator('.kt-discussion-submit').click();
    await page.locator('.kt-discussion-body').filter({ hasText:'Local root' }).waitFor();
    assert.equal(posted.at(-1).pageHash, '#section'); assert.equal(posted.at(-1).parentCommentId, null);
    await page.locator('.kt-discussion-reply-action').first().click();
    await page.locator('#kt-discussion-new-body').fill('Local reply');
    await page.locator('.kt-discussion-submit').click();
    await page.locator('.kt-discussion-reply').waitFor();
    assert.equal(posted.at(-1).parentCommentId, uuid(1)); assert.equal(posted.at(-1).pageHash, '');
    await page.locator('.kt-discussion-report-action').first().click();
    if (!await page.locator('#kt-feedback-message').count()) console.error('Feedback initialization', await page.evaluate(() => ({
      ready:document.readyState, dialog:!!window.__ktFeedbackDialog, runtime:window.__ktDiscussionRuntime?.mode,
      slots:[...document.querySelectorAll('.kt-feedback-slot')].map(x => ({ disabled:x.disabled, parent:x.closest('footer')?.className })) })));
    await page.locator('#kt-feedback-message').fill('Local report');
    await page.locator('.kt-feedback-submit').click();
    await page.locator('.kt-feedback-form[hidden]').waitFor({ state:'attached' });
    assert.equal(feedback.at(-1).category, 'report'); assert.equal(feedback.at(-1).relatedCommentId, uuid(1));
    await page.locator('.kt-feedback-close').click();
    await page.locator('.kt-feedback-slot').click();
    await page.locator('#kt-feedback-message').fill('Local private feedback');
    await page.locator('.kt-feedback-submit').click();
    await page.locator('.kt-feedback-form[hidden]').waitFor({ state:'attached' });
    assert.equal(feedback.at(-1).category, 'wrong'); assert.equal(feedback.at(-1).relatedCommentId, '');
    assert.equal(feedback.at(-1).pagePath, '/en/guide/redroot.html');
    assert.deepEqual([...new Set(await page.evaluate(() => window.__challengeActions))].sort(),
      ['discussion_post', 'feedback_send', 'report_comment']);
    await page.locator('.kt-feedback-close').click();
    assert.equal(await page.locator('.kt-feedback-slot').evaluate(node => node === document.activeElement), true);
    postError = 'RATE_LIMITED';
    await page.locator('.kt-discussion-add').click();
    await page.locator('#kt-discussion-new-body').fill('Preserved draft');
    await page.locator('.kt-discussion-submit').click();
    await page.locator('.kt-discussion-form-status').filter({ hasText:'too quickly' }).waitFor();
    assert.equal(await page.locator('#kt-discussion-new-body').inputValue(), 'Preserved draft');
    locked = true; await go('en/guide/aris.html');
    await page.locator('.kt-discussion-locked').waitFor();
    assert.equal(await page.locator('.kt-discussion-add').isVisible(), false);
    locked = false; paginated = true; await go('en/reference/combat.html');
    await page.locator('.kt-discussion-comment').waitFor();
    await page.getByRole('button', { name:'Load more', exact:true }).click();
    await page.locator('.kt-discussion-comment').nth(1).waitFor();
    assert.equal(await page.locator('.kt-discussion-body img').count(), 0, 'Comment body must stay text');
    assert.equal(reads.at(-1).cursor, 'local-cursor');
    for (const prefix of ['', 'en/']) for (const route of ['index.html', 'help.html']) {
      await go(prefix + route); assert.equal(await page.locator('#kt-public-discussion').count(), 0);
      assert.equal(await page.locator('.kt-feedback-slot').isEnabled(), true);
    }
    for (const host of ['localhost', 'untrusted.example']) {
      await go('en/guide/redroot.html', host);
      assert.equal(await page.evaluate(() => window.__ktDiscussionRuntime.mode), 'inactive');
      assert.equal(await page.locator('.kt-feedback-slot').isEnabled(), false);
      assert.equal(await page.locator('#kt-public-discussion').isVisible(), false);
    }
    for (dark of [false, true]) for (const width of [320, 390, 960, 1280, 1440]) {
      await page.setViewportSize({ width, height:844 });
      await page.emulateMedia({ colorScheme:dark ? 'dark' : 'light' });
      await go('en/reference/combat.html');
      if (assembled) await page.waitForFunction(dark => document.body.classList.contains(`quarto-${dark ? 'dark' : 'light'}`)
        && getComputedStyle(document.body).backgroundColor === (dark ? 'rgb(36, 35, 33)' : 'rgb(251, 250, 247)'), dark);
      await page.locator('.kt-discussion-comment').waitFor();
      await page.locator('.kt-feedback-slot').click();
      const dimensions = await page.evaluate(() => {
        const dialog = document.querySelector('.kt-feedback-dialog');
        const mount = document.querySelector('#kt-public-discussion');
        const r = dialog.getBoundingClientRect(); const m = mount.getBoundingClientRect();
        const main = document.querySelector('main').getBoundingClientRect();
        const footer = document.querySelector('footer.footer').getBoundingClientRect();
        const probe = document.createElement('span'); document.body.append(probe);
        const color = token => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; };
        const tokens = { bg:color('--kt-bg'), text:color('--kt-text'), heading:color('--kt-heading'), surface:color('--kt-surface') };
        probe.remove();
        return { left:r.left, right:r.right, document:document.documentElement.scrollWidth, viewport:innerWidth,
          bodyBg:getComputedStyle(document.body).backgroundColor,
          nativeTheme:document.body.classList.contains('quarto-dark') ? 'dark' : document.body.classList.contains('quarto-light') ? 'light' : null,
          nativeSheet:[...document.querySelectorAll('link.quarto-color-scheme')].filter(link => link.rel === 'stylesheet').map(link => ({
            alternate:link.classList.contains('quarto-color-alternate'), media:link.media })),
          dialog:{ open:dialog.open, visible:r.width > 0 && r.height > 0, background:getComputedStyle(dialog).backgroundColor,
            text:getComputedStyle(dialog).color, input:getComputedStyle(dialog.querySelector('.kt-feedback-input')).backgroundColor,
            scroll:dialog.scrollWidth, client:dialog.clientWidth },
          content:{ bottom:main.bottom, left:main.left, width:main.width, footerTop:footer.top },
          discussion:{ left:m.left, right:m.right, top:m.top, bottom:m.bottom, width:m.width, visible:m.width > 0 && m.height > 0 && !mount.hidden,
            text:getComputedStyle(mount).color, heading:getComputedStyle(mount.querySelector('h2')).color,
            scroll:mount.scrollWidth, client:mount.clientWidth }, tokens };
      });
      assert(dimensions.document <= width + 1 && dimensions.left >= 0 && dimensions.right <= width + 1,
        `${engine} ${width} ${dark ? 'dark' : 'light'} overflow`);
      assert(dimensions.dialog.open && dimensions.dialog.visible && dimensions.discussion.visible);
      assert(dimensions.dialog.scroll <= dimensions.dialog.client + 1 && dimensions.discussion.scroll <= dimensions.discussion.client + 1);
      assert(dimensions.discussion.left >= 0 && dimensions.discussion.right <= width + 1);
      assert(dimensions.discussion.top >= dimensions.content.bottom - 1, 'Discussion follows the guide body');
      assert(dimensions.content.footerTop >= dimensions.discussion.bottom - 1, 'Discussion precedes the footer');
      if (assembled && width >= 992) {
        assert(Math.abs(dimensions.discussion.left - dimensions.content.left) <= 1, 'Discussion uses the guide column');
        assert(Math.abs(dimensions.discussion.width - dimensions.content.width) <= 1, 'Discussion has the guide column width');
      }
      assert.equal(dimensions.dialog.background, dimensions.tokens.bg);
      assert.equal(dimensions.dialog.text, dimensions.tokens.text);
      assert.equal(dimensions.dialog.input, dimensions.tokens.surface);
      assert.equal(dimensions.discussion.text, dimensions.tokens.text);
      assert.equal(dimensions.discussion.heading, dimensions.tokens.heading);
      if (assembled) {
        assert.equal(dimensions.nativeTheme, dark ? 'dark' : 'light');
        assert.equal(dimensions.bodyBg, dark ? 'rgb(36, 35, 33)' : 'rgb(251, 250, 247)');
        assert(dimensions.nativeSheet.some(sheet => sheet.alternate === dark && sheet.media !== 'not all'));
      }
      await page.locator('.kt-feedback-close').click();
    }
    console.log(`${engine}: 24 route contexts, post/reply/report/private feedback, pagination, lock, rate draft, host exclusion, 10 width/${assembled ? 'native-theme' : 'theme-token'} checks PASS`);
  } finally { await browser.close(); }
}
(async () => { await run('Chromium', chromium); await run('WebKit', webkit); })().catch(error => { console.error(error); process.exitCode = 1; });
