"use strict";

// Run against the assembled local site; WebKit sweeps all exact entry targets.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");
const core = require("../assets/kt-search-core.js");

const site = path.resolve(__dirname, "..");
const base = process.env.KT_BASE_URL || "http://127.0.0.1:8775";
const qaDir = process.env.KT_QA_DIR;
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const aliases = JSON.parse(fs.readFileSync(path.join(site, "scripts/search_aliases.json"), "utf8"));
const records = Object.fromEntries(["zh", "en"].map(locale => [locale,
  JSON.parse(fs.readFileSync(path.join(site, `_site/${locale === "en" ? "en/" : ""}kt-search.json`), "utf8"))]));
const prepared = Object.fromEntries(["zh", "en"].map(locale => [locale, core.prepare(records[locale], aliases, locale)]));
const codex = Object.fromEntries(["zh", "en"].map(locale => [locale, records[locale].filter(item => item.type === "codex")]));
const representative = ["codex-people-1", "codex-people-3", "codex-people-5",
  "codex-species-8", "codex-magic-4", "codex-history-1", "codex-world-7", "codex-world-8"];

function route(locale, fragment = "", query = "") {
  return `${base}/${locale === "en" ? "en/" : ""}collectibles/codex.html${query ? `?q=${encodeURIComponent(query)}` : ""}${fragment ? `#${fragment}` : ""}`;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function switchLanguage(page, other, fragment) {
  const link = page.locator("nav.navbar ul.navbar-nav.ms-auto a.nav-link");
  await settle(page);
  await page.waitForFunction(expected =>
    document.querySelector("nav.navbar ul.navbar-nav.ms-auto a.nav-link")?.href === expected,
    route(other, fragment));
  if (!(await link.isVisible())) {
    await page.locator("button.navbar-toggler").click();
    await page.waitForFunction(() => document.body.classList.contains("kt-global-nav-open"));
  }
  const before = page.url();
  const href = await link.getAttribute("href");
  await link.click();
  try {
    await page.waitForURL(route(other, fragment), { timeout: 5000 });
  } catch (error) {
    throw new Error(`language switch did not navigate: ${JSON.stringify({ before, href, after: page.url(), target: route(other, fragment) })}`, { cause: error });
  }
}

async function inspectTarget(page, fragment, name, context) {
  const detail = await page.evaluate(id => {
    const matches = [...document.querySelectorAll("[id]")].filter(node => node.id === id);
    const target = matches[0];
    if (!target) return { count: matches.length };
    const box = target.getBoundingClientRect();
    const header = document.getElementById("quarto-header").getBoundingClientRect();
    const row = target.closest("tr");
    const table = target.closest("table");
    const category = target.closest("section.level2");
    return { count: matches.length, tag: target.tagName, text: target.textContent,
      className: target.className, connected: target.isConnected, tabindex: target.getAttribute("tabindex"),
      role: target.getAttribute("role"), width: box.width, height: box.height, top: box.top,
      bottom: box.bottom, headerBottom: header.bottom, viewport: innerHeight,
      scrollMargin: parseFloat(getComputedStyle(target).scrollMarginTop),
      background: getComputedStyle(target).backgroundColor,
      rowKey: `${category?.id}:${row?.sectionRowIndex}`, cells: row?.cells.length,
      table: table?.tagName, row: row?.tagName };
  }, fragment);
  assert.equal(new URL(page.url()).hash, `#${fragment}`, `${context}: hash`);
  assert.equal(detail.count, 1, `${context}: target count`);
  assert.equal(detail.tag, "SPAN", `${context}: neutral target element`);
  assert.equal(detail.text, name, `${context}: native name`);
  assert(detail.className.split(" ").includes("kt-codex-entry"), `${context}: target class`);
  assert.equal(detail.connected, true, `${context}: disconnected target`);
  assert.equal(detail.tabindex, null, `${context}: spurious keyboard stop`);
  assert.equal(detail.role, null, `${context}: spurious role`);
  assert.equal(detail.cells, 4, `${context}: original table columns`);
  assert.equal(detail.table, "TABLE");
  assert.equal(detail.row, "TR");
  assert(detail.width > 0 && detail.height > 0, `${context}: invisible name`);
  assert(detail.top >= detail.headerBottom - 3 && detail.top < detail.viewport && detail.bottom > detail.headerBottom,
    `${context}: target outside visible viewport or occluded ${JSON.stringify(detail)}`);
  assert(detail.scrollMargin >= 75, `${context}: missing scroll margin`);
  assert.notEqual(detail.background, "rgba(0, 0, 0, 0)", `${context}: targeted name not highlighted`);
  return detail;
}

async function directSweep(browser, engine, full) {
  let page = await browser.newPage({ viewport: { width: 574, height: 800 } });
  const outcome = { checked: 0, switches: 0, byLocale: {}, multiRows: 0 };
  try {
    for (const locale of ["zh", "en"]) {
      const items = full ? codex[locale] : codex[locale].filter(item => representative.includes(item.href.split("#")[1]));
      for (const item of items) {
        const fragment = item.href.split("#")[1];
        const name = item.section.split(" · ").at(-1);
        await page.goto(route(locale, fragment), { waitUntil: "load" });
        await settle(page);
        await inspectTarget(page, fragment, name, `${engine} ${locale} ${item.objectID}`);
        outcome.checked++;
      }
      outcome.byLocale[locale] = items.length;
    }
    await page.close();
    for (const locale of ["zh", "en"]) {
      const other = locale === "zh" ? "en" : "zh";
      const items = full ? codex[locale] : codex[locale].filter(item => representative.includes(item.href.split("#")[1]));
      for (const item of items) {
        page = await browser.newPage({ viewport: { width: 574, height: 800 } });
        const fragment = item.href.split("#")[1];
        const name = item.section.split(" · ").at(-1);
        await page.goto(route(locale, fragment));
        assert.equal(page.url(), route(locale, fragment));
        await switchLanguage(page, other, fragment);
        await settle(page);
        assert.equal(page.url(), route(other, fragment), `${engine} ${locale} switch ${fragment}`);
        await inspectTarget(page, fragment, name, `${engine} ${locale}->${other} ${fragment}`);
        outcome.switches++;
        await page.close();
      }
    }
    page = await browser.newPage({ viewport: { width: 574, height: 800 } });
    const allMulti = await page.goto(route("zh")).then(() => page.evaluate(() =>
      [...document.querySelectorAll("table tr")].map(row => [...row.querySelectorAll("span.kt-codex-entry[id]")].map(span => span.id)).filter(ids => ids.length > 1)));
    assert.equal(allMulti.length, 9, `${engine}: multi-entry row count`);
    const multi = full ? allMulti : allMulti.filter(ids => ids.includes("codex-species-8"));
    for (const group of multi) {
      const seen = [];
      for (const fragment of group) {
        const item = codex.zh.find(record => record.href.endsWith(`#${fragment}`));
        assert(item, `${engine}: missing multi-entry record ${fragment}`);
        await page.goto(route("zh", fragment));
        await settle(page);
        seen.push(await inspectTarget(page, fragment, item.section.split(" · ").at(-1), `${engine} multi ${fragment}`));
      }
      assert.equal(new Set(group).size, group.length, `${engine}: shared-row fragments collided`);
      assert.equal(new Set(seen.map(item => item.rowKey)).size, 1, `${engine}: multi entries changed row`);
      outcome.multiRows++;
    }
  } finally { if (!page.isClosed()) await page.close(); }
  return outcome;
}

async function searchCase(page, locale, query, objectID) {
  await page.goto(`${base}/${locale === "en" ? "en/" : ""}`);
  await page.locator("#kt-search-launcher").click();
  await page.locator("#kt-search-input").fill(query);
  const expected = core.search(prepared[locale], query, { limit: 24 });
  const index = expected.findIndex(item => item.objectID === objectID);
  assert(index >= 0, `${locale} ${query}: entry not in search results`);
  const item = expected[index];
  const fragment = item.href.split("#")[1];
  const link = page.locator("a.kt-search-result").nth(index);
  await link.waitFor();
  const href = new URL(await link.getAttribute("href"), base);
  assert.equal(href.pathname, new URL(route(locale, fragment)).pathname);
  assert.equal(href.hash, `#${fragment}`);
  assert.equal(href.searchParams.get("q"), query);
  await link.click();
  await page.waitForLoadState("load");
  await settle(page);
  await inspectTarget(page, fragment, item.section.split(" · ").at(-1), `${locale} search ${query}`);
  assert.equal(new URL(page.url()).searchParams.get("q"), query);
  const marks = await page.locator(`#${fragment} mark.kt-search-mark`).count();
  assert(marks > 0, `${locale} ${query}: target name not highlighted`);
  return { locale, query, fragment, marks };
}

async function historyTarget(page, locale, fragment, context) {
  const item = codex[locale].find(record => record.href.endsWith(`#${fragment}`));
  assert(item, `${context}: missing Codex record`);
  await settle(page);
  await inspectTarget(page, fragment, item.section.split(" · ").at(-1), context);
}

async function flows(browser, engine) {
  const page = await browser.newPage({ viewport: { width: 574, height: 800 } });
  const result = { searches: [], history: 0 };
  try {
    for (const [query, objectID] of [
      ["People Macsen", "codex:codex-people:5"],
      ["Species Softscales", "codex:codex-species:8"],
      ["Magic Hydronetics", "codex:codex-magic:4"],
      ["History Timeline", "codex:codex-history:1"],
      ["World Spiceport City", "codex:codex-world:7"],
      ["People Sierra", "codex:codex-people:3"],
    ]) {
      for (const locale of ["zh", "en"]) result.searches.push(await searchCase(page, locale, query, objectID));
    }
    const a = "codex-people-5", b = "codex-people-6";
    await page.goto(route("zh", a));
    await switchLanguage(page, "en", a);
    assert.equal(page.url(), route("en", a));
    await historyTarget(page, "en", a, `${engine} history switch`);
    await page.goBack(); await historyTarget(page, "zh", a, `${engine} history switch back`);
    await page.goForward(); await historyTarget(page, "en", a, `${engine} history switch forward`);
    result.history++;

    await page.goto(route("zh", a));
    await page.goto(route("zh", b));
    await page.goBack(); await historyTarget(page, "zh", a, `${engine} same category back`);
    await page.goForward(); await historyTarget(page, "zh", b, `${engine} same category forward`);
    result.history++;

    await page.goto(route("zh", "codex-species-1"));
    await page.goto(route("zh", "codex-species-2"));
    await page.goBack(); await historyTarget(page, "zh", "codex-species-1", `${engine} shared row back`);
    await page.goForward(); await historyTarget(page, "zh", "codex-species-2", `${engine} shared row forward`);
    result.history++;

    await searchCase(page, "en", "People Macsen", "codex:codex-people:5");
    await page.keyboard.press("Escape");
    assert.equal(page.url(), route("en", a));
    assert.equal(await page.locator("mark.kt-search-mark").count(), 0);
    await historyTarget(page, "en", a, `${engine} dismissed search`);
    await page.goBack(); assert.equal(new URL(page.url()).pathname, "/en/");
    await page.goForward(); await historyTarget(page, "en", a, `${engine} search forward`);
    result.history++;
  } finally { await page.close(); }
  return result;
}

async function semantics(browser, engine) {
  const page = await browser.newPage({ viewport: { width: 574, height: 800 } });
  const outcomes = [];
  try {
    for (const width of [574, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of ["zh", "en"]) {
        await page.goto(route(locale, "codex-species-8"));
        const roles = { tables: await page.getByRole("table").count(), rows: await page.getByRole("row").count(),
          headers: await page.getByRole("columnheader").count(), cells: await page.getByRole("cell").count() };
        assert.deepEqual(roles, { tables: 5, rows: 44, headers: 20, cells: 156 }, `${engine} ${locale} ${width}: table semantics`);
        const cellSnapshot = await page.locator("#codex-species-8").locator("xpath=parent::td").ariaSnapshot();
        assert.equal((cellSnapshot.match(/Softscales/g) || []).length, 1, `${engine} ${locale} ${width}: duplicate spoken name`);
        const overflow = await page.evaluate(() => {
          const actual = document.documentElement.scrollWidth;
          for (const span of document.querySelectorAll("span.kt-codex-entry")) span.replaceWith(...span.childNodes);
          document.getElementById("kt-codex-entry-style").remove();
          return { actual, baseline: document.documentElement.scrollWidth, viewport: innerWidth };
        });
        assert(overflow.actual <= overflow.baseline + 1, `${engine} ${locale} ${width}: Codex overflow worsened`);
        outcomes.push({ engine, locale, width, roles, overflow });
      }
    }
  } finally { await page.close(); }
  return outcomes;
}

async function runEngine(engine, browser, full) {
  console.log(`${engine} ${browser.version()} starting`);
  const direct = await directSweep(browser, engine, full);
  console.log(`${engine} direct=${direct.checked} switch=${direct.switches} multiRows=${direct.multiRows} PASS`);
  const interactions = await flows(browser, engine);
  console.log(`${engine} search=${interactions.searches.length} history=${interactions.history} PASS`);
  const accessibility = await semantics(browser, engine);
  console.log(`${engine} semantics=${accessibility.length} PASS`);
  return { engine, version: browser.version(), direct, interactions, accessibility };
}

async function main() {
  assert.equal(codex.zh.length, 56);
  assert.equal(codex.en.length, 56);
  assert.deepEqual(codex.zh.map(item => item.objectID), codex.en.map(item => item.objectID));
  const results = [];
  const wb = await webkit.launch({ headless: true });
  try { results.push(await runEngine("WebKit", wb, true)); } finally { await wb.close(); }
  assert(fs.existsSync(edgeExecutable), "Installed system Edge executable is unavailable");
  const eb = await chromium.launch({ executablePath: edgeExecutable, headless: true });
  try { results.push(await runEngine("Edge", eb, false)); } finally { await eb.close(); }
  if (qaDir) {
    fs.mkdirSync(qaDir, { recursive: true });
    fs.writeFileSync(path.join(qaDir, "codex-runtime.json"), JSON.stringify({ results }, null, 2) + "\n");
  }
  console.log("Codex runtime: PASS engines=WebKit,Edge");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
