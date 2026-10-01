"use strict";

// Run against the assembled local site with Playwright available on NODE_PATH.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");

const base = process.env.KT_BASE_URL || "http://127.0.0.1:18775";
const qaDir = process.env.KT_QA_DIR;
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const widths = [1728, 1440, 1366, 1280, 1024, 992, 991, 960, 820, 768, 430, 390, 375, 320];
const routes = [
  ["zh", "index"], ["zh", "guide/aris"], ["zh", "collectibles/memories"],
  ["en", "index"], ["en", "help"], ["en", "collectibles/codex"]
];
const shots = [
  ["zh", "guide/aris", 1440, 900, "aris-zh-1440"],
  ["en", "guide/aris", 1280, 900, "aris-en-1280"],
  ["zh", "collectibles/memories", 1024, 900, "memories-zh-1024"],
  ["en", "collectibles/codex", 1024, 900, "codex-en-1024"],
  ["en", "help", 1366, 500, "help-en-1366x500"],
  ["zh", "collectibles/memories", 1366, 500, "memories-zh-1366x500"],
  ["en", "collectibles/codex", 820, 900, "codex-en-820"],
  ["zh", "index", 390, 800, "home-zh-390"],
  ["en", "help", 320, 800, "help-en-320"],
  ["zh", "guide/aris", 992, 900, "aris-zh-992"],
  ["zh", "guide/aris", 991, 900, "aris-zh-991"]
];
const url = (locale, route) => `${base}/${locale === "en" ? "en/" : ""}${route}.html`;
async function measure(page) {
  return page.evaluate(() => {
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const rail = document.getElementById("kt-page-toc-panel");
    return {
      twoTier: document.documentElement.classList.contains("kt-two-tier-mobile"),
      width: innerWidth, height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      header: rect(document.getElementById("quarto-header")),
      article: rect(document.querySelector("main.content")),
      rail: rect(rail),
      railDisplay: rail ? getComputedStyle(rail).display : "none",
      railPosition: rail ? getComputedStyle(rail).position : "static",
      railClient: rail?.clientHeight || 0, railScroll: rail?.scrollHeight || 0,
      trigger: rect(document.getElementById("kt-page-toc-trigger")),
      triggerDisplay: document.getElementById("kt-page-toc-trigger") ? getComputedStyle(document.getElementById("kt-page-toc-trigger")).display : "none",
      search: rect(document.getElementById("kt-search-launcher")),
      hamburger: rect(document.querySelector("#quarto-header .navbar-toggler")),
      tocCount: document.querySelectorAll("#TOC").length
    };
  });
}

async function screenshot(page, name, key) {
  if (qaDir) await page.screenshot({ path: path.join(qaDir, `${name.toLowerCase()}-${key}.png`) });
}

async function runEngine(name, type, options = {}) {
  const browser = await type.launch({ headless: true, ...options });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const result = { engine: name, geometry: [], transitions: [], short: [], drawer: [], equipment: [], failures: [] };
  const fail = message => result.failures.push(`${name}: ${message}`);
  try {
    for (const [locale, route] of routes) {
      await page.goto(url(locale, route));
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const state = { locale, route, ...await measure(page) };
        result.geometry.push(state);
        if (route === "index") {
          if (state.tocCount || state.trigger || state.rail) fail(`${locale} home ${width}: unexpected TOC`);
          if (state.documentWidth > width + 1) fail(`${locale} home ${width}: overflow`);
          if (width >= 992 && Math.abs(state.article.x - (width - state.article.width) / 2) > 1) fail(`${locale} home ${width}: not centered`);
          continue;
        }
        if (state.tocCount !== 1) fail(`${locale}/${route} ${width}: TOC count ${state.tocCount}`);
        if (state.documentWidth > width + 1) fail(`${locale}/${route} ${width}: document width ${state.documentWidth}`);
        if (width >= 992) {
          if (state.railDisplay === "none" || state.railPosition !== "sticky" || state.rail.right > state.article.x - 15) fail(`${locale}/${route} ${width}: left rail geometry`);
          if (state.article.width < (width === 992 ? 700 : width === 1024 ? 730 : 810)) fail(`${locale}/${route} ${width}: article width ${state.article.width}`);
          if (state.triggerDisplay !== "none") fail(`${locale}/${route} ${width}: narrow trigger visible`);
        } else {
          if (state.railDisplay !== "none" || state.triggerDisplay === "none") fail(`${locale}/${route} ${width}: narrow mode`);
          if (width >= 768 && state.article.width < Math.min(840, width - 55)) fail(`${locale}/${route} ${width}: article width ${state.article.width}`);
        }
        if (width <= 430) {
          const { trigger, search, hamburger } = state;
          if (!trigger || !search || !hamburger || hamburger.right > trigger.x - 1 || (state.twoTier ? search.bottom > hamburger.y + 1 : trigger.right > search.x - 1) || search.right > width + 1) fail(`${locale}/${route} ${width}: header controls overlap or clip`);
        }
      }
    }
    for (const locale of ["zh", "en"]) {
      for (const [route, selector, small, large] of [
        ["collectibles/memories", "table.kt-memory-responsive-table", 575, 576],
        ["collectibles/codex", "table.kt-codex-responsive-table", 459, 460]
      ]) {
        await page.goto(url(locale, route));
        for (const width of [small, large]) {
          await page.setViewportSize({ width, height: 800 });
          const display = await page.locator(selector).first().evaluate(el => getComputedStyle(el).display);
          const state = await measure(page);
          result.transitions.push({ locale, route, width, display, article: state.article.width, overflow: state.documentWidth - width });
          if (display !== (width === small ? "block" : "table") || state.documentWidth > width + 1) fail(`${locale}/${route} ${width}: ${display} overflow=${state.documentWidth - width}`);
        }
      }
    }
    for (const [locale, route, width, height] of [
      ["zh", "collectibles/memories", 1366, 500],
      ["en", "help", 1366, 500],
      ["zh", "guide/aris", 1366, 500],
      ["en", "help", 1440, 600]
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(url(locale, route));
      await page.evaluate(() => scrollTo(0, 900));
      const before = await measure(page);
      const last = page.locator("#TOC a.nav-link:visible").last();
      await page.keyboard.press("Tab");
      await last.focus();
      const after = await measure(page);
      const focused = await last.evaluate(el => { const a = el.getBoundingClientRect(), p = el.closest("#kt-page-toc-panel").getBoundingClientRect(); return { top: a.top, bottom: a.bottom, railTop: p.top, railBottom: p.bottom }; });
      result.short.push({ locale, route, width, height, before, after, focused });
      if (Math.abs(before.rail.y - before.header.bottom) > 1 || Math.abs(before.rail.bottom - height) > 1 ||
          Math.abs(after.rail.y - after.header.bottom) > 1 || Math.abs(after.rail.bottom - height) > 1)
        fail(`${locale}/${route} ${width}x${height}: full-height sticky separator`);
      if (route !== "guide/aris" && height === 500 && before.railScroll <= before.railClient) fail(`${locale}/${route} ${width}x${height}: long TOC not internally scrollable`);
      if (focused.top < focused.railTop - 1 || focused.bottom > focused.railBottom + 1) fail(`${locale}/${route} ${width}x${height}: lower TOC link not visible`);
    }
    for (const [locale, route, width, height] of [["zh", "guide/aris", 390, 800], ["en", "help", 320, 800], ["zh", "collectibles/memories", 390, 480]]) {
      await page.setViewportSize({ width, height });
      await page.goto(url(locale, route));
      const trigger = page.locator("#kt-page-toc-trigger");
      const scrollBefore = await page.evaluate(() => scrollY);
      await trigger.click();
      const opened = await page.evaluate(() => ({ expanded: document.getElementById("kt-page-toc-trigger").getAttribute("aria-expanded"), focus: document.activeElement.id, headerInert: document.getElementById("quarto-header").inert, articleInert: document.getElementById("quarto-document-content").inert, open: document.body.classList.contains("kt-page-toc-open") }));
      const panel = await measure(page);
      if (!opened.open || opened.expanded !== "true" || opened.focus !== "kt-page-toc-close" || !opened.headerInert || !opened.articleInert || Math.abs(panel.rail.y - (panel.twoTier ? panel.header.bottom : 0)) > 1 || Math.abs(panel.rail.height - (height - (panel.twoTier ? panel.header.bottom : 0))) > 1) fail(`${locale}/${route} ${width}: drawer open contract`);
      await page.keyboard.press("Shift+Tab");
      const shiftFocus = await page.evaluate(() => {
        const active = document.activeElement;
        const rail = document.getElementById("kt-page-toc-panel");
        const a = active.getBoundingClientRect(), r = rail.getBoundingClientRect();
        return { inToc: active.closest("#TOC") !== null, visible: a.top >= r.top - 1 && a.bottom <= r.bottom + 1, scrollTop: rail.scrollTop };
      });
      await page.keyboard.press("Tab");
      const tabFocus = await page.evaluate(() => document.activeElement.id);
      if (!shiftFocus.inToc || !shiftFocus.visible || tabFocus !== "kt-page-toc-close") fail(`${locale}/${route} ${width}: Tab wrap or lower link visibility`);
      await page.keyboard.press("Escape");
      const escaped = await page.evaluate(() => ({ open: document.body.classList.contains("kt-page-toc-open"), focus: document.activeElement.id, headerInert: document.getElementById("quarto-header").inert }));
      if (escaped.open || escaped.focus !== "kt-page-toc-trigger" || escaped.headerInert) fail(`${locale}/${route} ${width}: Escape/focus return`);
      if (Math.abs(await page.evaluate(() => scrollY) - scrollBefore) > 1) fail(`${locale}/${route} ${width}: article scroll changed on close`);
      await trigger.click();
      await page.locator("#kt-page-toc-backdrop").click({ position: { x: 5, y: 5 } });
      if (await page.locator("body").evaluate(el => el.classList.contains("kt-page-toc-open"))) fail(`${locale}/${route} ${width}: backdrop close`);
      await trigger.click();
      await page.locator("#kt-page-toc-close").click();
      if (await page.locator("body").evaluate(el => el.classList.contains("kt-page-toc-open"))) fail(`${locale}/${route} ${width}: button close`);
      await trigger.click();
      const link = page.locator("#TOC a.nav-link:visible").nth(1);
      const href = await link.getAttribute("href");
      const linkId = await link.getAttribute("id");
      await link.click();
      await page.waitForTimeout(300);
      const landed = await page.evaluate(id => {
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        return { hash: location.hash, open: document.body.classList.contains("kt-page-toc-open"), inert: document.getElementById("quarto-document-content").inert,
          active: document.getElementById(id)?.classList.contains("active"), targetTop: target?.getBoundingClientRect().top };
      }, linkId);
      if (landed.hash !== new URL(href, page.url()).hash || landed.open || landed.inert || !landed.active || landed.targetTop === undefined || landed.targetTop < -160 || landed.targetTop > height + 100) fail(`${locale}/${route} ${width}: TOC link/hash/close/active landing`);
      await page.goBack();
      await page.waitForTimeout(100);
      result.drawer.push({ locale, route, width, height, opened, escaped, href, landed });
    }
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${url("zh", "collectibles/codex")}#macsen-cute-things-he-does`);
    await page.waitForTimeout(150);
    await page.locator("#kt-page-toc-trigger").click();
    await page.locator('#TOC a[data-scroll-target="#macsen-cute-things-he-does"]').click();
    await page.locator("#quarto-header .navbar-toggler").click();
    await page.locator("#quarto-header .navbar-nav.ms-auto a.nav-link").click();
    await page.waitForLoadState("load");
    if (!page.url().includes("/en/collectibles/codex.html#macsen-cute-things-he-does")) fail("narrow TOC-to-language fragment mapping");

    await page.goto(`${url("zh", "guide/aris")}#aris-day7-tavern`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#quarto-header .navbar-nav.ms-auto a.nav-link").click();
    await page.waitForLoadState("load");
    if (!page.url().includes("/en/guide/aris.html#aris-day7-tavern")) fail("desktop language fragment mapping");

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(url("en", "help"));
    await page.locator("#kt-page-toc-trigger").click();
    await page.keyboard.press("Escape");
    await page.locator("#kt-search-launcher").click();
    if (!(await page.locator("#kt-search-dialog").isVisible())) fail("TOC-to-search sequence");
    await page.locator("#kt-search-close").click();
    await page.locator("#kt-page-toc-trigger").click();
    if (!(await page.locator("#kt-page-toc-panel").isVisible())) fail("search-to-TOC sequence");
    await page.locator("#kt-page-toc-close").click();

    await page.locator("#kt-page-toc-trigger").click();
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.waitForFunction(() => !document.body.classList.contains("kt-page-toc-open"));
    const mode = await page.evaluate(() => ({ open: document.body.classList.contains("kt-page-toc-open"), expanded: document.getElementById("kt-page-toc-trigger").getAttribute("aria-expanded"), inert: document.getElementById("quarto-header").inert, rail: getComputedStyle(document.getElementById("kt-page-toc-panel")).display }));
    if (mode.open || mode.expanded !== "false" || mode.inert || mode.rail === "none") fail("drawer-to-desktop mode synchronization");
    await page.setViewportSize({ width: 320, height: 800 });

    for (const locale of ["zh", "en"]) {
      await page.goto(url(locale, "collectibles/equipment"));
      const candidate = await measure(page);
      await page.route("**/assets/kt-layout.css", route => route.abort());
      await page.reload();
      const baseline = await measure(page);
      await page.unroute("**/assets/kt-layout.css");
      result.equipment.push({ locale, candidate: candidate.documentWidth, baseline: baseline.documentWidth });
      if (candidate.documentWidth > baseline.documentWidth + 1) fail(`${locale}/equipment 320: new overflow`);
    }
    if (qaDir) {
      fs.mkdirSync(qaDir, { recursive: true });
      for (const [locale, route, width, height, key] of shots) {
        await page.setViewportSize({ width, height });
        await page.goto(url(locale, route));
        await screenshot(page, name, key);
        if (key === "help-en-320") {
          await page.locator("#kt-page-toc-trigger").click();
          await screenshot(page, name, `${key}-drawer`);
          await page.locator("#kt-page-toc-close").click();
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`${name}: geometry=${result.geometry.length} transitions=${result.transitions.length} short=${result.short.length} drawer=${result.drawer.length} failures=${result.failures.length}`);
  if (result.failures.length) console.error(result.failures.join("\n"));
  return result;
}

(async () => {
  const results = [];
  results.push(await runEngine("WebKit", webkit));
  assert(fs.existsSync(edgeExecutable), "Installed Edge executable unavailable");
  results.push(await runEngine("Edge", chromium, { executablePath: edgeExecutable }));
  if (qaDir) fs.writeFileSync(path.join(qaDir, "layout-runtime.json"), JSON.stringify({ results }, null, 2) + "\n");
  if (results.some(result => result.failures.length)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
