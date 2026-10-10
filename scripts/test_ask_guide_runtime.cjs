'use strict';
// Local response replay only; all remote traffic and AI/feedback writes are blocked.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {chromium, webkit} = require('playwright');
const base = process.env.KT_BASE_URL;
assert(base && new URL(base).hostname === '127.0.0.1');
const out = process.env.KT_QA_DIR || path.resolve(__dirname, '../test-results/ask-guide');
fs.mkdirSync(out, {recursive:true});
const records = [], writes = [], errors = [];
const anon = {authenticated:false, ready:false, code:'AUTH_REQUIRED', user:null, allowance:null, activeRequestId:null};
const unapproved = {authenticated:true, ready:false, code:'BETA_NOT_APPROVED', csrf:'REPLAY_ONLY', user:{id:'REPLAY_ACCOUNT_A'}, beta:{approved:false,pilot:{configured:false,used:false}}, activeRequestId:null};
const off = {...unapproved,code:'PROVIDER_ADMISSION_OFF',beta:{approved:true,pilot:{configured:false,used:false}}};
const used = {...off,beta:{approved:true,pilot:{configured:true,used:true,maxQuestions:1}}};
const ended = {...off,beta:{approved:true,pilot:{configured:true,used:false,maxQuestions:1,endsAt:1}}};
const cases = {access:null,anon,error:null,unapproved,off,used,ended};
async function run(name, engine, options) {
  const browser = await engine.launch({headless:true,...options});
  try {
    for (const locale of ['zh','en']) for (const width of [1440,390]) for (const [state,session] of Object.entries(cases)) {
      const context = await browser.newContext({viewport:{width,height:900},colorScheme:'light'});
      const page = await context.newPage(); let current = structuredClone(session), authRequests = 0;
      page.on('pageerror', e => errors.push({name,locale,width,state,message:e.message}));
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if(url.origin !== base) return route.abort();
        if(req.method() !== 'GET' && req.method() !== 'HEAD') {
          if(url.pathname === '/auth/logout') {current=anon;return route.fulfill({status:200,json:{status:'logged_out'}});}
          writes.push({method:req.method(),path:url.pathname});return route.abort();
        }
        if(url.pathname.startsWith('/auth/')) authRequests++;
        if(url.pathname === '/api/session') {
          if(state==='access') return route.continue(); // Loopback server supplies the real 302; WebKit cannot fulfill redirects.
          if(state==='error') return route.fulfill({status:503,json:{code:'UNAVAILABLE'}});
          return route.fulfill({status:200,json:current});
        }
        return route.continue();
      });
      await page.goto(`${base}/${locale==='en'?'en/':''}guide/aris.html`);
      await page.locator('#kt-ai-launcher').waitFor();
      await page.waitForFunction(() => document.querySelector('.kt-ai-notice')?.dataset.sessionPhase !== 'checking');
      await page.locator('#kt-ai-launcher').click();
      await page.waitForFunction(() => document.querySelector('.kt-ai-notice')?.dataset.sessionPhase !== 'checking');
      assert.equal(authRequests,0,'No config, Google SDK or nonce preparation on load/open');
      assert(await page.locator('#kt-ai-send').isDisabled());
      assert.equal(await page.locator('#kt-ai-query').isVisible(),false);
      const phase = await page.locator('.kt-ai-notice').getAttribute('data-session-phase');
      assert.equal(phase,state==='access'?'access':state==='error'?'error':'known');
      const apply = ['access','anon','unapproved'].includes(state);
      assert.equal(await page.locator('#kt-ai-beta-apply').isVisible(),apply);
      assert.equal(await page.locator('#kt-beta-apply-entry').getAttribute('hidden') !== null,['off','used','ended'].includes(state));
      if(state==='error') {
        assert(await page.locator('#kt-ai-session-retry').isVisible());
        assert.equal(await page.locator('#google').isVisible(),false);
      }
      if(state==='off')assert.match(await page.locator('#kt-ai-quota').innerText(),/尚未开放|not yet open/);
      if(state==='used')assert.match(await page.locator('#kt-ai-quota').innerText(),/0/);
      if(state==='ended')assert.match(await page.locator('#kt-ai-quota').innerText(),/已结束|ended/);
      const visible = await page.locator('#kt-ai-panel').innerText();
      assert(!/Provider|local UI candidate|mock|Request too large/.test(visible));
      assert.equal(new URL(page.url()).pathname,`/${locale==='en'?'en/':''}guide/aris.html`);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(['access','unapproved'].includes(state)) {
        const label = `${name}-${locale}-${width}-${state}`;
        await page.screenshot({path:path.join(out,label+'.png')});
      }
      if(apply) {
        await page.locator('#kt-ai-beta-apply').click();
        assert(await page.locator('#kt-beta-application').evaluate(e=>e.open));
        await page.locator('#kt-beta-contact').fill('local-preview@example.invalid');
        assert(await page.locator('#kt-beta-submit').isDisabled());
        assert.match(await page.locator('.kt-feedback-intro').last().innerText(),/Google/);
        await page.locator('#kt-beta-application .kt-feedback-close').click();
        assert.equal(await page.evaluate(()=>document.activeElement.id),'kt-ai-beta-apply');
      }
      if(state==='unapproved') {
        await page.getByRole('button',{name:locale==='en'?'Sign out':'退出',exact:true}).click();
        await page.waitForFunction(()=>{const state=document.querySelector('.kt-ai-notice').dataset;return state.sessionPhase==='known'&&state.authenticated==='false';});
        assert(await page.locator('#kt-ai-beta-apply').isVisible());
        assert.equal(current.beta,undefined,'Logout replay clears account projection');
      }
      await page.locator('#kt-ai-close').click();
      assert.equal(await page.evaluate(()=>document.activeElement.id),'kt-ai-launcher');
      assert.equal(await page.locator('main.content').evaluate(e=>e.inert),false);
      records.push({engine:name,locale,width,state,pass:true});
      await context.close();
    }
  }finally{await browser.close();}
}
(async()=>{
  const {createTransport} = await import('../assets/ai-beta/transport.mjs');
  for(const response of [{type:'opaqueredirect',status:0},{status:302}]) {
    const transport = createTransport({origin:base,storage:null,fetchImpl:async(url,init)=>{assert.equal(init.redirect,'manual');return response;}});
    await assert.rejects(transport.snapshot(),/ACCESS_REQUIRED/);
  }
  const transport = createTransport({origin:base,storage:null,fetchImpl:async()=>({status:503,json:async()=>({code:'UNAVAILABLE'})})});
  assert.equal((await transport.snapshot()).httpStatus,503,'HTTP failures are not anonymous or Access success');
  await run('Edge',chromium,{executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'});
  await run('WebKit',webkit,{});
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'ask-guide.json'),JSON.stringify({records,writes,errors,realAuth:false,realQuestions:0},null,2));
  console.log(`PASS ${records.length} bilingual desktop/mobile account cases; zero AI/feedback writes, no background authentication redirects`);
})().catch(e=>{console.error(e);process.exitCode=1;});
