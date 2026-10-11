'use strict';
// Synthetic-only optional subscription flow and private transport probes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium, webkit } = require('playwright');
const sourceRoot = process.env.KT_DISCUSSION_SOURCE_DIR || path.join(__dirname, '..');
const base = process.env.GUIDE_BASE_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const current = 'Public v0.57a', historic = 'Public v0.56';
const states = ['not_requested', 'verification_pending', 'verification_failed', 'verification_unknown', 'active', 'cancelled', 'expired'];
const box = '.kt-discussion-subscription-optin', email = '#kt-discussion-subscription-email';
const panel = '.kt-discussion-subscription-panel', status = '.kt-discussion-subscription-status';
const retry = '.kt-discussion-subscription-retry', check = '.kt-discussion-subscription-check', privateEmail = '#kt-discussion-subscription-retry-email';
async function transportChecks() {
  const source = fs.readFileSync(path.join(sourceRoot, 'assets/kt-discussion-remote.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const ctx = { window: {}, location: { hostname: 'killigans-treasure.carambi.com' }, document: { querySelector: q => ({ content: q.includes('environment') ? 'production' : q.includes('sitekey') ? '0xFixture' : 'https://discussion.carambi.com' }) }, URL, AbortController, setTimeout, clearTimeout, fetch: null };
  vm.createContext(ctx); vm.runInContext(source, ctx); const transport = ctx.window.__ktDiscussionRemoteTransport;
  const input = { commentId: id(1), pageKey: 'guide.redroot', locale: 'en', subscriptionProof: 'b'.repeat(64), email: 'notify@example.invalid' };
  ctx.fetch = async (url, options) => {
    assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.redirect, 'error');
    const payload = JSON.parse(options.body); assert(!url.includes(input.subscriptionProof)); assert(!url.includes(input.email));
    assert.equal(payload.subscriptionProof, input.subscriptionProof); assert(!Object.hasOwn(payload, 'visitorId')); assert(!Object.hasOwn(payload, 'site'));
    if (url.endsWith('/status')) assert(!Object.hasOwn(payload, 'email')); else assert.equal(payload.email, input.email);
    return { status: 200, json: async () => ({ ok: true, requestId: 'synthetic', receivedAt: '2026-10-10T00:00:00.000Z', unexpected: 'do not echo', subscription: { state: 'verification_pending', mayRetry: false, expiresAt: '2026-10-11T00:00:00.000Z' } }) };
  };
  for (const method of ['enrollSubscription', 'readSubscriptionStatus']) {
    const result = await transport[method](input); assert.deepEqual(Object.keys(result).sort(), ['ok', 'subscription']);
    assert.deepEqual(Object.keys(result.subscription).sort(), ['expiresAt', 'mayRetry', 'state']);
  }
  for (const bad of [{ state: 'delivered', mayRetry: false }, { state: 'active', mayRetry: 'yes' }, { state: 'active', mayRetry: false, email: input.email }, { state: 'active', mayRetry: false, expiresAt: '2026-02-31T00:00:00.000Z' }, { state: 'active', mayRetry: false, expiresAt: 'Oct 11 2026' }]) {
    ctx.fetch = async () => ({ status: 200, json: async () => ({ ok: true, subscription: bad }) });
    await assert.rejects(transport.enrollSubscription(input), e => e.outcomeUnknown === true && !String(e).includes(input.email));
  }
  for (const code of ['SUBSCRIPTION_UNAVAILABLE', 'SUBSCRIPTION_EMAIL_INVALID', 'SUBSCRIPTION_EMAIL_FIXED', 'SUBSCRIPTION_RATE_LIMITED']) {
    ctx.fetch = async () => ({ status: 400, json: async () => ({ ok: false, code, detail: input.email }) });
    await assert.rejects(transport.enrollSubscription(input), e => e.code === code && e.outcomeUnknown === false && !String(e).includes(input.email));
  }
  for (const [statusCode, code, known] of [[503, 'SUBSCRIPTION_UNAVAILABLE', true], [503, 'SUBSCRIPTION_RESULT_UNKNOWN', false], [200, 'SUBSCRIPTION_UNAVAILABLE', false]]) {
    ctx.fetch = async () => ({ status: statusCode, json: async () => ({ ok: false, code }) });
    await assert.rejects(transport.enrollSubscription(input), e => e.outcomeUnknown === !known && e.code === (known ? code : null));
  }
  for (const statusCode of [201, 500]) {
    ctx.fetch = async () => ({ status: statusCode, json: async () => ({ ok: true, subscription: { state: 'active', mayRetry: false } }) });
    await assert.rejects(transport.enrollSubscription(input), e => e.outcomeUnknown === true);
  }
  ctx.setTimeout = fn => setTimeout(fn, 0); ctx.fetch = async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('abort')), { once: true }));
  await assert.rejects(transport.enrollSubscription(input), e => e.outcomeUnknown === true);
  ctx.fetch = async (url, options) => { const data = JSON.parse(options.body); assert.equal(data.subscriptionProof, input.subscriptionProof); assert.equal(options.redirect, 'error'); assert(!Object.hasOwn(data, 'email')); return { status: 201, json: async () => ({ commentId: id(2) }) }; };
  await transport.postComment({ ...input, guideVersion: current, body: 'Synthetic comment' });
  ctx.fetch = async (url, options) => { assert(!Object.hasOwn(options, 'redirect')); assert(!Object.hasOwn(JSON.parse(options.body), 'subscriptionProof')); return { status: 201, json: async () => ({ commentId: id(2) }) }; };
  await transport.postComment({ pageKey: input.pageKey, locale: input.locale, body: 'Legacy comment' });
  ctx.fetch = async () => { throw Error('Synthetic redirect rejected'); };
  await assert.rejects(transport.postComment({ ...input, guideVersion: current, body: 'Synthetic comment' }), e => e.outcomeUnknown === true);
  console.log('KT subscription transport PASS: private body-only, no redirects, canonical UTC/schema, clean envelope, errors/timeout unknown, comment proof without email');
}
async function open(browser, locale, width, config = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390 }); const page = await context.newPage();
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ current, historic, config }) => {
    if (config.noCrypto) Object.defineProperty(window, 'crypto', { value: { getRandomValues() { throw Error('Synthetic unavailable'); } } });
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    window.calls = []; window.posts = []; window.enrolls = []; window.checks = []; window.commentMode = 'success'; window.subscriptionMode = 'verification_pending'; window.statusMode = 'active'; window.delayEnroll = false;
    window.turnstile = { render(slot, opts) { queueMicrotask(() => opts.callback('synthetic-token')); return 1; }, remove() {} };
    const comment = (n, version = current, root = null) => ({ id: id(n), parentCommentId: root ? id(root) : null, replyToCommentId: root ? id(root) : null, replyTo: root ? { id: id(root), status: 'published', displayName: 'Same', authorKind: 'guest' } : null, status: 'published', displayName: 'Same', authorKind: 'guest', body: `Comment ${n}`, guideVersion: version, discussionScope: 'version', canReply: true, pageHash: null, createdAt: '2026-10-10T00:00:00.000Z', replies: [] });
    function row(mode) { return { ok: true, subscription: { state: mode, mayRetry: ['not_requested', 'verification_failed'].includes(mode), expiresAt: '2026-10-11T00:00:00.000Z' } }; }
    function fail(mode) { const error = Error('Synthetic private failure'); if (mode.startsWith('SUBSCRIPTION_')) { error.code = mode; error.outcomeUnknown = false; } else error.outcomeUnknown = true; throw error; }
    const transport = { fixtureCanWrite: true, turnstileSitekey: '0xFixture', async readDiscussion(input) {
      const root = comment(input.guideVersion === historic ? 11 : 1, input.guideVersion); root.replies = [comment(input.guideVersion === historic ? 12 : 2, input.guideVersion, input.guideVersion === historic ? 11 : 1)];
      return { ok: true, thread: { id: 'fixture', status: 'open' }, currentVersion: { guideVersion: input.guideVersion, comments: [root], nextCursor: null }, persistent: { comments: [], nextCursor: null }, earlierVersions: [{ guideVersion: historic, commentCount: 2 }] };
    }, async postComment(input) { window.posts.push({ ...input }); window.calls.push('comment'); if (window.commentMode !== 'success') { const e = Error('Synthetic comment failure'); e.outcomeUnknown = window.commentMode === 'unknown'; if (!e.outcomeUnknown) e.code = 'VERIFICATION_FAILED'; throw e; } return { ok: true, httpStatus: 201, commentId: config.noUuid ? null : id(200 + window.posts.length) }; }, async sendFeedback() { return { ok: true, httpStatus: 202 }; } };
    if (!config.legacy) Object.assign(transport, {
      async enrollSubscription(input) { window.enrolls.push({ ...input }); window.calls.push('enroll'); const mode = window.subscriptionMode; if (window.delayEnroll) await new Promise(resolve => { window.releaseEnroll = resolve; }); if (!['not_requested','verification_pending','verification_failed','verification_unknown','active','cancelled','expired'].includes(mode)) fail(mode); return row(mode); },
      async readSubscriptionStatus(input) { window.checks.push({ ...input }); const mode = window.statusMode; if (mode === 'unknown' || mode.startsWith('SUBSCRIPTION_')) fail(mode); return row(mode); },
    });
    Object.defineProperty(window, '__ktDiscussionFixtureTransport', { get: () => transport, set() {} });
  }, { current, historic, config });
  await page.goto(`${base}/${locale === 'en' ? 'en/' : ''}guide/redroot.html`); await page.locator('.kt-discussion-refresh').waitFor(); await settled(page); return page;
}
async function settled(page) { await page.waitForFunction(() => document.querySelector('.kt-discussion-comments')?.getAttribute('aria-busy') === 'false'); }
async function draft(page, target = 'root', optIn = false, value = 'notify@example.invalid') {
  await page.locator(target === 'root' ? '.kt-discussion-add' : `#kt-comment-${id(target)} > .kt-discussion-actions > .kt-discussion-reply-action`).click();
  await page.locator('#kt-discussion-new-body').fill('Synthetic private subscription draft');
  if (optIn) { await page.locator(box).check(); await page.locator(email).fill(value); }
  await page.waitForFunction(() => !document.querySelector('.kt-discussion-submit').disabled);
}
async function post(page, count = 1) { await page.locator('.kt-discussion-submit').click(); await page.waitForFunction(count => window.posts.length === count && document.querySelector('.kt-discussion-composer-host').hidden, count); await settled(page); }
async function finished(page) { await page.waitForFunction(() => !document.querySelector('.kt-discussion-subscription-check')?.disabled); }
async function mode(page, name, value) { await page.evaluate(({ name, value }) => { window[name] = value; }, { name, value }); }
async function run(name, engine, executablePath) {
  const browser = await engine.launch({ headless: true, executablePath }); let groups = 0;
  try { for (const locale of ['zh-CN','en']) for (const width of [390,1440]) {
    let page = await open(browser, locale, width);
    await draft(page); assert(!(await page.locator(box).isChecked())); assert(!(await page.locator(email).isVisible())); await post(page);
    assert.equal(await page.evaluate(() => window.enrolls.length), 0); assert.equal(await page.evaluate(() => Object.hasOwn(window.posts[0], 'subscriptionProof')), false); await page.context().close(); groups++;
    for (const target of ['root',2]) {
      page = await open(browser, locale, width); await draft(page,target,true); await post(page); await finished(page);
      const sent = await page.evaluate(() => ({ post: window.posts[0], enroll: window.enrolls[0], calls: window.calls, html: document.querySelector('.kt-discussion-comments').outerHTML, storage: JSON.stringify({ ...localStorage }) }));
      assert.deepEqual(sent.calls,['comment','enroll']); assert(!Object.hasOwn(sent.post,'email')); assert(/^[a-f0-9]{64}$/.test(sent.post.subscriptionProof)); assert.equal(sent.enroll.subscriptionProof,sent.post.subscriptionProof); assert.equal(sent.enroll.commentId,id(201)); assert(!sent.html.includes(sent.post.subscriptionProof)); assert(!sent.html.includes(sent.enroll.email)); assert(!sent.storage.includes(sent.post.subscriptionProof));
      if (target === 2) { assert.equal(sent.post.parentCommentId,id(1)); assert.equal(sent.post.replyToCommentId,id(2)); }
      assert((await page.locator(status).innerText()).includes(locale==='en'?'delivery is not confirmed':'不代表已送达')); await page.context().close(); groups++;
    }
    page=await open(browser,locale,width);await draft(page,'root',true,'invalid');await post(page);assert.equal(await page.evaluate(()=>window.enrolls.length),0);assert(await page.locator(privateEmail).isVisible());await page.locator(privateEmail).fill('fixed@example.invalid');await page.locator(retry).click();await finished(page);assert.equal(await page.evaluate(()=>window.posts.length),1);assert.equal(await page.evaluate(()=>window.enrolls[0].email),'fixed@example.invalid');assert(!(await page.locator(privateEmail).isVisible()));await page.context().close();groups++;
    for(const state of states){page=await open(browser,locale,width);await mode(page,'subscriptionMode',state);await draft(page,'root',true);await post(page);await finished(page);assert((await page.locator(status).innerText()).startsWith(locale==='en'?'Comment posted':'评论已发布'));assert.equal(await page.locator(retry).isVisible(),['not_requested','verification_failed'].includes(state));if(state==='verification_unknown'){assert(await page.locator(check).isVisible());assert(!(await page.locator(retry).isVisible()));}await page.context().close();}groups++;
    for(const code of ['SUBSCRIPTION_UNAVAILABLE','SUBSCRIPTION_EMAIL_INVALID','SUBSCRIPTION_EMAIL_FIXED','SUBSCRIPTION_RATE_LIMITED']){page=await open(browser,locale,width);await mode(page,'subscriptionMode',code);await draft(page,'root',true);await post(page);await finished(page);assert.equal(await page.evaluate(()=>window.posts.length),1);assert(!(await page.locator('.kt-discussion-confirm-unposted').isVisible()));assert(await page.locator(panel).isVisible());await page.context().close();}groups++;
    page=await open(browser,locale,width);await mode(page,'subscriptionMode','unknown');await draft(page,'root',true);await post(page);await finished(page);assert(!(await page.locator(retry).isVisible()));await page.locator(retry).evaluate(n=>n.click());assert.equal(await page.evaluate(()=>window.enrolls.length),1);await mode(page,'statusMode','unknown');await page.locator(check).click();await finished(page);assert.equal(await page.evaluate(()=>window.enrolls.length),1);assert(!(await page.locator(retry).isVisible()));await mode(page,'statusMode','verification_failed');await page.locator(check).click();await finished(page);await mode(page,'subscriptionMode','active');await page.locator(privateEmail).evaluate(n=>{n.value='other@example.invalid';});await page.locator(retry).click();await finished(page);assert.equal(await page.evaluate(()=>window.posts.length),1);assert.equal(await page.evaluate(()=>window.enrolls.length),2);assert.equal(await page.evaluate(()=>window.enrolls[0].subscriptionProof===window.enrolls[1].subscriptionProof&&window.enrolls[0].email===window.enrolls[1].email),true);assert.equal(await page.evaluate(()=>window.checks.every(row=>!Object.hasOwn(row,'email'))),true);await page.context().close();groups++;
    for(const commentMode of ['unknown','known']){page=await open(browser,locale,width);await mode(page,'commentMode',commentMode);await draft(page,'root',true);await page.locator('.kt-discussion-submit').click();await page.waitForFunction(mode=>window.posts.length===1&&document.querySelector('.kt-discussion-form-status').textContent.includes(mode==='unknown'?(document.documentElement.lang==='en'?'may have succeeded':'结果不确定'):(document.documentElement.lang==='en'?'Verification failed':'验证失败')),commentMode);assert.equal(await page.evaluate(()=>window.enrolls.length),0);assert.equal(await page.locator('.kt-discussion-confirm-unposted').isVisible(),commentMode==='unknown');assert(await page.locator(box).isChecked());assert.equal(await page.locator(email).inputValue(),'notify@example.invalid');assert.equal(await page.locator('#kt-discussion-new-body').inputValue(),'Synthetic private subscription draft');await page.context().close();}groups++;
    page=await open(browser,locale,width);await draft(page,2,true,'child@example.invalid');await page.locator('.kt-discussion-refresh').click();await settled(page);assert(await page.locator(box).isChecked());assert.equal(await page.locator(email).inputValue(),'child@example.invalid');await draft(page,'root');assert(!(await page.locator(box).isChecked()));await draft(page,2);assert(await page.locator(box).isChecked());assert.equal(await page.locator(email).inputValue(),'child@example.invalid');await page.locator('.kt-discussion-version-buttons button').filter({hasText:historic}).click();await settled(page);await draft(page,12);assert(!(await page.locator(box).isChecked()));await page.locator('.kt-discussion-version-buttons button').filter({hasText:current}).click();await settled(page);await draft(page,2);assert(await page.locator(box).isChecked());assert.equal(await page.locator(email).inputValue(),'child@example.invalid');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.context().close();groups++;
    page=await open(browser,locale,width);await mode(page,'delayEnroll',true);await draft(page,'root',true);await post(page);await page.waitForFunction(()=>typeof window.releaseEnroll==='function');await page.locator(retry).evaluate(n=>n.click());assert.equal(await page.evaluate(()=>window.enrolls.length),1);await draft(page,2);await page.locator('#kt-discussion-name').fill('Keep name');await page.locator('#kt-discussion-new-body').evaluate(n=>{n.scrollIntoView({block:'center'});n.focus({preventScroll:true});n.setSelectionRange(3,9);});const top=await page.locator('#kt-discussion-new-body').evaluate(n=>n.getBoundingClientRect().top);await page.evaluate(()=>window.releaseEnroll());await finished(page);assert.equal(await page.evaluate(()=>document.activeElement.id),'kt-discussion-new-body');assert.deepEqual(await page.locator('#kt-discussion-new-body').evaluate(n=>[n.selectionStart,n.selectionEnd]),[3,9]);assert(Math.abs(await page.locator('#kt-discussion-new-body').evaluate(n=>n.getBoundingClientRect().top)-top)<3);assert.equal(await page.locator('#kt-discussion-name').inputValue(),'Keep name');await page.screenshot({path:`${process.env.DISCUSSION_EVIDENCE_DIR||'/tmp'}/${name}-${locale}-${width}-subscription-draft.png`});await page.context().close();groups++;
    page=await open(browser,locale,width);await mode(page,'delayEnroll',true);await draft(page,'root',true);await post(page);await page.waitForFunction(()=>typeof window.releaseEnroll==='function');await draft(page,2);await post(page,2);await page.evaluate(()=>window.releaseEnroll());assert(!(await page.locator(panel).isVisible()));assert.equal(await page.evaluate(()=>window.posts.length),2);assert.equal(await page.evaluate(()=>window.enrolls.length),1);await page.context().close();groups++;
    for(const config of [{legacy:true},{noCrypto:true},{noUuid:true}]){page=await open(browser,locale,width,config);await draft(page,'root',!config.legacy);if(config.legacy)assert(!(await page.locator(box).isVisible()));await post(page);assert.equal(await page.evaluate(()=>window.enrolls.length),0);await page.context().close();}groups++;
  }console.log(`KT ${name}: PASS ${groups} bilingual desktop/mobile private subscription scenario groups`);
  }finally{await browser.close();}
}
(async()=>{await transportChecks();if(process.env.KT_SUBSCRIPTION_TRANSPORT_ONLY==='true')return;await run('Chromium',chromium,process.env.KT_CHROMIUM_EXECUTABLE||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');await run('WebKit',webkit,process.env.KT_WEBKIT_EXECUTABLE||'/Users/yangtao/Library/Caches/ms-playwright/webkit-2365/pw_run.sh');})().catch(error=>{console.error(error);process.exitCode=1;});
