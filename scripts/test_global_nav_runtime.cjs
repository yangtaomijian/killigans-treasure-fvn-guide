"use strict";

// Run against the assembled local site with Playwright on NODE_PATH.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");

const base = process.env.KT_BASE_URL || "http://127.0.0.1:18775";
const shots = path.resolve(__dirname, "../test-results/global-nav");
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const url = (locale, route = "index", suffix = "") =>
  `${base}/${locale === "en" ? "en/" : ""}${route}.html${suffix}`;
const widths = [991, 820, 768, 430, 390, 375, 352, 320];

async function snapshot(page) {
  return page.evaluate(() => {
    const box = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const panel = document.getElementById("navbarCollapse");
    const backdrop = document.getElementById("kt-global-nav-backdrop");
    const button = document.querySelector("#quarto-header .navbar-toggler");
    const page = document.getElementById("kt-page-toc-trigger");
    const search = document.getElementById("kt-search-launcher");
    return {
      twoTier: document.documentElement.classList.contains("kt-two-tier-mobile"),
      width: innerWidth, height: innerHeight, scroll: scrollY,
      docWidth: document.documentElement.scrollWidth,
      panel: box(panel), backdrop: box(backdrop), button: box(button),
      article: box(document.querySelector("main.content")),
      header: box(document.getElementById("quarto-header")),
      page: box(page), search: box(search),
      panelDisplay: getComputedStyle(panel).display,
      panelVisibility: getComputedStyle(panel).visibility,
      panelPosition: getComputedStyle(panel).position,
      backdropDisplay: getComputedStyle(backdrop).display,
      panelScroll: panel.scrollHeight, panelClient: panel.clientHeight,
      bodyOpen: document.body.classList.contains("kt-global-nav-open"),
      pageOpen: document.body.classList.contains("kt-page-toc-open"),
      bodyOverflow: getComputedStyle(document.body).overflow,
      aria: button.getAttribute("aria-expanded"),
      collapseShow: panel.classList.contains("show") || panel.classList.contains("collapsing"),
      collapseHeight: panel.style.height,
      articleInert: document.getElementById("quarto-content").inert,
      headerInert: document.getElementById("quarto-header").inert,
      headerOpacity: getComputedStyle(document.getElementById("quarto-header")).opacity,
      headerBackground: getComputedStyle(document.getElementById("quarto-header")).backgroundColor,
      toolsInert: document.querySelector("#quarto-header .quarto-navbar-tools").inert,
      pageInert: page?.inert || false, searchInert: search.inert, buttonInert: button.inert,
      headerHitTargets: [button, page, search].filter(Boolean).map(node => {
        const r = node.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit === node || node.contains(hit);
      }),
      focus: document.activeElement.id,
      destinations: [...panel.querySelectorAll('a[href]:not(.dropdown-toggle)')].map(a => a.getAttribute("href")),
    };
  });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(shots, name) });
}

async function open(page) {
  await page.locator("#quarto-header .navbar-toggler").click();
  await page.waitForFunction(() => document.body.classList.contains("kt-global-nav-open"));
  await page.waitForTimeout(210);
}

async function closed(page) {
  await page.waitForFunction(() => !document.body.classList.contains("kt-global-nav-open"));
  assert.equal((await snapshot(page)).aria, "false");
}

async function run(name, launcher, options = {}) {
  const browser = await launcher.launch({ headless: true, ...options });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const count = { geometry: 0, groups: 0, interactions: 0, screenshots: 0 };
  const shot = async file => { await screenshot(page, file); count.screenshots++; };
  try {
    for (const [locale, route] of [["zh", "index"], ["en", "help"]]) {
      for (const width of widths) {
        for (const height of [900, 600, 500]) {
          await page.setViewportSize({ width, height });
          await page.goto(url(locale, route));
          await page.waitForTimeout(120);
          const initial = await snapshot(page);
          assert(initial.docWidth <= width + 1, `${name} ${locale} ${width}x${height}: closed overflow`);
          assert.equal(initial.aria, "false");
          assert.equal(initial.panelVisibility, "hidden");
          // Fourteen content pages, plus the alternate-language utility.
          const canonical = pathname => pathname.replace(/\/index\.html$/, "/");
          const paths = initial.destinations.map(href => canonical(new URL(href, page.url()).pathname));
          const contentRoutes = ["index", "help", "guide/redroot", "guide/aris",
            "guide/crystal-plains-shieldfall", "guide/spiceport", "guide/blueleaf-grove",
            "reference/relationships", "reference/personality", "reference/combat",
            "collectibles/memories", "collectibles/equipment", "collectibles/dressing-room", "collectibles/codex"];
          const expectedPaths = contentRoutes.map(route => canonical(new URL(url(locale, route)).pathname));
          expectedPaths.push(canonical(new URL(url(locale === "zh" ? "en" : "zh", route)).pathname));
          assert.deepEqual([...paths].sort(), expectedPaths.sort());
          assert.equal(new Set(paths).size, 15);
          assert.equal(await page.locator("#kt-page-toc-trigger").count(), route === "index" ? 0 : 1);
          assert.equal(await page.locator("#kt-search-launcher").count(), 1);
          assert.equal(await page.locator("#kt-global-nav-page, #kt-global-nav-search, #kt-global-nav-utilities, #kt-page-toc-search").count(), 0);
          assert.equal(await page.locator("#navbarCollapse .navbar-nav.ms-auto a.kt-language-utility").count(), 1);
          assert.equal(await page.locator("#navbarCollapse .kt-language-utility svg.kt-language-icon").count(), 1);
          assert.equal(await page.locator("#navbarCollapse .kt-language-utility").getAttribute("aria-label"),
            locale === "zh" ? "切换到英文" : "Switch to Chinese");
          if (width === 390 && height === 900 && locale === "zh") await shot("webkit-home-zh-390-closed.png".replace("webkit", name.toLowerCase()));
          if (width === 320 && height === 900 && locale === "en") await shot("webkit-help-en-320-closed.png".replace("webkit", name.toLowerCase()));
          await open(page);
          assert.equal(await page.getByRole("navigation", { name: locale === "zh" ? "导航" : "Navigation" }).count(), 1);
          const state = await snapshot(page);
          assert(state.docWidth <= width + 1, `${name} ${locale} ${width}x${height}: open overflow`);
          assert.equal(state.panelPosition, "fixed");
          for (const property of ["x", "top", "width"]) {
            assert(Math.abs(state.article[property] - initial.article[property]) <= 1,
              `${name} ${locale} ${width}x${height}: article ${property} shifted`);
          }
          assert(Math.abs(state.header.height - initial.header.height) <= 1,
            `${name} ${locale} ${width}x${height}: header resized`);
          assert.equal(state.panelDisplay, "block");
          assert.equal(state.panelVisibility, "visible");
          assert.equal(state.panel.x, 0);
          assert(state.panel.right <= width && state.panel.bottom <= height + 1 && state.panel.top >= 0);
          assert.equal(state.backdropDisplay, "block");
          assert.equal(state.backdrop.x, 0);
          assert.equal(state.backdrop.right, width);
          assert(Math.abs(state.panel.top - state.header.bottom) <= 1,
            `${name} ${locale} ${width}x${height}: drawer/header gap`);
          assert(Math.abs(state.backdrop.top - state.header.bottom) <= 1,
            `${name} ${locale} ${width}x${height}: backdrop covers header`);
          assert(Math.abs(state.panel.height - (height - state.header.bottom)) <= 1,
            `${name} ${locale} ${width}x${height}: drawer height`);
          assert(Math.abs(state.backdrop.height - (height - state.header.bottom)) <= 1,
            `${name} ${locale} ${width}x${height}: backdrop height`);
          assert.equal(state.aria, "true");
          assert.equal(state.collapseShow, false);
          assert.equal(state.collapseHeight, "");
          assert.equal(state.articleInert, true);
          assert.equal(state.headerInert, false);
          assert.equal(state.toolsInert, false);
          assert.equal(state.pageInert, false);
          assert.equal(state.searchInert, false);
          assert.equal(state.buttonInert, false);
          assert.deepEqual(state.headerHitTargets, route === "index" ? [true, true] : [true, true, true], `${name} ${locale} ${width}x${height}: header hit testing`);
          assert.equal(state.headerOpacity, initial.headerOpacity);
          assert.equal(state.headerBackground, initial.headerBackground);
          assert.equal(state.focus, "kt-global-nav-close");
          assert((!state.page || state.button.right < state.page.x) && (state.twoTier ? state.search.bottom <= state.button.top + 1 : state.page.right < state.search.x),
            `${name} ${locale} ${width}x${height}: header occupancy`);
          if (width === 390 && height === 900 && locale === "zh") await shot("webkit-home-zh-390-open.png".replace("webkit", name.toLowerCase()));
          if (width === 390 && height === 900 && locale === "zh") {
            await shot("webkit-home-zh-390-live-header.png".replace("webkit", name.toLowerCase()));
            await page.locator("#navbarCollapse .navbar-nav.ms-auto").screenshot({ path: path.join(shots, `${name.toLowerCase()}-language-utility-zh-390.png`) });
            count.screenshots++;
          }
          if (width === 320 && height === 900 && locale === "en") await shot("webkit-help-en-320-open.png".replace("webkit", name.toLowerCase()));
          if (width === 991 && height === 900 && locale === "zh") await shot("webkit-home-zh-991-open.png".replace("webkit", name.toLowerCase()));
          count.geometry++;
          await page.locator("#kt-global-nav-close").click();
          await closed(page);
          assert.equal(await page.evaluate(() => document.activeElement.classList.contains("navbar-toggler")), true);
          assert.equal((await snapshot(page)).articleInert, false);
        }
      }
    }

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(url("zh"));
    await open(page);
    for (const index of [0, 1, 2]) {
      const toggle = page.locator("#navbarCollapse .dropdown-toggle").nth(index);
      if (index === 1) { await toggle.focus(); await toggle.press("Enter"); }
      else if (index === 2) { await toggle.focus(); await toggle.press("Space"); }
      else await toggle.click();
      assert.equal(await toggle.getAttribute("aria-expanded"), "true", `${name}: group ${index} expanded`);
      assert.equal(await toggle.locator("xpath=following-sibling::ul[1]").getAttribute("class").then(x => x.includes("show")), true);
      assert(await toggle.locator("xpath=following-sibling::ul[1]").locator("a.dropdown-item:visible").count() > 0);
      if (index === 0) {
        await page.waitForTimeout(80);
        await toggle.focus();
        // macOS WebKit uses Option+Tab to include links in keyboard traversal.
        await page.keyboard.press(name === "WebKit" ? "Alt+Tab" : "Tab");
        assert.equal(await page.evaluate(() => document.activeElement.classList.contains("dropdown-item")), true,
          `${name}: expanded submenu follows group in Tab order`);
      }
      count.groups++;
      if (index === 0 && name === "WebKit") await shot("webkit-home-zh-390-journey.png");
    }
    await page.keyboard.press("Escape");
    await closed(page);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains("navbar-toggler")), true);
    count.interactions++;

    await open(page);
    assert.deepEqual(await page.locator("#navbarCollapse .dropdown-toggle").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("aria-expanded"))),
      ["true","true","true"], `${name}: reopening restores all expanded groups`);
    await page.keyboard.press(name === "WebKit" ? "Alt+Shift+Tab" : "Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains("navbar-toggler")), true,
      `${name}: live header participates in focus order`);
    await page.keyboard.press(name === "WebKit" ? "Alt+Tab" : "Tab");
    assert.equal((await snapshot(page)).focus, "kt-global-nav-close", `${name}: drawer follows hamburger`);
    await page.locator("#kt-search-launcher").focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains("navbar-toggler")), true,
      `${name}: forward focus loop includes live header`);
    await page.keyboard.press("Shift+Tab");
    assert.equal((await snapshot(page)).focus, "kt-search-launcher", `${name}: reverse focus loop includes Search`);
    await page.locator("#kt-global-nav-backdrop").click({ position: { x: 380, y: 300 } });
    await closed(page);
    count.interactions++;

    await page.goto(url("en", "help"));
    await page.setViewportSize({ width: 320, height: 900 });
    await open(page);
    const journey = page.locator("#navbarCollapse .dropdown-toggle").first();
    assert.equal(await journey.getAttribute("aria-expanded"),"true",`${name}: cross-page/language group persistence`);
    await journey.click(); assert.equal(await journey.getAttribute("aria-expanded"),"false");
    await journey.click(); assert.equal(await journey.getAttribute("aria-expanded"),"true");
    if (name === "WebKit") await shot("webkit-help-en-320-nested.png");
    else await shot("edge-help-en-320-nested.png");
    await page.locator("#navbarCollapse .dropdown-menu.show a.dropdown-item").first().click();
    await page.waitForURL(url("en", "guide/redroot"));
    assert.equal((await snapshot(page)).bodyOpen, false);
    count.interactions++;

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(url("zh", "guide/aris", "?check=1#macsen-cute-things-he-does"));
    await open(page);
    await page.locator("#navbarCollapse .navbar-nav.ms-auto a.nav-link").click();
    await page.waitForURL(url("en", "guide/aris", "?check=1#macsen-cute-things-he-does"));
    count.interactions++;

    await page.goto(url("zh"));
    await open(page);
    await page.goto(url("zh", "help"));
    await open(page);
    await page.locator("#kt-page-toc-trigger").click();
    assert.equal((await snapshot(page)).bodyOpen, false);
    assert.equal((await snapshot(page)).pageOpen, true);
    assert.equal(await page.locator("#kt-global-nav-backdrop").isVisible(), false);
    assert.equal((await snapshot(page)).articleInert, false);
    if (name === "WebKit") await shot("webkit-home-zh-390-page-toc.png");
    await page.locator("#kt-page-toc-close").click();
    assert.equal((await snapshot(page)).pageOpen, false);
    assert.equal((await snapshot(page)).headerInert, false);
    await open(page);
    await page.locator("#quarto-header .navbar-toggler").click();
    assert.equal((await snapshot(page)).pageOpen, false);
    assert.equal((await snapshot(page)).bodyOpen, false);
    assert.equal((await snapshot(page)).aria, "false");
    assert.equal((await snapshot(page)).articleInert, false);
    count.interactions += 2;

    await open(page);
    await page.locator("#kt-search-launcher").click();
    assert.equal((await snapshot(page)).bodyOpen, false);
    assert.equal(await page.locator("#kt-search-dialog").evaluate(node => node.open), true);
    assert.equal((await snapshot(page)).focus, "kt-search-input");
    assert.equal(await page.locator("#kt-global-nav-backdrop").isVisible(), false);
    await page.locator("#kt-search-close").click();
    assert.equal((await snapshot(page)).articleInert, false);
    assert.equal((await snapshot(page)).headerInert, false);
    count.interactions += 2;

    await page.setViewportSize({ width: 991, height: 900 });
    await open(page);
    await page.setViewportSize({ width: 992, height: 900 });
    await page.waitForFunction(() => !document.body.classList.contains("kt-global-nav-open"));
    let desktop = await snapshot(page);
    assert.equal(desktop.aria, "false");
    assert.equal(desktop.collapseShow, false);
    assert.equal(desktop.collapseHeight, "");
    assert.equal(desktop.articleInert, false);
    assert.equal(desktop.headerInert, false);
    assert.equal(desktop.toolsInert, false);
    assert.equal(desktop.backdropDisplay, "none");
    if (name === "WebKit") await shot("webkit-home-zh-992-desktop.png");
    await page.locator("#navbarCollapse .dropdown-toggle").first().click();
    assert.equal(await page.locator("#navbarCollapse .dropdown-menu").first().evaluate(node => getComputedStyle(node).position), "absolute");
    assert.equal(await page.locator("#navbarCollapse .dropdown-menu").first().evaluate(node => node.classList.contains("show")), true);
    await page.setViewportSize({ width: 991, height: 900 });
    await page.waitForFunction(() => document.querySelector("#navbarCollapse .dropdown-toggle").getAttribute("data-bs-toggle") === null);
    assert.equal((await snapshot(page)).bodyOpen, false);
    assert.equal(await page.locator("#navbarCollapse .show, #navbarCollapse .collapsing").count(), 0);
    await open(page);
    if (name === "WebKit") await shot("webkit-home-zh-991-open.png");
    await page.locator("#kt-global-nav-close").click();
    count.interactions += 2;

    await page.setViewportSize({ width: 390, height: 500 });
    await page.goto(url("zh"));
    await open(page);
    for (const toggle of await page.locator("#navbarCollapse .dropdown-toggle").all())
      if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const panel = page.locator("#navbarCollapse");
    assert(await panel.evaluate(node => node.scrollHeight > node.clientHeight), `${name}: short drawer scroll`);
    await panel.evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert(await panel.evaluate(node => node.scrollTop > 0));
    if (name === "WebKit") await shot("webkit-home-zh-390x500-scroll.png");
    count.interactions++;

    await page.goto(url("en", "help"));
    await page.evaluate(() => scrollTo(0, 450));
    const beforeScroll = await page.evaluate(() => scrollY);
    await page.locator("#quarto-header .navbar-toggler").evaluate(node => node.click());
    assert.equal((await snapshot(page)).scroll, beforeScroll, `${name}: open preserves article scroll`);
    await page.locator("#kt-global-nav-close").click();
    assert.equal((await snapshot(page)).scroll, beforeScroll, `${name}: close preserves article scroll`);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#quarto-header .navbar-toggler").evaluate(node => node.click());
    assert.equal(await page.locator("#navbarCollapse").evaluate(node => getComputedStyle(node).transitionDuration), "0s");
    await page.locator("#kt-global-nav-close").click();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    count.interactions += 2;

    for (const width of [992, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url("zh"));
      desktop = await snapshot(page);
      assert.equal(desktop.backdropDisplay, "none");
      assert.equal(desktop.bodyOpen, false);
      assert.equal(desktop.panelPosition, "static");
      assert.equal(desktop.aria, "false");
      assert.equal(await page.locator("#kt-global-nav-toolbar").isVisible(), false);
      assert.equal(await page.locator("#quarto-header .navbar-toggler").isVisible(), false);
      count.geometry++;
    }
    if (name === "WebKit") await shot("webkit-home-zh-1440-desktop.png");
    console.log(`${name}: PASS ${JSON.stringify(count)}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  await run("WebKit", webkit);
  await run("Edge", chromium, { executablePath: edgeExecutable });
})().catch(error => { console.error(error); process.exitCode = 1; });
