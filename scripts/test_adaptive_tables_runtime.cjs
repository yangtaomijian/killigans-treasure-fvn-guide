'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{webkit,chromium}=require('playwright');
const base=process.env.KT_BASE_URL;
assert(base,'KT_BASE_URL required');
const output=process.env.KT_QA_DIR;
(async()=>{const results=[];
for(const [engine,type,options] of [['WebKit',webkit,{}],['Edge',chromium,{executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'}]]){
 const browser=await type.launch({headless:true,...options});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const locale of ['zh','en'])for(const route of ['help','collectibles/equipment','collectibles/dressing-room','guide/spiceport']){
  await page.goto(`${base}/${locale==='en'?'en/':''}${route}.html`);
  await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
  for(let repeat=0;repeat<3;repeat++)for(const width of [992,991,820,768,600,575,520,480,430,390,375,353,352,351,320]){
   await page.setViewportSize({width,height:800});
   await page.evaluate(()=>window.ktAdaptiveTables.whenSettled());
   const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,tables:[...document.querySelectorAll('.kt-adaptive-records')].map(w=>({width:w.getBoundingClientRect().width,record:w.classList.contains('kt-record-mode'),ready:w.dataset.ktAdaptiveReady,labels:w.querySelectorAll('.kt-record-label').length,cells:w.querySelectorAll('tbody td').length}))}));
   assert(data.overflow<=0,`${engine}/${locale}/${route}/${width}: settled overflow ${data.overflow}`);
   data.tables.forEach(t=>{assert.equal(t.ready,'true');assert.equal(t.record,t.width<576);assert.equal(t.labels,t.cells,'record labels duplicated or missing');});
   results.push({engine,locale,route,width,repeat,...data});
  }
 }
 // A container-only resize must settle without a window resize event.
 await page.setViewportSize({width:1440,height:900});await page.goto(base+'/help.html');
 const wrap=page.locator('.kt-trailmarker-baselines');
 for(const width of [575,576,570,800]){
  await wrap.evaluate((w,width)=>w.style.width=width+'px',width);await page.evaluate(()=>window.ktAdaptiveTables.whenSettled());
  assert.equal(await wrap.evaluate(w=>w.classList.contains('kt-record-mode')),width<576);
 }
 assert.deepEqual(errors,[]);await page.close();console.log(engine+' adaptive tables PASS');
 }finally{await browser.close();}
}
if(output)fs.writeFileSync(path.join(output,'adaptive-ready.json'),JSON.stringify(results,null,2));
console.log('PASS '+results.length+' settled resize states plus container-only resize');
})().catch(e=>{console.error(e);process.exitCode=1});
