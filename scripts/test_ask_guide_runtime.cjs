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
const ready = {...off,ready:true,code:null,allowance:{balance:1000,percentage:100,refillAt:null},beta:{approved:true,pilot:{policy:'OPEN_BETA_V1',configured:true,used:false,maxQuestions:1,remainingQuestions:1,poolRemaining:5,rolling24hAvailable:true,endsAt:null,automaticRefill:false}}};
const exhausted = {...ready,ready:false,code:'OPEN_BETA_POOL_EXHAUSTED',beta:{...ready.beta,pilot:{...ready.beta.pilot,poolRemaining:0}}};
const daily = {...ready,ready:false,code:'BETA_DAILY_QUESTION_LIMIT',beta:{...ready.beta,pilot:{...ready.beta.pilot,rolling24hAvailable:false}}};
const staleReady = {...exhausted,ready:true};
const withdrawn = {...unapproved,code:'OPEN_BETA_WITHDRAWN'};
const used = {...off,beta:{approved:true,pilot:{configured:true,used:true,maxQuestions:1}}};
const ended = {...off,beta:{approved:true,pilot:{configured:true,used:false,maxQuestions:1,endsAt:1}}};
const cases = {access:null,anon,error:null,unapproved,off,used,ended,ready,exhausted,daily,staleReady,withdrawn};
async function run(name, engine, options) {
  const browser = await engine.launch({headless:true,...options});
  try {
    for (const locale of ['zh','en']) for (const width of [1440,390,320]) for (const [state,session] of Object.entries(cases)) {
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
      assert.equal(await page.locator('#kt-ai-beta-apply').isVisible(),false);
      assert.equal(await page.locator('#kt-beta-apply-entry').count(),0);
      assert.equal(await page.locator('#kt-beta-application').count(),0);
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
      if(['ready','exhausted'].includes(state)&&width!==320) {
        const label = `${name}-${locale}-${width}-${state}`;
        await page.screenshot({path:path.join(out,label+'.png')});
      }
      if(['ready','exhausted','daily','staleReady','used','off','anon'].includes(state)) {
        await page.locator('#kt-ai-question').fill('PUBLIC SYNTHETIC UI ONLY');
        await page.locator('#kt-ai-privacy-ack').click();
        assert.equal(await page.locator('#kt-ai-send').isEnabled(),state==='ready');
      }
      if(state==='ready') {
        assert.match(await page.locator('#kt-ai-quota').innerText(),/全站剩余 5|Site questions left: 5/);
        await page.locator('.kt-ai-funds summary').click();
        assert.match(await page.locator('#kt-ai-budget').innerText(),/不会自动补充|does not refill/);
      }
      if(state==='exhausted')assert.match(await page.locator('#kt-ai-quota').innerText(),/已用完|exhausted/);
      if(state==='daily')assert.match(await page.locator('#kt-ai-panel').innerText(),/滚动 24 小时|last 24 hours/);
      if(state==='unapproved') {
        await page.getByRole('button',{name:locale==='en'?'Sign out':'退出',exact:true}).click();
        await page.waitForFunction(()=>{const state=document.querySelector('.kt-ai-notice').dataset;return state.sessionPhase==='known'&&state.authenticated==='false';});
        assert.equal(await page.locator('#kt-ai-beta-apply').isVisible(),false);
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
