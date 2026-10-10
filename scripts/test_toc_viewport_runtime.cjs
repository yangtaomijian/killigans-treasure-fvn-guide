'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{webkit,chromium}=require('playwright');
const base=process.env.KT_BASE_URL,dir=process.env.KT_QA_DIR||path.resolve(__dirname,'../test-results/toc-viewport');
assert(base,'KT_BASE_URL required');
const state=page=>page.evaluate(()=>{const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {rail:box(document.getElementById('kt-page-toc-panel')),header:box(document.getElementById('quarto-header')),article:box(document.querySelector('main.content')),doc:document.documentElement.scrollWidth,scroll:scrollY,viewport:{width:innerWidth,height:innerHeight},railScroll:document.getElementById('kt-page-toc-panel').scrollTop}});
function check(s,label){assert(Math.abs(s.rail.y-s.header.bottom)<=1,label+': header offset');assert(Math.abs(s.rail.bottom-s.viewport.height)<=1,label+': viewport bottom');assert(s.rail.right<=s.article.x-15,label+': article gap');assert(s.doc<=s.viewport.width,label+': document overflow');}
(async()=>{fs.mkdirSync(dir,{recursive:true});const results=[];
for(const [engine,type,opts]of [['WebKit',webkit,{}],['Edge',chromium,{executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'}]]){
const browser=await type.launch({headless:true,...opts});try{
for(const colorScheme of ['light','dark']){
const page=await browser.newPage({colorScheme});const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const locale of ['zh','en'])for(const width of [1728,1440,1366,1280,1024,992])for(const [route,height] of [['guide/aris',900],['help',500],['collectibles/memories',500]]){
await page.setViewportSize({width,height});await page.goto(`${base}/${locale==='en'?'en/':''}${route}.html`);await page.evaluate(()=>window.ktAdaptiveTables.whenSettled());
const initial=await state(page);check(initial,route+'/initial');
await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
const footer=await state(page);check(footer,route+'/footer');assert(Math.abs(footer.article.x-initial.article.x)<=.5 && Math.abs(footer.article.width-initial.article.width)<=.5,'scroll changed article geometry');assert(footer.scroll>100,route+': did not reach footer');
await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
if(route==='guide/aris'){
await page.locator('main.content details summary').last().scrollIntoViewIfNeeded();const before=await state(page);await page.locator('main.content details summary').last().click();const after=await state(page);check(before,route+'/details-before');check(after,route+'/details-after');assert(Math.abs(before.rail.y-after.rail.y)<=.5,'details rail jump');
}
const last=page.locator('#TOC a.nav-link:visible').last();await last.focus();assert(await last.evaluate(a=>{const r=a.getBoundingClientRect(),p=a.closest('#kt-page-toc-panel').getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1}),'long TOC focus outside rail');
const top=page.locator('#TOC > ul > li > a').first();const hash=await top.getAttribute('data-scroll-target');await top.click();await page.waitForFunction(hash=>document.querySelector('#TOC a.active')?.getAttribute('data-scroll-target')===hash,hash);assert.equal(decodeURI(new URL(page.url()).hash),decodeURI(hash));
await page.waitForFunction(hash=>{const target=document.getElementById(decodeURI(hash.slice(1)));const heading=target?.matches('section')?target.querySelector(':scope > :is(h1,h2,h3,h4)'):target;if(!heading)return false;const y=heading.getBoundingClientRect().top;return y>=document.getElementById('quarto-header').getBoundingClientRect().bottom-1 && y<innerHeight;},hash);
// Product contract: 960 article, independent 840 discussion, same text start.
// Reveal the local hidden mount only for CSS geometry; no discussion requests/actions.
const contract=await page.evaluate(()=>{const a=document.querySelector('main.content'),d=document.querySelector('#kt-public-discussion');d.hidden=false;return {a:a.getBoundingClientRect().width,d:d.getBoundingClientRect().width,ax:a.getBoundingClientRect().x+parseFloat(getComputedStyle(a).paddingLeft),dx:d.getBoundingClientRect().x+parseFloat(getComputedStyle(d).paddingLeft)}});
assert(Math.abs(contract.a-Math.min(960,width-2*Math.max(16,(width-1440)/2+16)-260))<=1,'approved article width');assert(Math.abs(contract.d-Math.min(840,contract.a))<=1,'discussion width');assert(Math.abs(contract.ax-contract.dx)<=1,'discussion text alignment');
results.push({engine,colorScheme,locale,width,route,height,initial,footer,contract});
if(width===1440&&locale==='zh'&&colorScheme==='light') {await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await page.screenshot({path:path.join(dir,engine+'-'+route.replace('/','-')+'-footer.png')});}
}
// Actual masthead size, not a hardcoded rail offset.
await page.setViewportSize({width:1440,height:900});await page.goto(base+'/guide/aris.html');await page.evaluate(()=>document.getElementById('quarto-header').style.paddingBottom='7px');await page.waitForFunction(()=>Math.abs(document.getElementById('kt-page-toc-panel').getBoundingClientRect().top-document.getElementById('quarto-header').getBoundingClientRect().bottom)<1);check(await state(page),'resized masthead');
await page.setViewportSize({width:991,height:900});await page.locator('#kt-page-toc-trigger').click();assert.equal(await page.locator('#kt-page-toc-trigger').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('#kt-page-toc-trigger').getAttribute('aria-expanded'),'false');
assert.deepEqual(errors,[]);await page.close();
}
console.log(engine+' viewport TOC PASS');
}finally{await browser.close();}
}
fs.writeFileSync(path.join(dir,'viewport-toc.json'),JSON.stringify(results,null,2));console.log('PASS '+results.length+' footer/heading/layout contracts');
})().catch(e=>{console.error(e);process.exitCode=1});
