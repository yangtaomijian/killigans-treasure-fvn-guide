"use strict";

// Gallery state changes must not perform native anchor scrolling. External
// row/category URLs and the explicit full-table link keep their source targets.
const assert = require('node:assert/strict');
const {webkit, chromium} = require('playwright');
const base = process.env.KT_BASE_URL || 'http://127.0.0.1:19775';
const prefix = process.env.KT_PREFIX_URL || 'http://127.0.0.1:19786/kt-test';
const route = (root,locale) => `${root}/${locale==='en'?'en/':''}collectibles/memories.html`;
const settle = page => page.evaluate(async()=>{
  await document.fonts.ready;
  for(let i=0;i<4;i++) await new Promise(requestAnimationFrame);
});
const viewport = page => page.evaluate(()=>({
  top:document.querySelector('.kt-gallery-tabs').getBoundingClientRect().top,
  y:scrollY,hash:location.hash,open:document.querySelector('.kt-memory-marker-help').open,
  selected:document.querySelector('.kt-gallery-entry[aria-current]')?.hash,
  position:history.state?.ktMemoryPosition,
}));
async function stable(page, action, label) {
  const before = await viewport(page);
  await action(); await settle(page);
  const after = await viewport(page);
  assert(Math.abs(after.y-before.y)<=1,`${label}: scroll changed ${before.y} -> ${after.y}`);
  assert(Math.abs(after.top-before.top)<=1,`${label}: Gallery controls moved`);
  return after;
}
async function sourceLanding(page,id,label) {
  await settle(page);
  const bounds=await page.locator(`#${id}`).evaluate(n=>{
    const r=n.getBoundingClientRect(),h=document.getElementById('quarto-header').getBoundingClientRect();
    return {top:r.top,bottom:h.bottom,viewport:innerHeight};
  });
  assert(bounds.top>=bounds.bottom-2 && bounds.top<bounds.viewport,`${label}: source target ${JSON.stringify(bounds)}`);
}
async function refresh(page,label) {
  const before=await viewport(page);
  await page.reload({waitUntil:'load'});await settle(page);
  const after=await viewport(page);
  assert.equal(after.hash,before.hash,`${label}: fragment`);
  assert.equal(after.selected,before.selected,`${label}: selected CG`);
  assert.equal(after.open,before.open,`${label}: marker disclosure`);
  assert(Math.abs(after.top-before.top)<=1,`${label}: viewport ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
}
async function run(name,engine,options={}) {
  const browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let states=0;
  try {
    for(const locale of ['zh','en']) for(const theme of ['light','dark']) for(const width of [1440,1024,576,575,390,320]) {
      const label=`${name}/${locale}/${theme}/${width}`;
      await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:700});
      await page.goto(route(base,locale));await settle(page);
      assert.equal(await page.evaluate(()=>scrollY),0,`${label}: fresh page`);
      if(width<=575) await page.locator('.kt-memory-marker-help summary').click();
      await page.locator('.kt-gallery-tabs').evaluate(n=>{
        const h=document.getElementById('quarto-header').getBoundingClientRect();
        scrollTo({top:scrollY+n.getBoundingClientRect().top-h.bottom-24,behavior:'instant'});
      });await settle(page);
      for(const index of [2,3,0,6]) {
        await stable(page,()=>page.locator(`#kt-gallery-tab-${index}`).click(),`${label}: category ${index}`);
        await stable(page,()=>page.locator('.kt-gallery-entry-title').first().click(),`${label}: card text`);
        assert.equal(await page.locator('.kt-gallery-entry[aria-current]').count(),1);
        const current=await viewport(page);
        assert((await page.locator('nav.navbar ul.navbar-nav.ms-auto a.nav-link').getAttribute('href')).endsWith(current.hash),`${label}: language link`);
      }
      await stable(page,()=>page.getByRole('button',{name:locale==='en'?'Next page':'下一页',exact:true}).click(),`${label}: next page`);
      await stable(page,()=>page.getByRole('button',{name:locale==='en'?'Previous page':'上一页',exact:true}).click(),`${label}: previous page`);
      await stable(page,()=>page.locator('.kt-gallery-entry').first().click(),`${label}: select before refresh`);
      await refresh(page,`${label}: card reload`);
      // A later manual scroll is captured before reload, not just the last click.
      await page.evaluate(()=>scrollBy({top:45,behavior:'instant'}));await settle(page);
      await refresh(page,`${label}: manually scrolled reload`);
      await page.evaluate(()=>scrollBy({top:-45,behavior:'instant'}));await settle(page);
      const a=await viewport(page);
      await stable(page,()=>page.locator('.kt-gallery-entry').nth(1).click(),`${label}: second card`);
      const b=await viewport(page);
      await page.goBack({waitUntil:'commit'});await settle(page);
      assert.equal((await viewport(page)).hash,a.hash);
      assert(Math.abs((await viewport(page)).top-a.top)<=1,`${label}: card back position`);
      await page.goForward({waitUntil:'commit'});await settle(page);
      assert.equal((await viewport(page)).hash,b.hash);
      assert(Math.abs((await viewport(page)).top-b.top)<=1,`${label}: card forward position`);
      await page.locator('.kt-gallery-source').scrollIntoViewIfNeeded();await settle(page);
      const browse=await viewport(page);
      await page.locator('.kt-gallery-source').click();
      await sourceLanding(page,browse.hash.slice(1),`${label}: explicit full table`);
      await page.goBack({waitUntil:'commit'});await settle(page);
      assert.equal((await viewport(page)).selected,browse.selected);
      assert(Math.abs((await viewport(page)).top-browse.top)<=1,`${label}: back from full table`);
      await page.goForward({waitUntil:'commit'});
      await sourceLanding(page,browse.hash.slice(1),`${label}: forward to full table`);
      states++;
    }
    for(const locale of ['zh','en']) {
      await page.setViewportSize({width:1280,height:900});
      const id='memory-aris-summit-memories-7';
      await page.goto(`${route(base,locale)}?q=Single%20Memories#${id}`);
      await sourceLanding(page,id,`${name}/${locale}: external exact row`);
      await page.reload();await sourceLanding(page,id,`${name}/${locale}: exact row reload`);
      await page.goto(`${route(base,locale)}#crystal-plains-memories`);
      await sourceLanding(page,'crystal-plains-memories',`${name}/${locale}: external category`);
      // Reusing the current query makes this result a same-document fragment
      // navigation from Gallery browsing, rather than a fresh document load.
      await page.goto(`${route(base,locale)}?q=Prologue+Memories#memory-redroot-memories-1`);await settle(page);
      await page.locator('#kt-gallery-tab-2').click();
      await page.locator('.kt-gallery-entry').first().click();
      await page.locator('#kt-search-launcher').click();
      await page.locator('#kt-search-input').fill('Prologue Memories');
      const result=page.locator('a.kt-search-result[href$="#memory-redroot-memories-1"]').first();
      await result.waitFor({state:'visible'});await result.click();
      await sourceLanding(page,'memory-redroot-memories-1',`${name}/${locale}: Search from Gallery`);
      await page.goto(`${route(prefix,locale)}?q=Memories`);await settle(page);
      await page.locator('.kt-gallery-tabs').evaluate(n=>scrollTo({top:scrollY+n.getBoundingClientRect().top-160,behavior:'instant'}));await settle(page);
      await stable(page,()=>page.locator('#kt-gallery-tab-2').click(),`${name}/${locale}: prefix/query`);
      assert.equal(new URL(page.url()).search,'?q=Memories');assert(new URL(page.url()).pathname.startsWith('/kt-test/'));
      await refresh(page,`${name}/${locale}: category reload`);
      await page.locator('#kt-gallery-tab-2').focus();
      await stable(page,()=>page.keyboard.press('ArrowRight'),`${name}/${locale}: keyboard tab`);
      await page.locator('.kt-gallery-entry').first().focus();
      await stable(page,()=>page.keyboard.press('Enter'),`${name}/${locale}: keyboard card`);
      await page.evaluate(()=>history.replaceState({ktMemoryGallery:true},'',location.href));
      await page.reload();await settle(page);
      assert.equal(await page.locator('.kt-gallery-entry[aria-current]').count(),1);
      assert(await page.evaluate(()=>{
        const top=document.querySelector('.kt-gallery-tabs').getBoundingClientRect().top;
        return top>=document.getElementById('quarto-header').getBoundingClientRect().bottom && top<innerHeight;
      }),`${name}/${locale}: migrate an already-open viewer`);
    }
    assert.deepEqual(errors,[]);
    console.log(`${name}: Gallery navigation PASS ${states} locale/theme/width states; stationary categories/cards/pages, reload, history, table/external landings, keyboard, prefix/query and legacy state`);
  } finally {await browser.close();}
}
(async()=>{await run('WebKit',webkit);await run('Edge',chromium,{executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'});})().catch(e=>{console.error(e);process.exitCode=1});
