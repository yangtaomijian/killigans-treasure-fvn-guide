"use strict";

// Run after build.sh against local servers for _site/ and /kt-test/.
// NODE_PATH=<installed Playwright root> KT_BASE_URL=http://127.0.0.1:8775 \
// KT_PREFIX_URL=http://127.0.0.1:8776/kt-test node scripts/test_memories_runtime.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit } = require("playwright");
const core = require("../assets/kt-search-core.js");

const site = path.resolve(__dirname, "..");
const base = process.env.KT_BASE_URL || "http://127.0.0.1:8775";
const prefix = process.env.KT_PREFIX_URL || "http://127.0.0.1:8776/kt-test";
const aliases = JSON.parse(fs.readFileSync(path.join(site, "scripts/search_aliases.json"), "utf8"));
const records = Object.fromEntries(["zh", "en"].map(locale => [locale,
  JSON.parse(fs.readFileSync(path.join(site, `_site/${locale === "en" ? "en/" : ""}kt-search.json`), "utf8"))
]));
const prepared = Object.fromEntries(["zh", "en"].map(locale => [locale, core.prepare(records[locale], aliases, locale)]));
const memories = Object.fromEntries(["zh", "en"].map(locale => [locale, records[locale].filter(record => record.type === "memory")]));
const switchSelector = "nav.navbar ul.navbar-nav.ms-auto a.nav-link";
const counts = { directZH: 0, directEN: 0, switchZHEN: 0, switchENZH: 0, search: 0, history: 0, prefix: 0, locator: 0, responsive: 0 };
const failures = [];
const screenshotDir = process.env.KT_SCREENSHOT_DIR;

function route(root, locale, fragment, query = "") {
  return `${root}/${locale === "en" ? "en/" : ""}collectibles/memories.html${query ? `?q=${encodeURIComponent(query)}` : ""}#${fragment}`;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertCurrent(page, category, label) {
  await page.waitForFunction(expected => {
    const current = [...document.querySelectorAll('#kt-memory-locator a[aria-current="location"]')];
    return current.length === (expected ? 1 : 0) && (!expected || new URL(current[0].href).hash === `#${expected}`);
  }, category);
  const current = await page.locator('#kt-memory-locator a[aria-current="location"]').evaluateAll(links => links.map(link => new URL(link.href).hash));
  assert.deepEqual(current, category ? [`#${category}`] : [], `${label}: current category`);
}

async function inspectRow(page, fragment, label) {
  const result = await page.evaluate(id => {
    const row = document.getElementById(id);
    const same = [...document.querySelectorAll("[id]")].filter(node => node.id === id).length;
    if (!row) return { same };
    const box = row.getBoundingClientRect();
    const header = document.getElementById("quarto-header").getBoundingClientRect();
    return { same, tag: row.tagName, connected: row.isConnected, width: box.width, height: box.height,
      top: box.top, bottom: box.bottom, headerBottom: header.bottom, viewport: innerHeight,
      display: getComputedStyle(row).display, scrollMargin: getComputedStyle(row).scrollMarginTop };
  }, fragment);
  assert.equal(new URL(page.url()).hash, `#${fragment}`, `${label}: hash`);
  assert.equal(result.same, 1, `${label}: ID count`);
  assert.equal(result.tag, "TR", `${label}: target is not a row`);
  assert.equal(result.connected, true, `${label}: disconnected`);
  assert(result.width > 0 && result.height > 0 && result.display !== "none", `${label}: no visible geometry`);
  assert(result.top < result.viewport + 100 && result.bottom > Math.max(0, result.headerBottom) - 2,
    `${label}: row outside visible viewport/header, ${JSON.stringify(result)}`);
  assert(parseFloat(result.scrollMargin) >= 75, `${label}: fixed-header scroll margin missing`);
  const category = await page.locator(`#${fragment}`).getAttribute("data-memory-category");
  assert(category, `${label}: missing public row category`);
  await assertCurrent(page, category, label);
  return result;
}

async function attempt(label, work) {
  try { await work(); } catch (error) { failures.push(`${label}: ${error.stack}`); }
}

async function switchReady(page, expected) {
  // Complete the document navigation before asking WebKit to traverse history.
  await Promise.all([
    page.waitForURL(expected, { waitUntil: "load" }),
    page.locator(switchSelector).click(),
  ]);
  await settle(page);
}

async function searchToRow(page, locale, query, objectID) {
  await page.goto(`${base}/${locale === "en" ? "en/" : ""}`);
  await page.locator("#kt-search-launcher").click();
  await page.locator("#kt-search-input").fill(query);
  const expected = core.search(prepared[locale], query, { limit: 24 });
  const index = expected.findIndex(item => item.objectID === objectID);
  assert(index >= 0, `${locale} ${query}: expected Memory not in first 24`);
  const record = expected[index];
  await page.waitForFunction(() => !/Loading|加载/.test(document.getElementById("kt-search-status").textContent));
  const link = page.locator("a.kt-search-result").nth(index);
  const wanted = new URL(route(base, locale, record.href.split("#")[1]));
  wanted.searchParams.set("q", query);
  assert.equal(await link.getAttribute("href"), wanted.href);
  await link.click();
  await page.waitForLoadState("load");
  await settle(page);
  assert.equal(new URL(page.url()).searchParams.get("q"), query);
  await inspectRow(page, wanted.hash.slice(1), `${locale} search ${query}`);
  counts.search++;
  return record;
}

async function checkHistory(page) {
  const a = "memory-redroot-memories-1";
  const b = "memory-redroot-memories-2";
  const zhA = route(base, "zh", a);
  const zhB = route(base, "zh", b);
  const enA = route(base, "en", a);
  const enB = route(base, "en", b);
  await page.goto(zhA);
  await switchReady(page, enA);
  assert.equal(page.url(), enA);
  await page.goBack(); assert.equal(page.url(), zhA);
  await page.goForward(); assert.equal(page.url(), enA);
  counts.history++;

  await page.goto(zhA);
  await page.goto(zhB);
  await switchReady(page, enB);
  assert.equal(page.url(), enB);
  await page.goBack(); assert.equal(page.url(), zhB);
  await page.goBack(); assert.equal(page.url(), zhA);
  await page.goForward(); assert.equal(page.url(), zhB);
  await page.goForward(); assert.equal(page.url(), enB);
  counts.history++;

  await searchToRow(page, "en", "Prologue Memories", "memory:redroot-memories:1");
  await page.waitForFunction(() => document.querySelectorAll("mark.kt-search-mark").length > 0);
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.press("Escape");
  const after = new URL(page.url());
  assert.equal(after.hash, `#${a}`);
  assert.equal(after.searchParams.has("q"), false);
  assert.equal(await page.locator("mark.kt-search-mark").count(), 0);
  assert(Math.abs((await page.evaluate(() => scrollY)) - before) < 3, "highlight dismissal scrolled away from row");
  await page.goBack();
  assert.equal(new URL(page.url()).pathname, "/en/");
  await page.goForward();
  assert.equal(new URL(page.url()).hash, `#${a}`);
  assert.equal(new URL(page.url()).searchParams.has("q"), false);
  counts.history++;
}

async function checkLocator(page, browser) {
  const categories = ["redroot-memories", "question-mark-memories", "blueleaf-memories"];
  for (const locale of ["zh", "en"]) {
    await page.goto(`${base}/${locale === "en" ? "en/" : ""}collectibles/memories.html`);
    await assertCurrent(page, "", `${locale} no hash`);
    assert.equal(await page.locator("#kt-memory-locator a").count(), 11);
    assert.equal(await page.locator("#kt-memory-locator li").count(), 3);
    for (const category of categories) {
      await page.locator(`#kt-memory-locator a[href$="#${category}"]`).click();
      assert.equal(new URL(page.url()).hash, `#${category}`);
      await assertCurrent(page, category, `${locale} locator ${category}`);
      counts.locator++;
    }
    await page.goBack();
    await assertCurrent(page, categories[1], `${locale} locator back`);
    await page.goForward();
    await assertCurrent(page, categories[2], `${locale} locator forward`);
    await page.evaluate(() => { location.hash = "#memory-aris-summit-memories-7"; });
    await assertCurrent(page, "aris-summit-memories", `${locale} Single row hashchange`);
    await page.evaluate(() => { location.hash = "#memory-redroot-memories-3"; });
    await assertCurrent(page, "redroot-memories", `${locale} repeated row hashchange`);
    await settle(page);
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      scrollTo(0, 0);
    });
    await page.waitForFunction(() => scrollY < 2);
    await settle(page);
    await switchReady(page, route(base, locale === "zh" ? "en" : "zh", "memory-redroot-memories-3"));
    await assertCurrent(page, "redroot-memories", `${locale} switched row`);
    await page.goBack();
    await assertCurrent(page, "redroot-memories", `${locale} switched row back`);
  }

  await page.goto(route(base, "zh", "memory-redroot-memories-2"));
  await page.locator('#kt-memory-locator a[href$="#shieldfall-memories"]').click();
  await assertCurrent(page, "shieldfall-memories", "row to category");
  await page.goBack();
  assert.equal(new URL(page.url()).hash, "#memory-redroot-memories-2");
  await assertCurrent(page, "redroot-memories", "row to category back");
  await page.goForward();
  await assertCurrent(page, "shieldfall-memories", "row to category forward");
  counts.locator += 3;

  const zhCategory = route(base, "zh", "redroot-memories");
  const zhRow = route(base, "zh", "memory-blueleaf-memories-4");
  const enRow = route(base, "en", "memory-blueleaf-memories-4");
  await page.goto(zhCategory);
  await assertCurrent(page, "redroot-memories", "category to row start");
  await page.goto(zhRow);
  await assertCurrent(page, "blueleaf-memories", "category to row destination");
  await settle(page);
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    scrollTo(0, 0);
  });
  await page.waitForFunction(() => scrollY < 2);
  await switchReady(page, enRow);
  assert.equal(page.url(), enRow);
  await assertCurrent(page, "blueleaf-memories", "category to row switched");
  await page.goBack(); assert.equal(page.url(), zhRow);
  await assertCurrent(page, "blueleaf-memories", "category to row back one");
  await page.goBack(); assert.equal(page.url(), zhCategory);
  await assertCurrent(page, "redroot-memories", "category to row back two");
  await page.goForward(); assert.equal(page.url(), zhRow);
  await assertCurrent(page, "blueleaf-memories", "category to row forward one");
  await page.goForward(); assert.equal(page.url(), enRow);
  await assertCurrent(page, "blueleaf-memories", "category to row forward two");
  counts.locator += 7;

  await page.goto(`${base}/collectibles/memories.html`);
  await page.locator("#kt-memory-locator a").first().focus();
  await page.keyboard.press("Enter");
  assert.equal(new URL(page.url()).hash, "#redroot-memories", "keyboard Enter follows ordinary locator link");
  await assertCurrent(page, "redroot-memories", "keyboard locator activation");
  counts.locator++;

  const noScript = await browser.newContext({ javaScriptEnabled: false });
  try {
    const fallback = await noScript.newPage();
    await fallback.goto(`${base}/collectibles/memories.html`);
    await fallback.locator('#kt-memory-locator a[href$="#aris-memories"]').click();
    assert.equal(new URL(fallback.url()).hash, "#aris-memories", "no-JS ordinary anchor fallback");
    counts.locator++;
  } finally {
    await noScript.close();
  }
}

async function checkResponsive(page) {
  const widths = [1728, 1440, 1280, 1024, 820, 768, 430, 390, 375, 320];
  const measurements = [];
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
  for (const locale of ["zh", "en"]) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/${locale === "en" ? "en/" : ""}collectibles/memories.html`);
      await settle(page);
      const measure = await page.evaluate(() => {
        const locator = document.getElementById("kt-memory-locator");
        const box = locator.getBoundingClientRect();
        const links = [...locator.querySelectorAll("a")];
        const linkOverflow = links.filter(link => link.getBoundingClientRect().right > box.right + 1).length;
        const withLocator = document.documentElement.scrollWidth;
        locator.hidden = true;
        const withoutLocator = document.documentElement.scrollWidth;
        locator.hidden = false;
        return { viewport: innerWidth, box: { left: box.left, right: box.right, width: box.width },
          withLocator, withoutLocator, linkOverflow, height: box.height,
          lines: new Set(links.map(link => Math.round(link.getBoundingClientRect().top))).size };
      });
      assert(measure.box.left >= -1 && measure.box.right <= width + 1, `${locale} ${width}: locator outside viewport ${JSON.stringify(measure)}`);
      assert.equal(measure.linkOverflow, 0, `${locale} ${width}: link outside locator`);
      assert(measure.withLocator <= Math.max(width, measure.withoutLocator) + 1,
        `${locale} ${width}: locator induced overflow ${JSON.stringify(measure)}`);
      assert.equal(await page.locator("#kt-memory-locator").evaluate(node => getComputedStyle(node).position), "static",
        `${locale} ${width}: locator left normal document flow`);
      measurements.push({ locale, width, ...measure });
      counts.responsive++;
      if (screenshotDir && [1440, 1024, 390, 320].includes(width)) {
        await page.locator("#kt-memory-locator").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenshotDir, `locator-${locale}-${width}.png`) });
      }
      if ([1440, 390].includes(width)) {
        const first = page.locator("#kt-memory-locator a").first();
        await first.focus();
        const focus = await first.evaluate(link => ({ style: getComputedStyle(link).outlineStyle, width: parseFloat(getComputedStyle(link).outlineWidth) }));
        assert(focus.style !== "none" && focus.width >= 2, `${locale} ${width}: invisible keyboard focus`);
      }
    }
  }
  if (screenshotDir) fs.writeFileSync(path.join(screenshotDir, "responsive-measurements.json"), JSON.stringify(measurements, null, 2) + "\n");
  console.log(`Locator responsive widths=${counts.responsive} measurements=${JSON.stringify(measurements.filter(item => [1440, 1024, 390, 320].includes(item.width)))}`);
}

async function main() {
  assert.equal(memories.zh.length, 87);
  assert.equal(memories.en.length, 87);
  assert.deepEqual(memories.zh.map(item => item.objectID), memories.en.map(item => item.objectID));
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    for (const locale of ["zh", "en"]) {
      for (const record of memories[locale]) {
        const fragment = record.href.split("#")[1];
        const label = `${locale} ${record.objectID}`;
        await attempt(label, async () => {
          await page.goto(route(base, locale, fragment), { waitUntil: "load" });
          await settle(page);
          await inspectRow(page, fragment, label);
          counts[locale === "zh" ? "directZH" : "directEN"]++;
          await page.locator(switchSelector).click();
          await page.waitForLoadState("load");
          await settle(page);
          const other = locale === "zh" ? "en" : "zh";
          assert.equal(new URL(page.url()).pathname, new URL(route(base, other, fragment)).pathname);
          await inspectRow(page, fragment, `${label} switched`);
          counts[locale === "zh" ? "switchZHEN" : "switchENZH"]++;
        });
      }
      console.log(`${locale.toUpperCase()} direct=${counts[locale === "zh" ? "directZH" : "directEN"]} switch=${counts[locale === "zh" ? "switchZHEN" : "switchENZH"]} failures=${failures.length}`);
    }

    const examples = [
      ["zh", "Prologue Memories", "memory:redroot-memories:1"],
      ["en", "Prologue Memories", "memory:redroot-memories:1"],
      ["zh", "Redroot Wilds Day 8 Memories", "memory:redroot-wilds-memories:4"],
      ["en", "Redroot Wilds Day 8 Memories", "memory:redroot-wilds-memories:5"],
      ["zh", "单身图标", "memory:aris-summit-memories:7"],
      ["en", "Single Memories", "memory:aris-summit-memories:7"],
      ["zh", "Macsen Memories", "memory:aris-summit-memories:9"],
      ["en", "Macsen Memories", "memory:aris-summit-memories:9"],
      ["zh", "Zhokhar Memories", "memory:spiceport-memories:3"],
      ["en", "Zhokhar Memories", "memory:spiceport-memories:3"],
      ["zh", "蓝叶森林 Day 11 Zhokhar 关系图标", "memory:blueleaf-memories:4"],
      ["en", "Blueleaf Grove Day 11 Zhokhar relationship icon", "memory:blueleaf-memories:4"],
    ];
    for (const [locale, query, objectID] of examples) {
      await attempt(`search ${locale} ${query}`, () => searchToRow(page, locale, query, objectID));
    }
    await attempt("history", () => checkHistory(page));
    await attempt("locator", () => checkLocator(page, browser));
    for (const locale of ["zh", "en"]) {
      await attempt(`prefix ${locale}`, async () => {
        const fragment = "memory-redroot-wilds-memories-4";
        await page.goto(route(prefix, locale, fragment));
        await settle(page);
        await inspectRow(page, fragment, `prefix ${locale}`);
        counts.prefix++;
      });
    }
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(route(base, "zh", "memory-redroot-memories-1"));
      const widths = await page.evaluate(() => {
        const style = document.getElementById("kt-memory-row-landing");
        const withStyle = document.documentElement.scrollWidth;
        style.disabled = true;
        const withoutStyle = document.documentElement.scrollWidth;
        return { withStyle, withoutStyle };
      });
      assert.equal(widths.withStyle, widths.withoutStyle, `${width}: Memory scroll margin affected document width`);
    }
    await attempt("responsive", () => checkResponsive(page));
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failures, []);
    console.log(`Memory WebKit ${browser.version()}: PASS ${JSON.stringify(counts)} viewport/header failures=0`);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); if (failures.length) console.error(failures.join("\n")); process.exitCode = 1; });
