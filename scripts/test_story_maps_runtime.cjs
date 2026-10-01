'use strict';
// Local browser regression, adapted from DW check-story-map-gestures ideas.
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const base=process.env.KT_BASE_URL||'http://127.0.0.1:8765';
const results=[];
async function box(svg,label){
 const d=await svg.evaluate(n=>{const b=n.viewBox.baseVal,g=n.getBBox();const x=Math.max(0,Math.min(b.x+b.width,g.x+g.width)-Math.max(b.x,g.x)),y=Math.max(0,Math.min(b.y+b.height,g.y+g.height)-Math.max(b.y,g.y));return {v:[b.x,b.y,b.width,b.height],raw:n.getAttribute('viewBox'),overlap:[x/Math.min(b.width,g.width),y/Math.min(b.height,g.height)]};});
 assert(d.v.every(Number.isFinite)&&d.v[2]>0&&d.v[3]>0,label+JSON.stringify(d));
 assert(!/NaN|Infinity|undefined/.test(d.raw));
 assert(d.overlap.every(r=>r>=.75),label+': clamp '+JSON.stringify(d));return d;
}
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function load(page,prefix,route){
 await page.goto(`${base}/${prefix}${route}.html`);await page.locator('.kt-map-enhanced').first().waitFor();await settle(page);
}
async function pointers(stage,sequence){
 await stage.evaluate((n,events)=>{for(const e of events)n.dispatchEvent(new PointerEvent(e.type,{bubbles:true,pointerType:'touch',buttons:e.type==='pointerup'?0:1,...e}));},sequence);
}
async function gestureCase(browser,engine,prefix,route,index=0){
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await load(page,prefix,route);
  const map=page.locator('.kt-story-map').nth(index),surface=map.locator('.kt-story-map-scroll'),svg=surface.locator('svg');
  await surface.scrollIntoViewIfNeeded();const rect=await surface.boundingBox();
  const blank=await surface.evaluate(n=>{
   const r=n.getBoundingClientRect(),links=[...n.querySelectorAll('svg a')].map(a=>a.getBoundingClientRect());
   // WebKit elementFromPoint can return the SVG root over a linked rect.
   // Also exclude the geometric hit boxes so this really tests empty space.
   for(const fy of [.95,.8,.05,.2])for(const fx of [.05,.95,.25,.75]){
    const x=r.x+r.width*fx,y=r.y+r.height*fy,hit=document.elementFromPoint(x,y);
    const linked=links.some(b=>x>=b.left-2&&x<=b.right+2&&y>=b.top-2&&y<=b.bottom+2);
    if(hit&&n.contains(hit)&&!hit.closest('a')&&!linked)return {x,y};
   }throw Error('No empty hit area');
  });
  const {x,y}=blank;
  const initial=await box(svg,'initial');await page.mouse.move(x,y);await page.mouse.down();await page.mouse.up();assert.deepEqual((await box(svg,'empty click')).v,initial.v);
  const sizing=await surface.evaluate(n=>({surface:n.getBoundingClientRect().height,svg:n.querySelector('svg').getBoundingClientRect().height}));
  assert(Math.abs(sizing.surface-sizing.svg)<1,'SVG exceeds bounded inline preview');
  assert(Math.abs(sizing.surface-(route==='index'?260:route==='reference/relationships'?380:440))<1,'per-map inline height');
  await map.locator('.kt-map-zoom-out').click();assert((await box(svg,'inline extra zoom-out')).v[2]>initial.v[2]);
  await map.locator('.kt-map-reset').click();assert(Math.abs((await box(svg,'inline reset')).v[2]-initial.v[2])<.1);
  await surface.focus();await page.keyboard.press('+');await box(svg,'keyboard zoom');await page.keyboard.press('ArrowRight');await box(svg,'keyboard pan');await page.keyboard.press('0');
  // Mouse release just outside the surface must leave no stuck pointer state.
  await page.mouse.move(rect.x+rect.width-2,y);await page.mouse.down();await page.mouse.move(rect.x+rect.width+30,y);await page.mouse.up();await box(svg,'outside release');
  for(let i=0;i<4;i++){
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y+35,{steps:5});await page.mouse.up();await box(svg,'repeated drag');
   await page.waitForFunction(n=>!n.classList.contains('kt-map-dragging'),await surface.elementHandle());
   await surface.dispatchEvent('wheel',{deltaY:-45,ctrlKey:true,clientX:x,clientY:y});await box(svg,'inline pinch wheel');
  }
  const before=(await box(svg,'before native scroll')).v,scroll=await page.evaluate(()=>scrollY);await page.mouse.move(x,y);await page.mouse.wheel(0,120);await page.waitForFunction(s=>scrollY!==s,scroll);assert.deepEqual((await box(svg,'native article wheel')).v,before);
  await surface.focus();await page.keyboard.press('0');await surface.scrollIntoViewIfNeeded();
  const link=svg.locator('a').first();await link.scrollIntoViewIfNeeded();const lr=await link.boundingBox();const lx=lr.x+lr.width/2,ly=lr.y+lr.height/2;
  await page.mouse.move(lx,ly);await page.mouse.down();await page.mouse.move(lx+55,ly+30,{steps:4});await page.mouse.up();await box(svg,'linked drag');assert.equal(new URL(page.url()).hash,'','drag navigated');
  await link.click();assert(new URL(page.url()).hash,'node click did not navigate');
  await load(page,prefix,route);
  const opener=page.locator('.kt-story-map').nth(index).locator('.kt-map-expand');
  const inlineBefore=(await box(page.locator('.kt-story-map').nth(index).locator('svg'),'before viewer')).v;await opener.click();
  const viewer=page.locator('dialog.kt-map-viewer[open]'),stage=viewer.locator('.kt-map-viewer-stage'),vs=stage.locator('svg');
  assert(await stage.evaluate(n=>n===document.activeElement),'viewer focus');const fit=(await box(vs,'viewer fit')).v;
  await viewer.locator('.kt-map-zoom-out').click();assert((await box(vs,'extra zoom-out after reset')).v[2]>fit[2]);
  await viewer.locator('.kt-map-reset').click();assert(Math.abs((await box(vs,'reset returns comfortable view')).v[2]-fit[2])<.1);
  let vr=await stage.boundingBox(),vx=vr.x+vr.width/2,vy=vr.y+vr.height/2;
  await page.mouse.move(vx,vy);await page.mouse.wheel(0,-120);await settle(page);assert((await box(vs,'mouse wheel zoom')).v[2]<fit[2]);
  const pre=(await box(vs,'before trackpad')).v;await stage.dispatchEvent('wheel',{deltaX:20,deltaY:30,clientX:vx,clientY:vy});assert.notDeepEqual((await box(vs,'trackpad pan')).v,pre);
  await stage.dispatchEvent('wheel',{deltaY:-45,ctrlKey:true,clientX:vx,clientY:vy});await box(vs,'trackpad pinch');
  const valid=(await box(vs,'before non-finite input')).v;
  await stage.evaluate(n=>{for(const deltaY of [NaN,Infinity,-Infinity]){const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true});Object.defineProperty(event,'deltaY',{value:deltaY});n.dispatchEvent(event);}});
  assert.deepEqual((await box(vs,'non-finite wheel ignored')).v,valid);
  for(let i=0;i<30;i++)await page.keyboard.press('+');const min=await box(vs,'min zoom');assert(Math.abs(min.v[2]-fit[2]/3.5)<.1,JSON.stringify({engine,prefix,route,fit,min,focus:await page.evaluate(()=>document.activeElement.outerHTML.slice(0,200))}));
  for(let i=0;i<3;i++){await page.mouse.move(vx,vy);await page.mouse.down();await page.mouse.move(vx+650,vy+360,{steps:5});await page.mouse.up();await box(vs,'extreme repeated pan');}
  for(let i=0;i<35;i++)await page.keyboard.press('-');assert(Math.abs((await box(vs,'max zoom')).v[2]-fit[2]*1.6)<.1);
  await page.keyboard.press('f');await page.keyboard.press('+');
  await pointers(stage,[{type:'pointerdown',pointerId:91,clientX:vx-40,clientY:vy},{type:'pointerdown',pointerId:92,clientX:vx+40,clientY:vy},{type:'pointermove',pointerId:91,clientX:vx-90,clientY:vy-25},{type:'pointermove',pointerId:92,clientX:vx+90,clientY:vy+25},{type:'pointerup',pointerId:91,clientX:vx-90,clientY:vy-25},{type:'pointerup',pointerId:92,clientX:vx+90,clientY:vy+25}]);await box(vs,'touch pinch');
  await pointers(stage,[{type:'pointerdown',pointerId:93,clientX:vx,clientY:vy},{type:'pointermove',pointerId:93,clientX:vx+200,clientY:vy+90},{type:'pointerup',pointerId:93,clientX:vx+200,clientY:vy+90}]);await box(vs,'touch pan');
  assert(!await stage.evaluate(n=>n.classList.contains('kt-map-dragging')));
  await page.keyboard.press('0');
  const fullscreenSupported=await page.evaluate(()=>Boolean(document.fullscreenEnabled));
  if(fullscreenSupported){
   const full=viewer.locator('.kt-map-fullscreen');await full.click();await page.waitForFunction(()=>!!document.fullscreenElement);await box(vs,'fullscreen');await full.click();await page.waitForFunction(()=>!document.fullscreenElement);await box(vs,'exit fullscreen');
   await full.click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.keyboard.press('Escape');
   // Native browser Escape may be consumed to exit fullscreen before the
   // document receives a key event. A second Escape closes that remaining modal.
   await page.waitForFunction(()=>!document.fullscreenElement);
   if(await viewer.count())await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('dialog.kt-map-viewer[open]'));
   assert(await opener.evaluate(n=>n===document.activeElement),'fullscreen Escape focus restoration');await opener.click();
  }
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open].kt-map-viewer'));
  assert(await opener.evaluate(n=>n===document.activeElement),'Escape focus restoration');
  assert.deepEqual((await box(page.locator('.kt-story-map').nth(index).locator('svg'),'restored inline view')).v,inlineBefore);
  await opener.click();await viewer.locator('.kt-map-viewer-controls button').last().click();assert(await opener.evaluate(n=>n===document.activeElement),'close focus restoration');
  await opener.click();await viewer.locator('svg a').first().click();await page.waitForFunction(()=>location.hash.length>1);assert.equal(await page.locator('dialog.kt-map-viewer[open]').count(),0,'viewer node did not close');
  assert.deepEqual(errors,[],'browser errors');results.push({engine,prefix,route,index,fullscreenSupported,desktop:'all gesture / bounds / link / viewer cases passed'});
 }finally{await page.close();}
}
async function mobileCase(browser,engine,prefix,route,width){
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
 try{
  await load(page,prefix,route);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile horizontal overflow');
  if(route==='index'){
   assert(await page.locator('.kt-map-compact-overview').isVisible(),'mobile Journey overview');
   assert.equal(await page.locator('.kt-map-compact-overview a').count(),9);
   assert.equal(await page.locator('.kt-story-map-scroll').getAttribute('tabindex'),'-1');
  }
  for(let i=0;i<await page.locator('.kt-story-map').count();i++){
   const map=page.locator('.kt-story-map').nth(i),opener=map.locator('.kt-map-expand');await opener.tap();
   const stage=page.locator('dialog.kt-map-viewer[open] .kt-map-viewer-stage'),svg=stage.locator('svg');await box(svg,'mobile viewer');
   const b=await stage.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;const original=(await box(svg,'before pinch')).v;
   if(engine==='Chromium'){
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:x-30,y},{id:2,x:x+30,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x-85,y:y-15},{id:2,x:x+85,y:y+15}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await settle(page);assert((await box(svg,'native emulated mobile pinch')).v[2]<original[2]);await cdp.detach();
   }else{
    await pointers(stage,[{type:'pointerdown',pointerId:81,clientX:x-30,clientY:y},{type:'pointerdown',pointerId:82,clientX:x+30,clientY:y},{type:'pointermove',pointerId:81,clientX:x-85,clientY:y},{type:'pointermove',pointerId:82,clientX:x+85,clientY:y},{type:'pointerup',pointerId:81,clientX:x-85,clientY:y},{type:'pointerup',pointerId:82,clientX:x+85,clientY:y}]);assert((await box(svg,'WebKit pointer pinch')).v[2]<original[2]);
   }
   await page.locator('dialog[open] .kt-map-reset').tap();await box(svg,'mobile reset');
   // A short touch on a linked node must navigate, unlike a drag.
   await svg.locator('a').first().tap();await page.waitForFunction(()=>location.hash.length>1);assert.equal(await page.locator('dialog.kt-map-viewer[open]').count(),0);
   await load(page,prefix,route);
  }
  results.push({engine,prefix,route,width,mobile:'full viewer, pinch, Reset view, linked tap, no overflow passed'});
 }finally{await context.close();}
}
async function readingCase(browser,engine,prefix){
 const page=await browser.newPage({viewport:{width:390,height:844}});
 try{
  for(const [route,hash,needle] of [['reference/relationships','macsen-balcony','Romantic'],['reference/relationships','zhokhar-spiceport','Competition'],['guide/spiceport','spiceport-early-excursions','Warehouse'],['guide/spiceport','spiceport-day6','Fishing']]){
   await page.goto(`${base}/${prefix}${route}.html#${hash}`);await page.locator('.kt-map-enhanced').first().waitFor();
   const state=await page.evaluate(id=>{const a=document.getElementById(id),section=a.closest('section').nextElementSibling;return {top:a.getBoundingClientRect().top,text:section.querySelector(':scope > p').textContent,folded:!!a.closest('details')};},hash);
   assert(!state.folded);assert(state.top>=-160&&state.top<844+100,JSON.stringify(state));assert(state.text.includes(needle));
   assert.equal(await page.locator('.kt-read-more[open]').count(),0);
  }
  await page.goto(`${base}/${prefix}guide/spiceport.html?q=${encodeURIComponent(prefix?'nursery':'托儿所')}#spiceport-early-excursions`);
  await page.waitForSelector('mark.kt-search-mark');assert.equal(await page.locator('.kt-read-more:not([open])').count(),0);
  assert(await page.locator('.kt-read-more mark.kt-search-mark').count()>0,'folded secondary text did not receive search highlight');
  await page.goto(`${base}/${prefix}guide/spiceport.html#spiceport-day5`);await page.goto(`${base}/${prefix}guide/spiceport.html#spiceport-day6`);await page.goBack();assert.equal(new URL(page.url()).hash,'#spiceport-day5');await page.goForward();assert.equal(new URL(page.url()).hash,'#spiceport-day6');
  results.push({engine,prefix,read:'four direct answers, visible limits, Search disclosure/highlight, Back/Forward passed'});
 }finally{await page.close();}
}
async function webViewCase(browser,engine,prefix){
 const userAgent=engine==='Chromium'?'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,userAgent});const page=await context.newPage();
 try{
  for(const route of (process.env.KT_RELATIONSHIP_ONLY ? ['reference/relationships'] : ['reference/relationships','guide/spiceport','index'])){
   await load(page,prefix,route);const opener=page.locator('.kt-map-expand').first();await opener.tap();
   const viewer=page.locator('dialog.kt-map-viewer[open]');await box(viewer.locator('svg'),'embedded browser profile');
   await viewer.locator('.kt-map-viewer-controls button').last().tap();assert(await opener.evaluate(n=>n===document.activeElement));
  }
  await page.goto(`${base}/${prefix}collectibles/dressing-room.html`);await settle(page);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  for(const id of ['interface','expressions','unlocks','state','recovery'])assert.equal(await page.locator(`#dressing-room-${id}`).count(),1);
  assert.equal(await page.locator('main table tbody tr').count(),17);assert.equal(await page.locator('main img').count(),0);
  results.push({engine,prefix,webView:'embedded-browser UA profile: all maps/viewers and Dressing Room passed; emulation, not physical WebView'});
 }finally{await context.close();}
}
(async()=>{
 for(const [engine,type] of [['Chromium',chromium],['WebKit',webkit]]){
  const browser=await type.launch({headless:true,...(engine==='Chromium'?{executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'}:process.env.KT_WEBKIT_EXECUTABLE?{executablePath:process.env.KT_WEBKIT_EXECUTABLE}:{})});try{
   for(const prefix of ['','en/']){
    for(const [route,i] of (process.env.KT_RELATIONSHIP_ONLY ? [['reference/relationships',0]] : [['reference/relationships',0],['guide/spiceport',0],['guide/spiceport',1],['index',0]]))await gestureCase(browser,engine,prefix,route,i);
    for(const width of [390,320])for(const route of (process.env.KT_RELATIONSHIP_ONLY ? ['reference/relationships'] : ['reference/relationships','guide/spiceport','index']))await mobileCase(browser,engine,prefix,route,width);
    if(!process.env.KT_MAP_TARGETED){await readingCase(browser,engine,prefix);await webViewCase(browser,engine,prefix);}
   }
  }finally{await browser.close();}
 }
 console.log(JSON.stringify({result:'PASS',cases:results.length,results},null,2));
})().catch(e=>{console.error(e);console.log(JSON.stringify(results,null,2));process.exitCode=1;});
