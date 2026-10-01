"use strict";

// Publication identity, geometry, and interaction against the assembled local site.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");

const base = process.env.KT_BASE_URL || "http://127.0.0.1:18775";
const shots = process.env.KT_SCREENSHOT_DIR;
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const widths = [1728, 1440, 1280, 1024, 992, 991, 820, 768, 430, 390, 375, 352, 320];
const url = (locale, route = "index") => `${base}/${locale === "en" ? "en/" : ""}${route}.html`;

async function snapshot(page) {
  return page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node) return {x:0,y:0,right:0,bottom:0,width:0,height:0};
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const style = selector => {
      const node = document.querySelector(selector);
      if (!node) return {display:"none",background:"transparent",radius:"0px"};
      const s = getComputedStyle(node);
      return { display: s.display, background: s.backgroundColor, radius: s.borderRadius };
    };
    return {
      width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      brandCount: document.querySelectorAll("#kt-publication-brand").length,
      brandName: document.querySelector(".kt-brand-name").textContent,
      brandEdition: document.querySelector(".kt-brand-edition").textContent,
      header: box("#quarto-header"), brand: box("#kt-publication-brand"),
      toggle: box("#quarto-header .navbar-toggler"),
      navigation: box("#navbarCollapse .navbar-nav.me-auto"),
      language: box("#navbarCollapse .navbar-nav.ms-auto"),
      page: box("#kt-page-toc-trigger"), search: box("#kt-search-launcher"),
      global: box("#navbarCollapse"), globalBackdrop: box("#kt-global-nav-backdrop"),
      pageDrawer: box("#kt-page-toc-panel"),
      bodyStyle: style("body"), headerStyle: style("#quarto-header .navbar"),
      brandStyle: style("#kt-publication-brand"),
      globalStyle: style("#navbarCollapse"), pageStyle: style("#kt-page-toc-panel"),
      dialogStyle: style("#kt-search-dialog"),
      menuStyle: style("#navbarCollapse .dropdown-menu"),
      inputStyle: style("#kt-search-input"),
      toggleStyle: style("#quarto-header .navbar-toggler"),
      pageTriggerStyle: style("#kt-page-toc-trigger"),
      searchStyle: style("#kt-search-launcher"),
      panelToken: getComputedStyle(document.documentElement).getPropertyValue("--kt-surface-panel").trim(),
      raisedToken: getComputedStyle(document.documentElement).getPropertyValue("--kt-surface-raised").trim(),
      twoTier: document.documentElement.classList.contains("kt-two-tier-mobile"),
      bodyOpen: document.body.classList.contains("kt-global-nav-open"),
      pageOpen: document.body.classList.contains("kt-page-toc-open"),
      focus: document.activeElement.id,
    };
  });
}

async function run(name, engine, options = {}) {
  const browser = await engine.launch({ headless: true, ...options });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const counts = { matrix: 0, navActive: 0, drawers: 0, schedule: 0, toc: 0, scroll: 0, screenshots: 0 };
  const shot = async (filename, locator = null) => {
    if (!shots) return;
    const file = path.join(shots, `${name.toLowerCase()}-${filename}.png`);
    if (locator) await locator.screenshot({ path: file });
    else await page.screenshot({ path: file });
    counts.screenshots++;
  };
  try {
    for (const locale of ["zh", "en"]) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url(locale));
        const s = await snapshot(page);
        assert.equal(s.brandCount, 1, `${name} ${locale} ${width}: one masthead`);
        assert.equal(s.brandName, "Killigan’s Treasure");
        assert.equal(s.brandEdition, locale === "zh" ? "攻略 · Public v0.57a" : "Guide · Public v0.57a");
        if (width >= 992) {
          assert(s.header.height >= 67 && s.header.height <= 69,
            `${name} ${locale} ${width}: desktop header height ${s.header.height}`);
        } else {
          assert(s.twoTier ? s.header.height >= 108 && s.header.height <= 110 : s.header.height <= 63, `${name} ${locale} ${width}: narrow header grew to ${s.header.height}`);
        }
        assert(s.documentWidth <= width + 1, `${name} ${locale} ${width}: document overflow`);
        assert.equal(s.headerStyle.background, s.bodyStyle.background, `${name}: header/page reading plane differs`);
        if (width <= 991) assert.equal(s.pageStyle.display,"none", `${name}: home unexpectedly has a TOC`);
        assert.equal(s.inputStyle.radius, s.searchStyle.radius, `${name}: input/control radii differ`);
        assert.notEqual(s.dialogStyle.background, s.globalStyle.background, `${name}: raised/panel surfaces collapse`);
        if (width >= 992) {
          assert.equal(s.menuStyle.radius, s.dialogStyle.radius, `${name}: floating panel radii differ`);
          assert(s.brand.width > 0 && s.brand.right + 10 <= s.navigation.x,
            `${name} ${locale} ${width}: masthead/navigation collision`);
          assert(s.navigation.right < s.language.x && s.language.right < s.search.x,
            `${name} ${locale} ${width}: desktop tools collision`);
          assert.equal(s.page.width, 0);
        } else {
          assert.equal(s.menuStyle.radius, "0px", `${name}: inline mobile menu became a floating card`);
          assert.notEqual(s.globalStyle.background, s.bodyStyle.background, `${name}: drawer/page surfaces collapse`);
          assert.equal(s.toggleStyle.radius, s.searchStyle.radius, `${name}: visible control radii differ`);
          assert.equal(s.page.width,0);
          assert(s.toggle.width > 0 && s.search.bottom <= s.toggle.y + 1,
            `${name} ${locale} ${width}: narrow controls collision`);
          assert(s.toggle.height > 0 && s.toggle.height <= s.header.height && s.search.height >= 44,
            `${name} ${locale} ${width}: control heights differ`);
          assert.equal(await page.locator("#kt-page-toc-trigger, #TOC").count(),0);
          if (s.twoTier) {
            assert(s.brand.width > 0 && s.brand.right + 4 <= s.search.x && s.brand.bottom <= s.toggle.y + 1,
              `${name} ${locale} ${width}: two-tier masthead collision`);
          } else if (width >= 390) {
            assert(s.brand.width > 0 && s.toggle.right < s.brand.x && s.brand.right + 4 <= s.page.x,
              `${name} ${locale} ${width}: narrow masthead collision`);
          } else assert.equal(s.brandStyle.display, "none", `${name} ${locale} ${width}: brand should yield to controls`);
        }
        counts.matrix++;
      }
    }

    for (const locale of ["zh", "en"]) {
      for (const [route, group] of [
        ["index", false], ["guide/aris", true], ["reference/relationships", true],
        ["collectibles/memories", true], ["help", false],
      ]) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(url(locale, route));
        const nav = await page.evaluate(() => {
          const top = [...document.querySelectorAll("#navbarCollapse .navbar-nav.me-auto > li > a")];
          const currentTop = top.filter(a => a.classList.contains("active") || a.classList.contains("kt-section-active"));
          const currentLeaf = [...document.querySelectorAll("#navbarCollapse a[aria-current='page']")];
          return { topCount: currentTop.length, leafCount: currentLeaf.length,
            sectionActive: currentTop[0]?.classList.contains("kt-section-active"),
            parentAria: currentTop[0]?.getAttribute("aria-current"),
            leafDropdown: currentLeaf[0]?.classList.contains("dropdown-item"),
            shadow: currentTop[0] ? getComputedStyle(currentTop[0]).boxShadow : "",
            background: currentTop[0] ? getComputedStyle(currentTop[0]).backgroundColor : "" };
        });
        assert.equal(nav.topCount, 1, `${name} ${locale} ${route}: one active top destination`);
        assert.equal(nav.leafCount, 1, `${name} ${locale} ${route}: one real current destination`);
        assert.equal(nav.sectionActive, group, `${name} ${locale} ${route}: category state`);
        if (group) {
          assert.equal(nav.parentAria, null, `${name} ${locale} ${route}: category falsely owns aria-current`);
          assert.equal(nav.leafDropdown, true, `${name} ${locale} ${route}: submenu destination lacks aria-current`);
        }
        assert(nav.shadow.includes("-2px") && nav.shadow.includes("inset") &&
          nav.background === "rgba(0, 0, 0, 0)", `${name} ${locale} ${route}: active rule parity`);
        counts.navActive++;
      }
    }

    for (const [width, height] of [[991, 900], [430, 900], [390, 900], [390, 500], [320, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto(url("zh"));
      await page.locator("#quarto-header .navbar-toggler").click();
      await page.waitForFunction(() => document.body.classList.contains("kt-global-nav-open"));
      await page.waitForTimeout(210);
      const s = await snapshot(page);
      assert(Math.abs(s.global.y - s.header.bottom) <= 1, `${name} ${width}x${height}: drawer/header gap`);
      assert(Math.abs(s.globalBackdrop.y - s.header.bottom) <= 1, `${name} ${width}x${height}: backdrop covers header`);
      assert(Math.abs(s.global.width - (s.twoTier ? Math.min(width * .78, 288) : Math.min(width * .86, 320))) <= 1,
        `${name} ${width}x${height}: drawer width changed`);
      assert(s.global.bottom <= height + 1 && s.documentWidth <= width + 1,
        `${name} ${width}x${height}: drawer viewport overflow`);
      counts.drawers++;
      if (name === "WebKit" && width === 390 && height === 500) await shot("global-nav-zh-390x500");
      await page.locator("#kt-global-nav-close").click();
    }

    // Representative component grammar and narrow transitions.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url("zh", "guide/aris"));
    const details = page.locator("#quarto-document-content details").first();
    assert.equal(await details.evaluate(node => getComputedStyle(node).borderRadius),
      (await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) * .5)) + "px",
      `${name}: .5rem disclosure radius`);
    if (name === "WebKit") {
      await shot("aris-details-zh-390", details);
      await details.locator("summary").click();
      await shot("aris-details-open-zh-390", details);
    }

    await page.goto(url("zh", "collectibles/memories"));
    if (name === "WebKit") await shot("memories-locator-zh-390", page.locator("#kt-memory-locator"));

    await page.goto(url("zh"));
    if (name === "WebKit") await shot("home-zh-390-closed");
    await page.locator(".navbar-toggler").click();
    await page.waitForTimeout(210);
    await shot("global-nav-zh-390");
    await page.locator("#navbarCollapse .dropdown-toggle").first().click();
    await shot("journey-expanded-zh-390");
    await page.goto(url("zh", "help"));
    await page.locator(".navbar-toggler").click();
    await page.locator("#kt-page-toc-trigger").click();
    assert.equal((await snapshot(page)).bodyOpen, false);
    assert.equal((await snapshot(page)).pageOpen, true);
    await shot("page-toc-zh-390");
    await page.locator("#kt-page-toc-close").click();
    await page.locator("#kt-search-launcher").click();
    await page.locator("#kt-search-input").fill("阿瑞斯");
    assert.equal((await snapshot(page)).focus, "kt-search-input");
    await shot("search-zh-390");
    await page.locator("#kt-search-close").click();

    if (name === "WebKit") {
      for (const [locale, route, width, height, filename] of [
        ["zh", "index", 1440, 900, "home-zh-1440"],
        ["en", "index", 1440, 900, "home-en-1440"],
        ["zh", "guide/aris", 1440, 900, "aris-zh-1440"],
        ["en", "collectibles/equipment", 1280, 900, "equipment-en-1280"],
        ["zh", "index", 1024, 900, "home-zh-1024"],
        ["zh", "index", 992, 900, "home-zh-992"],
        ["zh", "index", 991, 900, "home-zh-991"],
        ["en", "index", 320, 844, "home-en-320-closed"],
        ["en", "help", 320, 844, "help-en-320"],
        ["zh", "collectibles/memories", 1024, 900, "memories-zh-1024"],
        ["en", "collectibles/codex", 1024, 900, "codex-en-1024"],
        ["en", "help", 1366, 500, "help-en-1366x500"],
      ]) {
        await page.setViewportSize({ width, height });
        await page.goto(url(locale, route));
        await shot(filename);
      }
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(url("en"));
      await page.locator(".navbar-toggler").click();
      await page.waitForTimeout(210);
      await shot("global-nav-en-320");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(url("zh"));
      await page.locator("#navbarCollapse .dropdown-toggle").first().click();
      await shot("desktop-journey-zh-1440");
    } else {
      for (const [width, filename] of [[1440, "home-zh-1440"], [390, "home-zh-390-closed"],
        [320, "home-en-320-closed"], [992, "home-zh-992"], [991, "home-zh-991"]]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url(filename.includes("-en-") ? "en" : "zh"));
        await shot(filename);
      }
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(url("en"));
      await page.locator(".navbar-toggler").click();
      await page.waitForTimeout(210);
      await shot("global-nav-en-320");
    }

    for (const locale of ["zh", "en"]) {
      for (const width of [1728, 1440, 1280, 1024, 992]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url(locale, "guide/aris"));
        const toc = await page.evaluate(() => {
          const rail = document.querySelector("#kt-page-toc-panel");
          const article = document.querySelector("main.content");
          const r = rail.getBoundingClientRect(), a = article.getBoundingClientRect();
          const style = getComputedStyle(rail);
          const lang = getComputedStyle(document.querySelector(".kt-language-utility"));
          const tokens = getComputedStyle(document.documentElement);
          return { railRight: r.right, articleLeft: a.left, railWidth: r.width,
            railBackground: style.backgroundColor, railBorder: style.borderRightWidth,
            bodyBackground: getComputedStyle(document.body).backgroundColor,
            shellBackground: getComputedStyle(document.querySelector("#quarto-header .navbar")).backgroundColor,
            panelToken: tokens.getPropertyValue("--kt-surface-panel").trim(),
            languageSize: parseFloat(lang.fontSize), rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
            languageWeight: parseFloat(lang.fontWeight) };
        });
        assert(toc.railRight < toc.articleLeft && Math.abs(toc.railWidth - 192) <= 1,
          `${name} ${locale} ${width}: left TOC geometry changed`);
        assert.equal(toc.railBorder, "1px", `${name} ${locale} ${width}: TOC rule missing`);
        assert.equal(toc.railBackground, toc.bodyBackground,
          `${name} ${locale} ${width}: TOC left the base reading plane`);
        assert.equal(toc.shellBackground, toc.bodyBackground,
          `${name} ${locale} ${width}: shell left the base reading plane`);
        assert(toc.languageSize / toc.rootSize >= .78 && toc.languageSize / toc.rootSize <= .82 && toc.languageWeight >= 650,
          `${name} ${locale} ${width}: language utility typography ${toc.languageSize}/${toc.rootSize}/${toc.languageWeight}`);
        counts.toc++;
      }
    }

    // The neutral separator spans the viewport for short and long TOCs alike.
    for (const [route, width, height] of [
      ["guide/aris", 1440, 900], ["guide/aris", 1280, 900], ["guide/aris", 1024, 900], ["guide/aris", 992, 900],
      ["collectibles/memories", 1440, 900], ["collectibles/memories", 1280, 900],
      ["collectibles/memories", 1024, 900], ["collectibles/memories", 992, 900],
      ["help", 1366, 500],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(url("zh", route));
      for (const scrollY of [0, 500]) {
        await page.evaluate(y => scrollTo(0, y), scrollY);
        await page.waitForTimeout(100);
        const s = await page.evaluate(() => {
          const header = document.querySelector("#quarto-header").getBoundingClientRect();
          const rail = document.querySelector("#kt-page-toc-panel");
          const box = rail.getBoundingClientRect();
          const probe = document.createElement("span");
          probe.style.borderRight = "1px solid var(--kt-border)";
          document.body.append(probe);
          const structural = getComputedStyle(probe).borderRightColor;
          probe.remove();
          return { headerBottom: header.bottom, railTop: box.top, railBottom: box.bottom,
            railBorder: getComputedStyle(rail).borderRightColor, structural };
        });
        assert(Math.abs(s.railTop - s.headerBottom) <= 1 && Math.abs(s.railBottom - height) <= 1,
          `${name} ${route} ${width}x${height} scroll=${scrollY}: broken full-height separator ${JSON.stringify(s)}`);
        assert.equal(s.railBorder, s.structural, `${name}: TOC separator is not neutral`);
        counts.toc++;
      }
    }

    const scrollState = () => page.evaluate(() => {
      const header = document.querySelector("#quarto-header");
      const rail = document.querySelector("#kt-page-toc-panel");
      const article = document.querySelector("main.content");
      const rect = node => { const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, bottom: r.bottom, width: r.width, height: r.height }; };
      return { width: innerWidth, height: innerHeight, header: rect(header), rail: rect(rail),
        article: rect(article), transform: getComputedStyle(header).transform,
        unpinned: header.classList.contains("headroom--unpinned"),
        documentOverflow: document.documentElement.scrollWidth - innerWidth,
        railScrollHeight: rail.scrollHeight, railClientHeight: rail.clientHeight };
    });
    for (const [width, height, locale, route] of [
      [1440, 900, "zh", "guide/aris"], [1280, 900, "en", "guide/aris"],
      [1024, 900, "zh", "collectibles/memories"], [992, 900, "en", "collectibles/codex"],
      [991, 900, "zh", "guide/aris"], [1366, 500, "en", "help"],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(url(locale, route));
      const before = await scrollState();
      await page.evaluate(() => scrollTo(0, 1100));
      await page.waitForTimeout(350);
      const after = await scrollState();
      assert(after.documentOverflow <= 1 && Math.abs(after.article.x - before.article.x) <= 1 &&
        Math.abs(after.article.width - before.article.width) <= 1,
      `${name} ${width}: scroll changed article geometry`);
      if (width >= 992) {
        assert(after.header.y >= -1 && after.header.bottom >= after.header.height - 1 &&
          after.transform === "none", `${name} ${width}: desktop header hidden ${JSON.stringify(after)}`);
        assert(Math.abs(after.rail.y - after.header.bottom) <= 1,
          `${name} ${width}: left TOC/header gap`);
        assert(Math.abs(after.rail.bottom - height) <= 1, `${name} ${width}: TOC separator does not reach viewport bottom`);
      } else assert.equal(after.rail.width, 0, `${name} 991: desktop rail remained visible`);
      counts.scroll++;
      if ([1440, 1024, 992, 991].includes(width) || height === 500)
        await shot(`scrolled-${locale}-${route.replaceAll("/", "-")}-${width}x${height}`);
    }
    await page.setViewportSize({ width: 992, height: 900 });
    await page.goto(url("zh", "guide/aris"));
    await page.evaluate(() => scrollTo(0, 1100));
    await page.waitForTimeout(350);
    assert.equal((await scrollState()).transform, "none", `${name}: 992 before transition`);
    await page.setViewportSize({ width: 991, height: 900 });
    await page.waitForTimeout(120);
    const narrowAfter = await scrollState();
    assert.equal(narrowAfter.rail.width, 0, `${name}: 992 -> 991 did not become narrow`);
    await page.evaluate(() => scrollTo(0, 300));
    await page.waitForTimeout(350);
    await page.locator("#kt-page-toc-trigger").click();
    assert.equal(await page.locator("body.kt-page-toc-open").count(), 1,
      `${name}: narrow page drawer after transition`);
    await page.locator("#kt-page-toc-close").click();
    await page.setViewportSize({ width: 992, height: 900 });
    await page.waitForTimeout(120);
    const desktopAgain = await scrollState();
    assert(desktopAgain.header.y >= -1 && desktopAgain.transform === "none" &&
      Math.abs(desktopAgain.rail.y - desktopAgain.header.bottom) <= 1 &&
      Math.abs(desktopAgain.rail.bottom - 900) <= 1,
    `${name}: 991 -> 992 desktop pin/TOC alignment`);
    counts.scroll += 2;

    const scheduleSelector = "#prime-attire .kt-adaptive-records table.table";
    for (const locale of ["zh", "en"]) {
      for (const width of [768, 767, 641, 640, 520, 480, 430, 390, 375, 352, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(url(locale, "collectibles/equipment"));
        const data = await page.evaluate(selector => {
          const table = document.querySelector(selector);
          const cells = [...table.tBodies[0].rows[0].cells];
          const rect = node => node.getBoundingClientRect();
          const other = document.querySelector("#quarto-document-content table.table:not(#prime-attire table)");
          return { documentOverflow: document.documentElement.scrollWidth - innerWidth,
            tableOverflow: table.scrollWidth - table.clientWidth,
            display: getComputedStyle(table).display,
            columns: cells.map(cell => Math.round(rect(cell).width)),
            tags: [table.tagName, ...cells.map(cell => cell.tagName)],
            otherDisplay: getComputedStyle(other).display };
        }, scheduleSelector);
        assert(data.documentOverflow <= 1 && data.tableOverflow <= 1,
          `${name} ${locale} ${width}: schedule overflow ${data.documentOverflow}/${data.tableOverflow}`);
        assert.deepEqual(data.tags, ["TABLE", "TD", "TD"]);
        const record = await page.locator(scheduleSelector).evaluate(n=>n.closest('.kt-adaptive-records').classList.contains('kt-record-mode'));
        if (record) {
          assert.equal(data.display, "block", `${name} ${locale} ${width}: records inactive`);
          assert(data.columns.every(w=>Math.abs(w-data.columns[0])<=1), `${name}: record fields must share width`);
          assert.equal(await page.locator(`${scheduleSelector} .kt-record-label`).count(), 6);
        } else assert.equal(data.display, "table", `${name} ${locale} ${width}: wider table changed`);
        if (width === 390 || width === 320) {
          const semantics = await page.locator(scheduleSelector).ariaSnapshot();
          assert(semantics.includes("table") && semantics.includes("columnheader"),
            `${name} ${locale} ${width}: schedule table semantics absent`);
        }
        counts.schedule++;
        if (name === "WebKit" && [768, 767, 390].includes(width)) {
          await page.locator(scheduleSelector).scrollIntoViewIfNeeded();
          await shot(`schedule-${locale}-${width}`);
        }
      }
    }

    console.log(`${name}: PASS ${JSON.stringify(counts)}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  if (shots) fs.mkdirSync(shots, { recursive: true });
  await run("WebKit", webkit);
  await run("Edge", chromium, { executablePath: edgeExecutable });
})().catch(error => { console.error(error); process.exitCode = 1; });
