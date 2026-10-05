"use strict";
// Engineering assertions only; no screenshots or visual acceptance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");
const base = process.env.KT_BASE_URL;
const evidence = path.resolve(process.env.KT_HEADER_DIR || path.join(__dirname, "../test-results/mobile-header"));
const before = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/desktop-layout.json")));
const close = (a, b, label) => assert(Math.abs(a - b) <= 1, `${label}: ${a} / ${b}`);
const url = (locale, route = "guide/aris") => `${base}/${locale === "en" ? "en/" : ""}${route}.html`;
const reports = [];
async function state(page) {
  return page.evaluate(() => {
    const rect = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
      return { x:r.x, y:r.y, w:r.width, h:r.height, right:r.right, bottom:r.bottom }; };
    return { active:document.documentElement.classList.contains("kt-two-tier-mobile"),
      header:rect("#quarto-header"), brand:rect("#kt-publication-brand"),
      theme:rect("#kt-theme-controls"), search:rect("#kt-search-launcher"),
      row:rect("#kt-mobile-header-row"), context:rect("#kt-mobile-header-context"),
      global:rect(".navbar-toggler"), page:rect("#kt-page-toc-trigger"),
      drawer:rect("#navbarCollapse"), toc:rect("#kt-page-toc-panel"),
      doc:document.documentElement.scrollWidth, width:innerWidth, height:innerHeight,
      contextText:document.querySelector("#kt-mobile-header-context").textContent,
      source:document.querySelector(".kt-page-breadcrumb ol")
        ? [...document.querySelector(".kt-page-breadcrumb ol").children].map(n=>n.textContent.trim()).join(" › ")
        : document.querySelector('.nav-link[aria-current="page"] .menu-text')?.textContent.trim(),
      ids:["kt-search-launcher","kt-theme-controls","kt-theme-auto","kt-page-toc-trigger","navbarCollapse","TOC"]
        .map(id=>document.querySelectorAll(`[id="${id}"]`).length),
      toggleCount:document.querySelectorAll(".quarto-color-scheme-toggle").length,
      languageInDrawer:!!document.querySelector("#navbarCollapse .kt-language-utility"),
      themeInTools:!!document.querySelector(".quarto-navbar-tools > #kt-theme-controls"),
      mainInert:document.querySelector("main.content").inert,
      headerInert:document.querySelector("#quarto-header").inert,
      focus:document.activeElement.id, hash:location.hash, history:history.length };
  });
}
async function run(engine, type, options = {}) {
  const browser = await type.launch({ headless:true, ...options });
  const context = await browser.newContext({ colorScheme:"light" });
  const page = await context.newPage();
  const result = { engine, desktop:0, mobile:0, drawers:0, scroll:0, theme:0, transition:0, language:0 };
  try {
    for (const expected of before.filter(b=>b.engine===engine && b.route!=="index")) {
      await page.setViewportSize({width:expected.width,height:900});
      await page.goto(url(expected.locale,expected.route));
      await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(120);
      const actual = await page.evaluate(selectors=>selectors.map(({s})=>{
        const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);
        return {s,x:r.x,y:r.y,w:r.width,h:r.height,color:c.color,bg:c.backgroundColor,font:c.fontSize,display:c.display};
      }), expected.state);
      actual.forEach((a,i)=>{ const e=expected.state[i];
        for(const p of ["x","y","w","h"]){
          // Header geometry is fixed; article and TOC height depend on content.
          // Compare those heights across a live resize round trip below.
          const changedArticleHeight = p === "h"
            && ["#quarto-document-content","#kt-page-toc-panel"].includes(a.s);
          // The approved desktop article expanded from 840 to 960; the
          // historical header fixture remains valid for every other dimension.
          const approved = a.s === "#quarto-document-content" && p === "w"
            ? Math.min(960, expected.width - 264) : e[p];
          if (!changedArticleHeight) close(a[p],approved,`${engine} desktop ${expected.width} ${a.s} ${p}`);
        }
        for(const p of ["color","bg","font","display"])assert.equal(a[p],e[p]); });
      if (expected.route === "collectibles/memories") {
        assert.equal(await page.locator("#kt-memory-gallery [role=tab]").count(),8);
        assert.equal(await page.locator("tr[id^=memory-]").count(),87);
        assert.equal(await page.locator("table.kt-memory-responsive-table").count(),11);
      }
      assert.equal((await state(page)).active,false);
      await page.setViewportSize({width:390,height:900}); await page.waitForTimeout(150);
      await page.setViewportSize({width:expected.width,height:900}); await page.waitForTimeout(150);
      const restored = await page.evaluate(selectors=>selectors.map(({s})=>{
        const e=document.querySelector(s),r=e.getBoundingClientRect();
        return {s,x:r.x,y:r.y,w:r.width,h:r.height};
      }), expected.state);
      restored.forEach((a,i)=>{for(const p of ["x","y","w","h"])
        close(a[p],actual[i][p],`${engine} desktop round trip ${expected.width} ${a.s} ${p}`);});
      result.desktop++;
    }
    for(const locale of ["zh","en"]) for(const mode of ["light","dark"])
      for(const [width,height] of [[991,900],[430,900],[390,900],[375,900],[352,900],[320,900],[390,500]]) {
        await page.emulateMedia({colorScheme:mode});
        await page.setViewportSize({width,height}); await page.goto(url(locale));
        await page.waitForFunction(mode=>document.body.classList.contains(`quarto-${mode}`),mode);
        await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(120);
        let s=await state(page);
        assert(s.active && s.themeInTools && s.languageInDrawer);
        assert.deepEqual(s.ids,[1,1,1,1,1,1]);assert.equal(s.toggleCount,1);
        assert.equal(s.contextText,s.source);assert(s.contextText);
        assert(s.doc<=width+1);assert(s.brand.w>0 && s.context.w>0);
        assert(s.brand.right<=s.theme.x+1 && s.theme.right<=s.search.x+1 && s.search.right<=width);
        assert(s.search.bottom<=s.row.y+1 && s.brand.bottom<=s.row.y+1);
        assert(s.global.right<=s.context.x+1 && s.context.right<=s.page.x+1);
        close(s.global.y,s.page.y,"second-row alignment");
        assert(s.header.h>=108 && s.header.h<=110);
        const hitAreas=await page.locator("#kt-theme-controls [role=button], #kt-theme-auto, #kt-search-launcher").evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,right:r.right};}));
        assert.equal(hitAreas.length,3);hitAreas.forEach(r=>assert(r.w>=44 && r.h>=44));
        for(let i=1;i<hitAreas.length;i++)close(hitAreas[i].x-hitAreas[i-1].right,6,"uniform utility gap");
        hitAreas.forEach(r=>close(r.w,44,"uniform utility width"));
        const originalHash=s.hash,originalHistory=s.history;
        await page.locator(".navbar-toggler").click();await page.waitForTimeout(230);
        s=await state(page);close(s.drawer.y,s.header.bottom,"global top");close(s.drawer.bottom,height,"global bottom");
        assert.equal(s.focus,"kt-global-nav-close");
        assert(await page.locator("#quarto-content").evaluate(n=>n.inert));
        await page.locator("#kt-theme-auto").focus();await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(()=>document.activeElement.id),"kt-page-toc-trigger");
        await page.keyboard.press("Escape");assert(await page.locator(".navbar-toggler").evaluate(n=>n===document.activeElement));
        await page.locator(".navbar-toggler").click();
        await page.locator("#kt-global-nav-backdrop").click({position:{x:width-5,y:height/2}});
        assert.equal(await page.locator("body.kt-global-nav-open").count(),0);result.drawers++;
        await page.locator("#kt-page-toc-trigger").click();s=await state(page);
        close(s.toc.y,s.header.bottom,"TOC top");close(s.toc.bottom,height,"TOC bottom");
        assert(s.mainInert && s.headerInert && s.focus==="kt-page-toc-close");
        await page.keyboard.press("Shift+Tab");assert(await page.locator("#TOC").evaluate(n=>n.contains(document.activeElement)));
        await page.keyboard.press("Tab");assert.equal(await page.evaluate(()=>document.activeElement.id),"kt-page-toc-close");
        await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.activeElement.id),"kt-page-toc-trigger");
        await page.locator("#kt-page-toc-trigger").click();
        await page.locator("#kt-page-toc-backdrop").click({position:{x:2,y:2}});
        assert.equal(await page.locator("body.kt-page-toc-open").count(),0);result.drawers++;
        await page.locator("#kt-search-launcher").click();
        await page.locator("#kt-search-input").fill("Macsen");await page.locator(".kt-search-result").first().waitFor();
        await page.keyboard.press("Escape");await page.waitForFunction(()=>document.activeElement.id==="kt-search-launcher");
        s=await state(page);assert.equal(s.hash,originalHash);assert.equal(s.history,originalHistory);
        await page.evaluate(()=>scrollTo(0,1100));await page.waitForTimeout(400);s=await state(page);
        assert(s.header.bottom<=1 && s.row.bottom<=1 && s.brand.bottom<=1 && s.search.bottom<=1,"both rows unpinned");
        // Programmatic activation checks offscreen offsets without forcing the header to return.
        await page.locator(".navbar-toggler").evaluate(n=>n.click());await page.waitForTimeout(230);
        s=await state(page);close(s.drawer.y,0,"unpinned global top");await page.locator("#kt-global-nav-close").click();
        await page.locator("#kt-page-toc-trigger").evaluate(n=>n.click());s=await state(page);
        close(s.toc.y,0,"unpinned TOC top");await page.locator("#kt-page-toc-close").click();
        await page.evaluate(()=>scrollTo(0,500));await page.waitForTimeout(400);s=await state(page);
        close(s.header.y,0,"returned header");assert(s.row.bottom>0 && s.brand.bottom>0 && s.search.bottom>0);result.scroll++;
        assert(!s.mainInert && !s.headerInert);result.mobile++;
      }
    for(const locale of ["zh","en"]) {
      await page.setViewportSize({width:390,height:500});await page.emulateMedia({colorScheme:"light"});await page.goto(url(locale));
      await page.locator(".quarto-color-scheme-toggle").press("Enter");
      await page.waitForFunction(()=>document.body.classList.contains("quarto-dark"));
      assert.equal(await page.evaluate(()=>localStorage.getItem("quarto-color-scheme")),"alternate");
      await page.reload();assert(await page.locator("body.quarto-dark").count());
      await page.locator(".navbar-toggler").click();await page.locator(".kt-language-utility").click();
      await page.waitForURL(url(locale==="zh"?"en":"zh"));assert(await page.locator("body.quarto-dark").count());result.language++;
      await page.emulateMedia({colorScheme:"dark"});
      await Promise.all([page.waitForNavigation(),page.locator("#kt-theme-auto").click()]);
      assert.equal(await page.evaluate(()=>localStorage.getItem("quarto-color-scheme")),null);
      assert.equal(await page.locator("#kt-theme-auto").getAttribute("aria-pressed"),"true");
      await page.emulateMedia({colorScheme:"light"});await page.waitForFunction(()=>document.body.classList.contains("quarto-light"));
      await page.locator(".quarto-color-scheme-toggle").press("Space");await page.waitForFunction(()=>document.body.classList.contains("quarto-dark"));
      await page.locator(".quarto-color-scheme-toggle").click();await page.waitForFunction(()=>document.body.classList.contains("quarto-light"));
      await Promise.all([page.waitForNavigation(),page.locator("#kt-theme-auto").click()]);result.theme++;
      for(const width of [992,991,992,390]){
        await page.setViewportSize({width,height:900});await page.waitForTimeout(150);const s=await state(page);
        assert.equal(s.active,width<=991);assert.equal(s.themeInTools,width<=991);
        assert.deepEqual(s.ids,[1,1,1,1,1,1]);
        if(width===992){assert.equal(s.row.h,0);close(s.header.h,68.28125,"desktop restored");}
        else {assert(s.row.h>=44);await page.locator(".navbar-toggler").click();await page.keyboard.press("Escape");}
        result.transition++;
      }
    }
    console.log(`${engine}: two-tier PASS ${JSON.stringify(result)}`);reports.push(result);
  } finally { await browser.close(); }
}
(async()=>{
  assert(base,"KT_BASE_URL required");
  await run("WebKit",webkit);
  await run("Edge",chromium,{executablePath:"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"});
  fs.writeFileSync(path.join(evidence,"header-runtime.json"),JSON.stringify(reports,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
