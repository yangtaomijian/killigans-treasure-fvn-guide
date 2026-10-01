"use strict";

// State and interaction contract for the controlled Search shell.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");

const base = process.env.KT_BASE_URL || "http://127.0.0.1:18775";
const shots = process.env.KT_SCREENSHOT_DIR;
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const widths = [1440, 1280, 1024, 430, 390, 375, 352, 320];

async function state(page) {
  return page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector), r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const results = document.getElementById("kt-search-results");
    return { dialog: box("#kt-search-dialog"), head: box(".kt-search-head"),
      input: box("#kt-search-input"), clear: box("#kt-search-clear"),
      cancel: box("#kt-search-close"), results: box("#kt-search-results"),
      rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
      clearHidden: document.getElementById("kt-search-clear").hidden,
      status: document.getElementById("kt-search-status").textContent,
      statusDisplay: getComputedStyle(document.getElementById("kt-search-status")).display,
      resultCount: results.childElementCount, resultScroll: results.scrollHeight,
      resultClient: results.clientHeight, documentWidth: document.documentElement.scrollWidth,
      focus: document.activeElement.id, dialogOpen: document.getElementById("kt-search-dialog").open,
      dialogName: document.getElementById("kt-search-dialog").getAttribute("aria-label"),
      clearName: document.getElementById("kt-search-clear").getAttribute("aria-label"),
      cancelText: document.getElementById("kt-search-close").textContent,
      headerInert: document.getElementById("quarto-header").inert,
      articleInert: document.getElementById("quarto-document-content").inert };
  });
}

async function run(name, engine, options = {}) {
  const browser = await engine.launch({ headless: true, ...options });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const counts = { states: 0, keyboard: 0, escape: 0, failure: 0, shots: 0, desktopRows: [] };
  const shot = async label => {
    if (name !== "WebKit" || !shots) return;
    await page.screenshot({ path: path.join(shots, `webkit-search-${label}.png`) });
    counts.shots++;
  };
  try {
    for (const locale of ["zh", "en"]) {
      for (const width of widths) {
        const height = width >= 992 ? 900 : 700;
        await page.setViewportSize({ width, height });
        await page.goto(`${base}/${locale === "en" ? "en/" : ""}index.html`);
        await page.locator("#kt-search-launcher").click();
        const blank = await state(page);
        assert(blank.dialogOpen && blank.focus === "kt-search-input");
        assert.equal(blank.dialogName, locale === "zh" ? "搜索" : "Search");
        assert.equal(blank.clearName, locale === "zh" ? "清空搜索" : "Clear search");
        assert.equal(blank.cancelText, locale === "zh" ? "取消" : "Cancel");
        assert(blank.clearHidden && blank.status === "" && blank.statusDisplay === "none" && blank.resultCount === 0,
          `${name} ${locale} ${width}: redundant blank state`);
        assert(Math.abs(blank.dialog.y - (width >= 992 ? height * .1 : 12)) <= 1,
          `${name} ${locale} ${width}: initial top ${blank.dialog.y}`);
        const expectedWidth = width >= 1024 ? Math.min(52 * blank.rootSize, width - 2.5 * blank.rootSize)
          : width - blank.rootSize;
        assert(Math.abs(blank.dialog.width - expectedWidth) <= 1,
          `${name} ${locale} ${width}: Search width ${blank.dialog.width}, expected ${expectedWidth}`);
        if (locale === "zh" && width === 1440) await shot("blank-desktop-zh-1440");
        if (locale === "zh" && width === 390) await shot("blank-mobile-zh-390");

        await page.locator("#kt-search-input").fill("Memories");
        await page.waitForFunction(() => document.querySelectorAll(".kt-search-result").length > 0 &&
          !/加载|Loading/.test(document.getElementById("kt-search-status").textContent));
        const found = await state(page);
        assert(!found.clearHidden && found.resultCount > 0 && found.resultCount <= 24);
        assert(!/最多|up to/i.test(found.status) && /结果|results/.test(found.status));
        assert(Math.abs(found.dialog.y - blank.dialog.y) <= .5 && Math.abs(found.input.y - blank.input.y) <= .5 &&
          Math.abs(found.cancel.y - blank.cancel.y) <= .5, `${name} ${locale} ${width}: Search header jumped`);
        assert(found.results.y >= blank.head.bottom - 1 && found.dialog.bottom <= height - 8,
          `${name} ${locale} ${width}: results did not expand downward`);
        assert(found.dialog.x >= 7 && found.dialog.right <= width - 7 &&
          found.cancel.x >= found.dialog.x && found.cancel.right <= found.dialog.right &&
          found.clear.x >= found.input.x && found.clear.right <= found.input.right &&
          found.documentWidth <= width + 1, `${name} ${locale} ${width}: control or page overflow`);
        if (width <= 390) assert(found.resultScroll > found.resultClient,
          `${name} ${locale} ${width}: result list does not scroll internally`);
        if (width >= 1024) {
          const row = await page.locator(".kt-search-result").first().evaluate(node => {
            const style = getComputedStyle(node);
            return { height: node.getBoundingClientRect().height,
              paddingTop: parseFloat(style.paddingTop), paddingBottom: parseFloat(style.paddingBottom) };
          });
          assert(Math.abs(row.paddingTop - .7 * found.rootSize) <= .5 &&
            Math.abs(row.paddingBottom - .7 * found.rootSize) <= .5,
          `${name} ${locale} ${width}: result spacing changed`);
          counts.desktopRows.push({ locale, width, ...row });
        }
        if (locale === "en" && [1440, 1280, 1024, 390, 320].includes(width)) {
          const selection = async () => page.evaluate(() => {
            const links = [...document.querySelectorAll(".kt-search-result")];
            const active = document.activeElement;
            const style = getComputedStyle(active);
            const probe = document.createElement("span");
            probe.style.color = "var(--kt-focus)";
            probe.style.background = "color-mix(in srgb, var(--kt-accent) 5%, transparent)";
            probe.style.boxShadow = "inset 2px 0 var(--kt-accent)";
            document.body.append(probe);
            const expected = getComputedStyle(probe);
            const data = { index: links.indexOf(active), ariaSelected: active.getAttribute("aria-selected"),
              focusVisible: active.matches(":focus-visible"), outlineWidth: style.outlineWidth,
              outlineStyle: style.outlineStyle, outlineColor: style.outlineColor,
              outlineOffset: style.outlineOffset, background: style.backgroundColor,
              leftRule: style.boxShadow, expectedColor: expected.color,
              expectedBackground: expected.backgroundColor, expectedRule: expected.boxShadow };
            probe.remove();
            return data;
          });
          await page.locator("#kt-search-input").press("ArrowDown");
          for (const [key, expectedIndex] of [[null, 0], ["ArrowDown", 1], ["ArrowUp", 0]]) {
            if (key) await page.keyboard.press(key);
            const selected = await selection();
            assert.equal(selected.index, expectedIndex, `${name} ${width}: keyboard result order`);
            assert(selected.focusVisible && selected.outlineWidth === "2px" &&
              selected.outlineStyle === "solid" && selected.outlineColor === selected.expectedColor &&
              selected.outlineOffset === "-2px" && selected.background === selected.expectedBackground &&
              selected.leftRule === selected.expectedRule,
            `${name} ${width}: Search result focus state ${JSON.stringify(selected)}`);
            counts.keyboard++;
          }
          await page.locator("#kt-search-input").focus();
        }
        if (locale === "zh" && width === 1440) await shot("results-desktop-zh-1440");
        if (locale === "zh" && width === 390 && shots) {
          await shot("results-mobile-zh-390");
          await page.locator(".kt-search-head").screenshot({ path: path.join(shots, "webkit-search-clear-zh-390.png") });
          counts.shots++;
        }

        const duringQueryChange = await page.evaluate(() => {
          const input = document.getElementById("kt-search-input");
          input.value = "zzzz-kt-no-match";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return { count: document.getElementById("kt-search-results").childElementCount,
            status: document.getElementById("kt-search-status").textContent };
        });
        assert.equal(duringQueryChange.count, 0, `${name} ${locale} ${width}: stale results during new query`);
        assert(/正在加载|Loading/.test(duringQueryChange.status));
        await page.waitForFunction(() => /没有找到结果|No results/.test(document.getElementById("kt-search-status").textContent));
        await page.locator("#kt-search-input").fill("Memories");
        await page.locator(".kt-search-result").first().waitFor();

        if (locale === "en" && width === 390) {
          if (name === "Edge") {
            await page.locator("#kt-search-input").focus();
            await page.keyboard.press("Tab");
          } else {
            // WebKit's default automated Tab policy skips buttons.
            await page.locator("#kt-search-clear").focus();
          }
          assert.equal(await page.evaluate(() => document.activeElement.id), "kt-search-clear");
          assert.equal(await page.locator("#kt-search-clear").evaluate(node => getComputedStyle(node).outlineWidth), "2px");
          await page.locator("#kt-search-clear").press("Enter");
        } else await page.locator("#kt-search-clear").click();
        const cleared = await state(page);
        assert(cleared.dialogOpen && cleared.clearHidden && cleared.status === "" &&
          cleared.resultCount === 0 && cleared.focus === "kt-search-input", `${name} ${locale} ${width}: clear semantics`);
        assert(Math.abs(cleared.input.y - blank.input.y) <= .5);

        await page.locator("#kt-search-input").fill("zzzz-kt-no-match");
        await page.waitForFunction(() => /没有找到结果|No results/.test(document.getElementById("kt-search-status").textContent));
        const none = await state(page);
        assert(none.resultCount === 0 && Math.abs(none.input.y - blank.input.y) <= .5,
          `${name} ${locale} ${width}: no-results state jumped`);
        if (locale === "zh" && width === 390) await shot("no-results-zh-390");

        await page.locator("#kt-search-close").click();
        const closed = await state(page);
        assert(!closed.dialogOpen && closed.focus === "kt-search-launcher" &&
          !closed.headerInert && !closed.articleInert,
          `${name} ${locale} ${width}: Cancel close/focus`);
        counts.states++;
      }

      await page.setViewportSize({ width: 390, height: 700 });
      await page.goto(`${base}/${locale === "en" ? "en/" : ""}index.html`);
      await page.locator("#kt-search-launcher").click();
      await page.locator("#kt-search-input").fill("Memories");
      await page.keyboard.press("Escape");
      let closed = await state(page);
      assert(!closed.dialogOpen && closed.focus === "kt-search-launcher", `${name} ${locale}: Escape from input`);
      await page.locator("#kt-search-launcher").click();
      await page.locator("#kt-search-input").fill("Memories");
      await page.locator(".kt-search-result").first().waitFor();
      await page.locator("#kt-search-input").press("ArrowDown");
      await page.keyboard.press("Escape");
      closed = await state(page);
      assert(!closed.dialogOpen && closed.focus === "kt-search-launcher", `${name} ${locale}: Escape from result`);
      counts.escape += 2;

      await page.goto(`${base}/${locale === "en" ? "en/" : ""}index.html`);
      await page.route("**/kt-search.json", route => route.abort());
      await page.locator("#kt-search-launcher").click();
      const blank = await state(page);
      await page.locator("#kt-search-input").fill("Memories");
      await page.waitForFunction(() => /暂时不可用|temporarily unavailable/.test(document.getElementById("kt-search-status").textContent));
      const failed = await state(page);
      assert(failed.resultCount === 0 && Math.abs(failed.dialog.y - blank.dialog.y) <= .5 &&
        Math.abs(failed.input.y - blank.input.y) <= .5, `${name} ${locale}: load failure shifted Search`);
      await page.locator("#kt-search-close").click();
      await page.unroute("**/kt-search.json");
      counts.failure++;
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
