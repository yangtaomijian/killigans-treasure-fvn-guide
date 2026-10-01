"use strict";

// Run against the assembled local site with Playwright available on NODE_PATH.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");

const base = process.env.KT_BASE_URL || "http://127.0.0.1:18775";
const qaDir = process.env.KT_QA_DIR;
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const widths = [1440, 1280, 430, 390, 375, 320];
const route = (locale, page) => `${base}/${locale === "en" ? "en/" : ""}${page}.html`;

async function snapshot(page) {
  return page.evaluate(() => {
    const info = selector => {
      const node = document.querySelector(selector);
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom,
        width: box.width, height: box.height, display: style.display,
        border: style.borderTopWidth, background: style.backgroundColor };
    };
    return { twoTier: document.documentElement.classList.contains("kt-two-tier-mobile"), viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      hamburger: info("#quarto-header .navbar-toggler"),
      page: info("#kt-page-toc-trigger"), search: info("#kt-search-launcher"),
      language: info("#quarto-header .navbar-nav.ms-auto a.nav-link"),
      searchText: document.querySelector("#kt-search-launcher").textContent.trim(),
      searchName: document.querySelector("#kt-search-launcher").getAttribute("aria-label"),
      searchTitle: document.querySelector("#kt-search-launcher").getAttribute("title"),
      searchIcon: document.querySelectorAll("#kt-search-launcher svg.kt-search-icon[aria-hidden='true']").length,
      componentStyles: [...document.querySelectorAll('link[rel="stylesheet"]')].filter(link => link.href.endsWith("assets/kt-components.css")).length };
  });
}

async function searchState(page, locale, width) {
  await page.locator("#kt-search-launcher").click();
  const input = page.locator("#kt-search-input");
  await input.fill("Macsen");
  await page.locator(".kt-search-result").first().waitFor();
  const state = await page.evaluate(() => {
    const rect = node => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const dialog = document.getElementById("kt-search-dialog");
    const results = [...document.querySelectorAll(".kt-search-result")];
    const tokenProbe = document.createElement("span");
    tokenProbe.style.background = "var(--kt-surface-raised)";
    document.body.append(tokenProbe);
    const tokenSurface = getComputedStyle(tokenProbe).backgroundColor;
    tokenProbe.remove();
    return { dialog: rect(dialog), input: rect(document.getElementById("kt-search-input")),
      close: rect(document.getElementById("kt-search-close")),
      focusedInput: document.activeElement.id === "kt-search-input",
      count: results.length, title: !!results[0]?.querySelector(".kt-search-result-title"),
      section: !!results[0]?.querySelector(".kt-search-result-section"),
      preview: !!results[0]?.querySelector(".kt-search-result-text"),
      documentWidth: document.documentElement.scrollWidth,
      surface: getComputedStyle(dialog).backgroundColor,
      tokenSurface };
  });
  assert(state.dialog.x >= 8 && state.dialog.right <= width - 8, `${locale} ${width}: dialog inset`);
  assert(state.input.x >= state.dialog.x && state.input.right <= state.dialog.right, `${locale} ${width}: input inset`);
  assert(state.close.x >= state.dialog.x && state.close.right <= state.dialog.right, `${locale} ${width}: close inset`);
  assert(state.input.height >= 39 && state.close.height >= 36, `${locale} ${width}: search hit areas`);
  assert(state.count > 0 && state.count <= 24 && state.title && state.section && state.preview, `${locale} ${width}: result hierarchy`);
  assert(state.focusedInput && state.documentWidth <= width + 1, `${locale} ${width}: search focus/overflow`);
  assert.equal(state.surface, state.tokenSurface, `${locale} ${width}: publication surface`);
  await page.locator("#kt-search-close").click();
  assert.equal(await page.locator("#kt-search-dialog").evaluate(node => node.open), false);
  return state;
}

async function screenshot(page, engine, key) {
  if (qaDir) await page.screenshot({ path: path.join(qaDir, `${engine.toLowerCase()}-${key}.png`) });
}

async function runEngine(engine, launcher, options = {}) {
  const browser = await launcher.launch({ headless: true, ...options });
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 } });
  const result = { engine, header: [], search: [], status: [], marks: null, locator: [], disclosures: [], equipment: [] };
  try {
    for (const locale of ["zh", "en"]) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 800 });
        // A content page owns the page-TOC control; Home intentionally has none.
        await page.goto(route(locale, "help"));
        const state = await snapshot(page);
        result.header.push({ locale, width, ...state });
        assert.equal(state.componentStyles, 1, `${engine} ${locale} ${width}: component stylesheet`);
        assert.equal(state.searchIcon, 1, `${engine} ${locale} ${width}: line search icon`);
        assert(state.documentWidth <= width + 1 && state.searchText === "", `${engine} ${locale} ${width}: header overflow/icon-only`);
        assert.equal(state.searchName, locale === "zh" ? "搜索" : "Search", `${engine} ${locale} ${width}: Search accessible name`);
        assert.equal(state.searchTitle, state.searchName, `${engine} ${locale} ${width}: Search title`);
        if (width <= 991) {
          const { hamburger, page: toc, search } = state;
          assert(hamburger.display !== "none" && toc.display !== "none" && search.display !== "none", `${engine} ${locale} ${width}: header controls visible`);
          assert(hamburger.right + 4 <= toc.x && (state.twoTier ? search.bottom <= hamburger.y + 1 : toc.right + 3 <= search.x) && search.right <= width - 16, `${engine} ${locale} ${width}: header controls collide`);
          assert([hamburger, toc, search].every(item => item.height >= 40 && item.height <= 44 && item.border === "1px"), `${engine} ${locale} ${width}: control family`);
        } else {
          assert(state.hamburger.display === "none" && state.page.display === "none", `${engine} ${locale} ${width}: desktop header`);
          assert(state.language.width > 0 && state.search.width > 0, `${engine} ${locale} ${width}: desktop tools`);
        }
        await page.locator("#kt-search-launcher").focus();
        assert.equal(await page.evaluate(() => document.activeElement.id), "kt-search-launcher", `${engine} ${locale} ${width}: launcher keyboard focus`);
        assert.equal(await page.locator("#kt-search-launcher").evaluate(node => getComputedStyle(node).outlineWidth), "2px", `${engine} ${locale} ${width}: launcher focus ring`);
        const dialog = await searchState(page, locale, width);
        result.search.push({ locale, width, ...dialog });
      }
    }

    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(route("zh", "help"));
    await page.locator("#kt-search-launcher").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#kt-search-dialog").evaluate(node => node.open), true, `${engine}: keyboard Search open`);
    assert.equal(await page.evaluate(() => document.activeElement.id), "kt-search-input", `${engine}: keyboard Search input focus`);
    await page.locator("#kt-search-close").click();
    const hamburger = page.locator("#quarto-header .navbar-toggler");
    await hamburger.click();
    await page.waitForFunction(() => document.body.classList.contains("kt-global-nav-open"));
    assert.equal(await hamburger.getAttribute("aria-expanded"), "true", `${engine}: site navigation open`);
    await page.locator("#kt-global-nav-close").click();
    await page.waitForFunction(() => !document.body.classList.contains("kt-global-nav-open"));
    assert.equal(await hamburger.getAttribute("aria-expanded"), "false", `${engine}: site navigation close`);
    await page.locator("#kt-page-toc-trigger").click();
    await page.locator("#kt-page-toc-close").click();
    await page.locator("#kt-search-launcher").click();
    await page.locator("#kt-search-close").click();
    await page.locator("#kt-search-launcher").click();
    await page.locator("#kt-search-close").click();
    await page.locator("#kt-page-toc-trigger").click();
    assert(await page.locator("#kt-page-toc-panel").isVisible(), `${engine}: Search-to-TOC sequence`);
    await page.locator("#kt-page-toc-close").click();
    assert.equal(await page.evaluate(() => document.body.classList.contains("kt-page-toc-open") || document.getElementById("quarto-header").inert), false, `${engine}: stale drawer state`);

    await page.goto(route("en", "index"));
    await page.locator("#kt-search-launcher").click();
    await page.locator("#kt-search-input").fill("zzqzzq-no-result");
    await page.waitForFunction(() => document.getElementById("kt-search-status").textContent === "No results.");
    result.status.push({ state: "none", text: await page.locator("#kt-search-status").innerText() });
    await page.route("**/kt-search.json", request => request.abort());
    await page.reload();
    await page.locator("#kt-search-launcher").click();
    await page.locator("#kt-search-input").fill("Macsen");
    await page.waitForFunction(() => document.getElementById("kt-search-status").textContent.includes("temporarily unavailable"));
    const unavailable = await page.locator("#kt-search-status").evaluate(node => ({ text: node.textContent, color: getComputedStyle(node).color }));
    result.status.push({ state: "unavailable", ...unavailable });
    assert.equal(unavailable.color, "rgb(98, 94, 85)", `${engine}: quiet status color`);
    await page.unroute("**/kt-search.json");

    await page.goto(route("zh", "index"));
    await page.locator("#kt-search-launcher").click();
    await page.locator("#kt-search-input").fill("Macsen");
    await page.locator(".kt-search-result").first().click();
    await page.waitForFunction(() => document.querySelectorAll("mark.kt-search-mark").length > 0);
    result.marks = await page.evaluate(() => {
      const mark = document.querySelector("mark.kt-search-mark");
      const target = document.querySelector(":target");
      return { markBackground: getComputedStyle(mark).backgroundColor,
        markShadow: getComputedStyle(mark).boxShadow,
        targetBackground: getComputedStyle(target).backgroundColor };
    });
    assert.equal(result.marks.markBackground, "rgba(0, 0, 0, 0)", `${engine}: temporary mark background`);
    assert(result.marks.markShadow.includes("inset") && result.marks.targetBackground !== result.marks.markBackground,
      `${engine}: temporary mark distinct from target`);

    for (const width of [430, 390, 375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(route("zh", "collectibles/memories"));
      const item = await page.evaluate(() => {
        const nav = document.getElementById("kt-memory-locator");
        const box = nav.getBoundingClientRect();
        const links = [...nav.querySelectorAll("a")];
        return { count: links.length, position: getComputedStyle(nav).position,
          documentWidth: document.documentElement.scrollWidth,
          x: box.x, right: box.right,
          escaping: links.filter(link => link.getBoundingClientRect().right > box.right + 1).length };
      });
      result.locator.push({ width, ...item });
      assert(item.count === 11 && item.position === "static" && item.escaping === 0, `${engine} ${width}: locator structure`);
      assert(item.x >= -1 && item.right <= width + 1 && item.documentWidth <= width + 1, `${engine} ${width}: locator overflow`);
      const first = page.locator("#kt-memory-locator a").first();
      await first.focus();
      assert.equal(await first.evaluate(node => getComputedStyle(node).outlineWidth), "2px", `${engine} ${width}: locator focus`);
      await first.click();
      assert.equal(new URL(page.url()).hash, "#redroot-memories", `${engine} ${width}: locator hash`);
      await page.waitForFunction(() => [...document.querySelectorAll('#kt-memory-locator a[aria-current="location"]')]
        .some(link => new URL(link.href).hash === "#redroot-memories"));
      assert.equal(await first.getAttribute("aria-current"), "location", `${engine} ${width}: locator current`);
    }

    await page.setViewportSize({ width: 390, height: 800 });
    for (const locale of ["zh", "en"]) {
      await page.goto(route(locale, "guide/aris"));
      const details = page.locator("details").first();
      const summary = details.locator("summary");
      const closed = await summary.evaluate(node => ({ display: getComputedStyle(node).display, cursor: getComputedStyle(node).cursor }));
      assert.equal(closed.display, "list-item", `${engine} ${locale}: native summary marker`);
      assert.equal(closed.cursor, "pointer", `${engine} ${locale}: summary affordance`);
      await summary.click();
      assert.equal(await details.evaluate(node => node.open), true, `${engine} ${locale}: mouse disclosure open`);
      await summary.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      const focus = await summary.evaluate(node => {
        const style = getComputedStyle(node);
        return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
      });
      assert.deepEqual(focus, { width: "2px", style: "solid", color: "rgb(118, 80, 24)" }, `${engine} ${locale}: summary keyboard focus`);
      await page.keyboard.press("Space");
      assert.equal(await details.evaluate(node => node.open), false, `${engine} ${locale}: keyboard disclosure close`);
      result.disclosures.push({ locale, mouse: true, keyboard: true });
    }

    await page.setViewportSize({ width: 320, height: 800 });
    for (const locale of ["zh", "en"]) {
      await page.goto(route(locale, "collectibles/equipment"));
      const candidate = await page.evaluate(() => document.documentElement.scrollWidth);
      await page.route("**/assets/kt-components.css", request => request.abort());
      await page.reload();
      const baseline = await page.evaluate(() => document.documentElement.scrollWidth);
      await page.unroute("**/assets/kt-components.css");
      result.equipment.push({ locale, candidate, baseline });
      assert(candidate <= baseline + 1, `${engine} ${locale}: Equipment overflow worsened`);
    }

    if (qaDir && engine === "WebKit") {
      fs.mkdirSync(qaDir, { recursive: true });
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(route("zh", "index"));
      await screenshot(page, engine, "home-zh-390-header");
      await page.locator("#quarto-header").screenshot({ path: path.join(qaDir, "webkit-mobile-controls-390-closeup.png") });
      assert.equal(await page.locator("#kt-page-toc-trigger").count(), 0, "Home has no page TOC");
      await page.goto(route("zh", "help"));
      await page.locator("#kt-page-toc-trigger").click();
      await screenshot(page, engine, "help-zh-390-drawer");
      await page.locator("#kt-page-toc-close").click();
      await page.locator("#kt-search-launcher").click();
      await page.locator("#kt-search-input").fill("Macsen");
      await page.locator(".kt-search-result").first().waitFor();
      await screenshot(page, engine, "search-zh-390");
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(route("en", "help"));
      await screenshot(page, engine, "help-en-320-header");
      await page.locator("#kt-search-launcher").click();
      await page.locator("#kt-search-input").fill("Macsen");
      await page.locator(".kt-search-result").first().waitFor();
      await screenshot(page, engine, "search-en-320");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route("zh", "index"));
      await page.locator("#kt-search-launcher").click();
      await page.locator("#kt-search-input").fill("Macsen");
      await page.locator(".kt-search-result").first().waitFor();
      await screenshot(page, engine, "search-zh-1440");
      await page.locator("#kt-search-close").click();
      await page.locator("#quarto-header").screenshot({ path: path.join(qaDir, "webkit-home-zh-1440-navbar-tools.png") });
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(route("zh", "collectibles/memories"));
      await page.locator("#kt-memory-locator").scrollIntoViewIfNeeded();
      await screenshot(page, engine, "memories-zh-390-locator");
      await page.goto(route("zh", "guide/aris"));
      const details = page.locator("details").first();
      await details.scrollIntoViewIfNeeded();
      await screenshot(page, engine, "aris-zh-details-closed");
      await details.locator("summary").click();
      await screenshot(page, engine, "aris-zh-details-open");
    }
  } finally {
    await browser.close();
  }
  console.log(`${engine}: header=${result.header.length} search=${result.search.length} status=${result.status.length} locator=${result.locator.length} disclosures=${result.disclosures.length} equipment=${result.equipment.length} PASS`);
  return result;
}

(async () => {
  const results = [await runEngine("WebKit", webkit)];
  assert(fs.existsSync(edgeExecutable), "Installed Edge executable unavailable");
  results.push(await runEngine("Edge", chromium, { executablePath: edgeExecutable }));
  if (qaDir) fs.writeFileSync(path.join(qaDir, "components-runtime.json"), JSON.stringify({ results }, null, 2) + "\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
