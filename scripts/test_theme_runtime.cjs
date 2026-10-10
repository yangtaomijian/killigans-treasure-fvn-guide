"use strict";

// Native theme state/persistence, colors, layout and component regressions.
// Serve the assembled _site first. Evidence stays outside the public site/repository.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");
const base = process.env.KT_BASE_URL || "http://127.0.0.1:18775";
const evidence = path.resolve(process.env.KT_THEME_DIR || path.join(__dirname, "../test-results/theme"));
const widths = [1440,1280,1024,992,991,820,768,430,390,375,352,320];
const routes = ["index","reference/relationships","help","guide/aris","collectibles/memories","collectibles/codex","collectibles/equipment","collectibles/dressing-room","guide/spiceport","reference/combat"];
const baselineFile = path.join(evidence, "light-baseline.json");
const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile)) : [];
const url = (locale, route = "index", hash = "") => `${base}/${locale === "en" ? "en/" : ""}${route}.html${hash}`;
const key = "quarto-color-scheme";
const close = (a,b,label) => assert(Math.abs(a-b) <= .8, `${label}: ${a} vs ${b}`);
const reports = [];

async function ready(page, mode) {
  await page.waitForFunction(mode => document.body && document.body.classList.contains(`quarto-${mode}`)
    && getComputedStyle(document.body).backgroundColor === (mode === "dark" ? "rgb(36, 35, 33)" : "rgb(251, 250, 247)"), mode);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(65);
}
async function state(page, mode, auto) {
  await ready(page, mode);
  assert.equal(await page.locator("#kt-theme-auto").getAttribute("aria-pressed"), String(auto));
  const english = await page.evaluate(() => document.documentElement.lang.startsWith("en"));
  assert.equal(await page.locator(".quarto-color-scheme-toggle").getAttribute("aria-label"), english
    ? (mode === "dark" ? "Switch to light mode" : "Switch to dark mode")
    : (mode === "dark" ? "切换至浅色模式" : "切换至深色模式"));
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), mode);
}
async function measure(page, selectors) {
  return page.evaluate(selectors => {
    const props = ["color","backgroundColor","borderTopColor","borderBottomColor","borderRadius","fontFamily","fontSize","fontWeight","lineHeight","padding","margin","display","tableLayout"];
    const elements = selectors.map(s => {
      const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(), c = getComputedStyle(e);
      return {s,box:{x:r.x,y:r.y,width:r.width,height:r.height},style:Object.fromEntries(props.map(p=>[p,c[p]]))};
    }).filter(Boolean);
    return {docWidth:document.documentElement.scrollWidth,elements,
      tables:[...document.querySelectorAll("table")].map(t=>({width:t.getBoundingClientRect().width,height:t.getBoundingClientRect().height,
        display:getComputedStyle(t).display,cols:[...t.querySelectorAll("tbody tr:first-child td")].map(c=>c.getBoundingClientRect().width)}))};
  }, selectors);
}
function geometry(actual, expected, label, styles) {
  close(actual.docWidth, expected.docWidth, `${label} document width`);
  for (const e of expected.elements) {
    const a = actual.elements.find(x=>x.s === e.s); assert(a, `${label} ${e.s} missing`);
    const header = e.s.startsWith("#quarto-header") || ["#kt-search-launcher","#kt-page-toc-trigger","#kt-publication-brand"].includes(e.s);
    for (const prop of ["x","y","width","height"]) {
      // Added desktop utilities consume formerly empty header space, without growing it.
      if (header && prop !== "height") continue;
      close(a.box[prop], e.box[prop], `${label} ${e.s} ${prop}`);
    }
    if (styles) assert.deepEqual(a.style, e.style, `${label} ${e.s}: expected light styles`);
    else for (const prop of ["borderRadius","fontFamily","fontSize","fontWeight","lineHeight","padding","margin","display","tableLayout"])
      assert.equal(a.style[prop], e.style[prop], `${label} ${e.s} ${prop}`);
  }
  assert.equal(actual.tables.length, expected.tables.length);
  actual.tables.forEach((t,i)=>{
    const e = expected.tables[i]; assert.equal(t.display,e.display);
    for(const prop of ["width","height"]) close(t[prop],e[prop],`${label} table${i} ${prop}`);
    assert.equal(t.cols.length,e.cols.length);
    t.cols.forEach((v,j)=>close(v,e.cols[j],`${label} table${i} col${j}`));
  });
}
async function contrast(page, count) {
  const entries = await page.evaluate(() => {
    const rgb = color => {
      const nums = color.match(/[\d.]+/g)?.map(Number) || [];
      if (color.startsWith("color(srgb")) return [...nums.slice(0,3).map(n=>n*255), nums[3] ?? 1];
      return [nums[0]||0,nums[1]||0,nums[2]||0,nums[3]??1];
    };
    const blend = (fg,bg) => [0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3]));
    const background = node => {
      const chain=[]; for(let n=node;n;n=n.parentElement) chain.unshift(n);
      let bg=[36,35,33]; for(const n of chain) bg=blend(rgb(getComputedStyle(n).backgroundColor),bg);
      return bg;
    };
    const lum = v => v.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const nodes = [...document.querySelectorAll(".nav-link,.dropdown-item,#TOC a,.kt-brand-name,.kt-brand-edition,#kt-theme-auto,.quarto-color-scheme-toggle,#kt-search-launcher,#kt-page-toc-trigger,#kt-global-nav-close,#kt-page-toc-close,#kt-search-status,#kt-search-close,#kt-search-clear,#kt-search-input,.kt-search-result-title,.kt-search-result-section,.kt-search-result-text,#quarto-document-content :is(p,h1,h2,h3,a,code,th,td,summary)")];
    return nodes.filter(n=>n.getClientRects().length && getComputedStyle(n).visibility!=="hidden")
      .filter(n=>n.textContent.trim() || n.tagName === "INPUT" || n.getAttribute("aria-label"))
      .map(n=>{const c=getComputedStyle(n),bg=background(n),fg=blend(rgb(c.color),bg),a=lum(fg),b=lum(bg);
        const large=parseFloat(c.fontSize)>=24 || (parseFloat(c.fontSize)>=18.66 && parseFloat(c.fontWeight)>=700);
        return{node:n.id || n.className || n.tagName,text:n.textContent.trim().slice(0,50),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),minimum:large?3:4.5,color:c.color,bg};});
  });
  for(const e of entries) assert(e.ratio>=e.minimum, `contrast ${JSON.stringify(e)}`);
  count.contrast += entries.length;
}
async function interactions(page, locale, width, mode, count) {
  if (width <= 991) {
    await page.locator("#quarto-header .navbar-toggler").click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#kt-theme-controls").evaluate(e=>e.parentElement.id),(await page.locator("html").evaluate(e=>e.classList.contains("kt-two-tier-mobile"))) ? "" : "navbarCollapse");
    assert(await page.locator("#kt-theme-auto").isVisible());
    assert.equal(await page.locator("#quarto-header .navbar-toggler").getAttribute("aria-expanded"),"true");
    await page.locator(".quarto-color-scheme-toggle").focus();
    assert.equal(await page.locator(".quarto-color-scheme-toggle").evaluate(e=>getComputedStyle(e).outlineWidth),"2px");
    await page.locator("#kt-theme-auto").focus();
    assert.equal(await page.locator("#kt-theme-auto").evaluate(e=>getComputedStyle(e).outlineColor),mode === "dark" ? "rgb(210, 177, 123)" : "rgb(118, 80, 24)");
    if(mode === "dark") await contrast(page,count);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(()=>document.activeElement.classList.contains("navbar-toggler")),true);
    if (await page.locator('#kt-page-toc-trigger').count()) {
      await page.locator("#kt-page-toc-trigger").click();
      assert.equal(await page.locator("#kt-page-toc-trigger").getAttribute("aria-expanded"),"true");
      assert.equal(await page.locator("#TOC").getAttribute("role"),"doc-toc");
      assert.equal(await page.locator("#quarto-header").evaluate(e=>e.inert),true);
      assert.equal(await page.locator("#quarto-document-content").evaluate(e=>e.inert),true);
      if(mode === "dark") await contrast(page,count);
      await page.keyboard.press("Escape");
    } else {
      assert.equal(await page.locator('#TOC').count(),0);
      assert.equal(await page.locator('.kt-home-entry').count(),4);
    }
  } else {
    await page.locator("#navbarCollapse .dropdown-toggle").first().click();
    if(mode === "dark") await contrast(page,count);
    await page.keyboard.press("Escape");
  }
  await page.locator("#kt-search-launcher").click();
  assert.equal(await page.locator("#kt-search-dialog").evaluate(e=>e.open),true);
  await page.locator("#kt-search-input").fill("Macsen");
  await page.locator(".kt-search-result").first().waitFor();
  await page.keyboard.press("ArrowDown");
  const focused = await page.evaluate(()=>document.activeElement.classList.contains("kt-search-result"));
  assert(focused,"keyboard result focus");
  if(mode === "dark") await contrast(page,count);
  assert.equal(await page.locator("#kt-search-dialog").evaluate(e=>parseFloat(getComputedStyle(e).maxWidth)),884); // 52rem at the 17px root.
  await page.locator("#kt-search-clear").click();
  assert.equal(await page.locator("#kt-search-input").inputValue(),"");
  assert.equal(await page.locator("#kt-search-dialog").evaluate(e=>e.open),true,"Clear keeps dialog open");
  await page.locator("#kt-search-close").click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),"kt-search-launcher");
  count.interactions++;
}
async function transitions(browser, engine, count) {
  for(const locale of ["zh","en"]){
    const context=await browser.newContext({viewport:{width:1440,height:900},colorScheme:"light"});
    const page=await context.newPage();
    await page.goto(url(locale)); await state(page,"light",true); // A
    await page.emulateMedia({colorScheme:"dark"}); await state(page,"dark",true); // B,C
    await page.emulateMedia({colorScheme:"light"}); await state(page,"light",true);
    await page.locator(".quarto-color-scheme-toggle").focus(); await page.keyboard.press(" ");
    await state(page,"dark",false); assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),"alternate"); // D
    await page.reload(); await state(page,"dark",false); // G
    await page.goto(url(locale,"help")); await state(page,"dark",false); // H
    await Promise.all([page.waitForNavigation(),page.locator(".kt-language-utility").click()]); await state(page,"dark",false); // I
    await page.emulateMedia({colorScheme:"dark"}); await state(page,"dark",false);
    await page.locator(".quarto-color-scheme-toggle").focus(); await page.keyboard.press("Enter");
    await state(page,"light",false); assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),"default"); // E
    await page.reload(); await state(page,"light",false);
    await Promise.all([page.waitForNavigation(),page.locator(".kt-language-utility").click()]); await state(page,"light",false);
    await Promise.all([page.waitForNavigation(),page.locator("#kt-theme-auto").click()]);
    await state(page,"dark",true); assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null); // F
    await page.reload(); await state(page,"dark",true);
    await page.goto(url(locale,"guide/aris")); await state(page,"dark",true);
    await Promise.all([page.waitForNavigation(),page.locator(".kt-language-utility").click()]); await state(page,"dark",true);
    await page.emulateMedia({colorScheme:"light"}); await state(page,"light",true);
    // OS changed during manual mode: Auto must also reset Quarto's internal system sentinel.
    await page.locator(".quarto-color-scheme-toggle").click(); await state(page,"dark",false);
    await page.emulateMedia({colorScheme:"dark"});
    await Promise.all([page.waitForNavigation(),page.locator("#kt-theme-auto").click()]); await state(page,"dark",true);
    await page.locator(".quarto-color-scheme-toggle").click(); await state(page,"light",false);
    await page.goto(url(locale,"help")); await state(page,"light",false);
    await page.evaluate(()=>scrollTo(0,450));
    const readingPosition=await page.evaluate(()=>scrollY);
    await page.locator(".quarto-color-scheme-toggle").click(); await state(page,"dark",false);
    close(await page.evaluate(()=>scrollY),readingPosition,"manual theme preserves reading position");
    count.transitions+=24;
    await context.close();
  }
  for(const [system,stored,effective] of [["dark",null,"dark"],["light","alternate","dark"],["dark","default","light"]]){
    const context=await browser.newContext({viewport:{width:1440,height:900},colorScheme:system});
    await context.addInitScript(({stored,key})=>{
      if(stored!==null) localStorage.setItem(key,stored);
      window.ktInitialFrames=[];
      const frame=()=>{if(document.body) window.ktInitialFrames.push({mode:document.body.className,bg:getComputedStyle(document.body).backgroundColor});
        if(window.ktInitialFrames.length<10) requestAnimationFrame(frame);};requestAnimationFrame(frame);
    },{stored,key});
    const page=await context.newPage(); await page.goto(url("en")); await state(page,effective,stored===null);await page.waitForTimeout(250);
    const frames=await page.evaluate(()=>window.ktInitialFrames);
    assert(frames.length>0); assert(frames.every(f=>f.mode.includes(`quarto-${effective}`) && f.bg===(effective==="dark"?"rgb(36, 35, 33)":"rgb(251, 250, 247)")),`${engine}: initial flash ${JSON.stringify(frames)}`);
    count.initialLoads++; await context.close();
  }
}
async function breakpoints(browser,count){
  const page=await browser.newPage({colorScheme:"dark"});
  for(const locale of ["zh","en"])for(const [route,width,selector,display] of [
    ["collectibles/memories",575,"table.kt-memory-responsive-table tr[id^=memory-]","grid"],
    ["collectibles/memories",576,"table.kt-memory-responsive-table tr[id^=memory-]","table-row"],
    ["collectibles/codex",459,"table.kt-codex-responsive-table tbody tr","grid"],
    ["collectibles/codex",460,"table.kt-codex-responsive-table tbody tr","table-row"],
    ["guide/spiceport",352,"section:has(> p > #spiceport-day5) + section > .kt-travel-schedule.kt-record-mode > table tbody tr","block"],
    ["guide/spiceport",353,"section:has(> p > #spiceport-day5) + section > .kt-travel-schedule.kt-record-mode > table tbody tr","block"]]){
    await page.setViewportSize({width,height:900});await page.goto(url(locale,route));await ready(page,"dark");
    assert.equal(await page.locator(selector).first().evaluate(e=>getComputedStyle(e).display),display);
    count.breakpoints++;
  }
  for(const [route,id] of [["collectibles/memories","memory-redroot-memories-2"],["collectibles/codex","codex-people-3"],["guide/aris","aris-day7-tavern"]]){
    await page.setViewportSize({width:390,height:900});await page.goto(url("zh",route,"#"+id));await ready(page,"dark");
    if(await page.locator(`#${id}`).count()){
      const target=await page.locator(`#${id}`).evaluate(e=>({bg:getComputedStyle(e).backgroundColor,target:e.matches(":target")}));
      assert(target.target); if(route.includes("collectibles")) assert.equal(target.bg,"rgb(68, 58, 41)");
      else assert.equal(await page.locator(`p:has(> #${id}) + section > h3`).evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(68, 58, 41)");
      count.targets++;
    }
  }
  await page.close();
}

async function searchStates(browser,count){
  for(const locale of ["zh","en"]){
    const context=await browser.newContext({colorScheme:"dark",viewport:{width:390,height:500}});
    const page=await context.newPage();await page.goto(url(locale));await ready(page,"dark");
    let release;
    const gate=new Promise(resolve=>release=resolve);
    await page.route("**/kt-search.json",async route=>{await gate;await route.continue();});
    await page.locator("#kt-search-launcher").click();await page.locator("#kt-search-input").fill("Macsen");
    await page.waitForFunction(()=>/正在加载|Loading/.test(document.getElementById("kt-search-status").textContent));
    await contrast(page,count);release();await page.locator(".kt-search-result").first().waitFor();
    await page.unroute("**/kt-search.json");
    await page.locator("#kt-search-input").fill("zzzz-kt-no-match");
    await page.waitForFunction(()=>/没有找到结果|No results/.test(document.getElementById("kt-search-status").textContent));await contrast(page,count);
    await page.locator("#kt-search-close").click();
    await page.goto(url(locale));await ready(page,"dark");await page.route("**/kt-search.json",route=>route.abort());
    await page.locator("#kt-search-launcher").click();await page.locator("#kt-search-input").fill("Memories");
    await page.waitForFunction(()=>/暂时不可用|temporarily unavailable/.test(document.getElementById("kt-search-status").textContent));await contrast(page,count);
    await page.locator("#kt-search-close").click();await page.unroute("**/kt-search.json");
    count.searchStates+=3;await context.close();
  }
}

async function review(browser) {
  const context=await browser.newContext({colorScheme:"light"}); const page=await context.newPage();
  const shot=async name=>{await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:path.join(evidence,name+'.png')});};
  for(const mode of ["light","dark"]){await page.emulateMedia({colorScheme:mode});for(const [locale,route,width,label,selector] of [
    ["en","index",1440,"home-en",null],["en","reference/relationships",1440,"relationships-en",null],
    ["zh","collectibles/memories",1440,"memories-zh","#memory-redroot-memories-1"],
    ["en","collectibles/codex",1280,"codex-en","#codex-people-1"],
    ["zh","collectibles/equipment",1024,"equipment-zh","table"]]){
    await page.setViewportSize({width,height:900});await page.goto(url(locale,route));await ready(page,mode);
    if(selector) await page.locator(selector).first().evaluate(e=>{
      const table=e.closest("table") || e;
      scrollTo(0,scrollY+table.getBoundingClientRect().top-110);
    });
    await page.waitForTimeout(120); await shot(`${mode}-${label}-${width}`);
  }}
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.goto(url("zh"));await ready(page,"dark");await shot(`dark-home-zh-${width}`);}
  await page.setViewportSize({width:390,height:900});await page.goto(url("zh"));await ready(page,"dark");
  await page.locator("#quarto-header .navbar-toggler").click();await page.waitForTimeout(210);await shot("dark-global-nav-390");
  await page.locator("#kt-theme-controls").scrollIntoViewIfNeeded();await shot("dark-theme-controls-390");await page.keyboard.press("Escape");
  await page.goto(url("zh","help"));await ready(page,"dark");
  await page.locator("#kt-page-toc-trigger").click();await shot("dark-page-toc-390");await page.keyboard.press("Escape");
  await page.locator("#kt-search-launcher").click();await page.locator("#kt-search-input").fill("Macsen");await page.locator(".kt-search-result").first().waitFor();await shot("dark-search-390");await page.keyboard.press("Escape");
  await page.goto(url("zh","guide/aris"));await ready(page,"dark");await page.locator("details").first().evaluate(e=>e.open=true);await page.locator("summary").first().evaluate(e=>scrollTo(0,scrollY+e.getBoundingClientRect().top-100));await page.waitForTimeout(120);await shot("dark-details-390");
  for(const [route,id,width,label] of [["collectibles/memories","memory-redroot-wilds-memories-2",390,"memory"],["collectibles/codex","codex-people-3",390,"codex"]]){
    await page.setViewportSize({width,height:900});await page.goto(url("zh",route,"#"+id));await ready(page,"dark");await shot(`dark-${label}-compact-${width}`);
  }
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({colorScheme:"light"});await page.goto(url("en"));await ready(page,"light");await page.locator(".quarto-color-scheme-toggle").click();await state(page,"dark",false);await shot("state-manual-dark-system-light");
  await page.emulateMedia({colorScheme:"dark"});await Promise.all([page.waitForNavigation(),page.locator("#kt-theme-auto").click()]);await state(page,"dark",true);await shot("state-auto-system-dark");
  await page.locator(".quarto-color-scheme-toggle").click();await state(page,"light",false);await shot("state-manual-light-system-dark");
  await context.close();
}
async function run(engine,launcher,options={}) {
  const browser=await launcher.launch({headless:true,...options});
  const count={engine,matrix:0,lightBaseline:0,interactions:0,details:0,contrast:0,transitions:0,initialLoads:0,breakpoints:0,targets:0,shortHeight:0,searchStates:0};
  const currentLight=new Map();
  try{
    await transitions(browser,engine,count);
    console.log(`${engine}: state/persistence and initial frames PASS`);
    const context=await browser.newContext({viewport:{width:1440,height:900},colorScheme:"light"}); const page=await context.newPage();
    for(const mode of ["light","dark"]){
      await page.emulateMedia({colorScheme:mode});
      for(const locale of ["zh","en"])for(const width of widths)for(const route of routes){
        await page.setViewportSize({width,height:900});await page.goto(url(locale,route));await ready(page,mode);
        const before=route!=="index" && baseline.find(s=>s.locale===locale&&s.width===width&&s.route===route);
        const selectors=before?before.elements.map(e=>e.s):["#quarto-header","#quarto-document-content","#kt-page-toc-panel","#quarto-document-content h1","#quarto-document-content p"];
        const actual=await measure(page,selectors);assert(actual.docWidth<=width+1,`${engine} ${mode} ${locale} ${route} ${width} overflow`);
        const k=`${locale}/${width}/${route}`;
        if(mode==="light"){
          currentLight.set(k,actual);
          if(before&&engine==="WebKit"){geometry(actual,before,k,true);count.lightBaseline++;}
        }else{
          geometry(actual,currentLight.get(k),k,false);await contrast(page,count);
          assert.equal(await page.evaluate(()=>getComputedStyle(document.body).color),"rgb(230, 227, 220)");
        }
        if(route==="index")await interactions(page,locale,width,mode,count);
        if(route==="guide/aris"){
          assert.equal(await page.locator("main.content details").count(),2);
          await page.locator("main.content details").first().evaluate(e=>e.open=true);
          assert.equal(await page.locator("main.content summary").first().evaluate(e=>getComputedStyle(e).borderBottomWidth),"1px");
          if(mode==="dark")await contrast(page,count);count.details++;
        }
        count.matrix++;
      }
      console.log(`${engine}: ${mode} ${count.matrix} page/width states PASS`);
    }
    for(const width of [1366,390])for(const locale of ["zh","en"]){
      await page.setViewportSize({width,height:500});await page.goto(url(locale,"help"));await ready(page,"dark");await interactions(page,locale,width,"dark",count);count.shortHeight++;
    }
    await context.close(); await breakpoints(browser,count); await searchStates(browser,count);
    if(engine==="WebKit")await review(browser);
    reports.push(count); fs.writeFileSync(path.join(evidence,"theme-runtime.json"),JSON.stringify(reports,null,2));
    console.log(`Theme ${engine}: PASS ${JSON.stringify(count)}`);
  }finally{await browser.close();}
}
(async()=>{fs.mkdirSync(evidence,{recursive:true});
  if(process.env.KT_THEME_REVIEW_ONLY === "1"){
    const browser=await webkit.launch({headless:true});
    try{await review(browser);console.log("Theme review screenshots refreshed");}finally{await browser.close();}
    return;
  }
  await run("WebKit",webkit);await run("Edge",chromium,{executablePath:"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"});})().catch(e=>{console.error(e);process.exitCode=1});
