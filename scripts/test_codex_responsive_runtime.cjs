"use strict";

// Responsive Codex geometry, deep-link, search, and semantic browser gate.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");
const core = require("../assets/kt-search-core.js");

const site = path.resolve(__dirname, "..");
const base = process.env.KT_BASE_URL || "http://127.0.0.1:8775";
const qaDir = process.env.KT_QA_DIR;
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const widths = [1440, 1280, 1024, 320, 375, 390, 430, 450, 451, 455, 459, 460, 461, 480, 575, 600, 768];
const locales = ["zh", "en"];
const aliases = JSON.parse(fs.readFileSync(path.join(site, "scripts/search_aliases.json"), "utf8"));
const records = Object.fromEntries(locales.map(locale => [locale,
  JSON.parse(fs.readFileSync(path.join(site, `_site/${locale === "en" ? "en/" : ""}kt-search.json`), "utf8"))]));
const prepared = Object.fromEntries(locales.map(locale => [locale, core.prepare(records[locale], aliases, locale)]));
const codex = Object.fromEntries(locales.map(locale => [locale, records[locale].filter(item => item.type === "codex")]));
const searchCases = [
  ["People Macsen", "codex:codex-people:5"],
  ["People Sierra", "codex:codex-people:3"],
  ["People The Clutchmates", "codex:codex-people:9"],
  ["Species Bovolian", "codex:codex-species:2"],
  ["Magic Hydronetics", "codex:codex-magic:4"],
  ["History Timeline", "codex:codex-history:1"],
  ["World Spiceport City", "codex:codex-world:7"],
  ["World Aris", "codex:codex-world:4"],
];

function route(locale, fragment = "") {
  return `${base}/${locale === "en" ? "en/" : ""}collectibles/codex.html${fragment ? `#${fragment}` : ""}`;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function measure(page) {
  return page.evaluate(() => {
    const article = document.getElementById("quarto-document-content");
    const tables = [...article.querySelectorAll("table.kt-codex-responsive-table")];
    const rows = tables.flatMap(table => [...table.tBodies[0].rows]);
    const heights = rows.map(row => row.getBoundingClientRect().height).sort((a, b) => a - b);
    const first = tables[0];
    const phrase = [...article.querySelectorAll("li:has(> a#codex-aris-tax) > code")]
      .find(code => code.textContent === "Check out the Bestial Alleys?");
    const otherCode = [...article.querySelectorAll("li:has(> a#codex-aris-tax) > code")]
      .find(code => code !== phrase);
    const rowHeight = id => document.getElementById(id).closest("tr").getBoundingClientRect().height;
    return {
      viewport: innerWidth, articleWidth: article.getBoundingClientRect().width,
      tableCount: tables.length, rowCount: rows.length, entryCount: article.querySelectorAll(".kt-codex-entry").length,
      multiRows: rows.filter(row => row.cells[0].querySelectorAll(".kt-codex-entry").length > 1).length,
      locales: tables.map(table => table.dataset.codexLocale),
      stylesheetCount: document.querySelectorAll("#kt-codex-responsive-style").length,
      tableWidth: Math.max(...tables.map(table => table.getBoundingClientRect().width)),
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      rowMedian: heights[Math.floor(heights.length / 2)], rowMax: heights.at(-1),
      tableHeight: tables.reduce((sum, table) => sum + table.getBoundingClientRect().height, 0),
      multiHeight: rowHeight("codex-species-1"), longHeight: rowHeight("codex-people-9"),
      tableDisplay: getComputedStyle(first).display, bodyDisplay: getComputedStyle(first.tBodies[0]).display,
      rowDisplay: getComputedStyle(rows[0]).display, cellDisplay: getComputedStyle(rows[0].cells[0]).display,
      headerPosition: getComputedStyle(first.tHead).position,
      headerWidth: first.tHead.getBoundingClientRect().width,
      firstLabel: getComputedStyle(rows[0].cells[1], "::before").content,
      phrase: phrase?.textContent, phraseWhiteSpace: phrase && getComputedStyle(phrase).whiteSpace,
      phraseMarked: phrase?.classList.contains("kt-codex-overflow-code"),
      otherCodeMarked: otherCode?.classList.contains("kt-codex-overflow-code"),
      columns: tables.map(table => [...table.tHead.rows[0].cells].map(cell => cell.getBoundingClientRect().width)),
    };
  });
}

async function geometry(browser, engine) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const results = [];
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of locales) {
        await page.goto(route(locale)); await settle(page);
        const item = await measure(page);
        const compact = width <= 459;
        const context = `${engine} ${locale} ${width}`;
        assert.equal(item.stylesheetCount, 1, `${context}: stylesheet`);
        assert.equal(item.tableCount, 5, `${context}: tables`);
        assert.equal(item.rowCount, 39, `${context}: rows`);
        assert.equal(item.entryCount, 56, `${context}: targets`);
        assert.equal(item.multiRows, 9, `${context}: multi rows`);
        assert(item.locales.every(value => value === locale), `${context}: locale label mapping`);
        assert.equal(item.documentOverflow, 0, `${context}: document overflow`);
        assert.equal(item.tableDisplay, compact ? "block" : "table", `${context}: table mode`);
        assert.equal(item.bodyDisplay, compact ? "block" : "table-row-group", `${context}: body mode`);
        assert.equal(item.rowDisplay, compact ? "grid" : "table-row", `${context}: row mode`);
        assert.equal(item.cellDisplay, compact ? "block" : "table-cell", `${context}: cell mode`);
        assert.equal(item.headerPosition, compact ? "absolute" : "static", `${context}: header mode`);
        if (width >= 992) {
          assert(item.columns.every(columns => columns[1] >= 145 && columns[2] >= 165 && Math.max(...columns) - Math.min(...columns) > 40),
            `${context}: content-weighted columns with useful first/later reading widths`);
          assert(item.columns[1][3] < item.columns[1][1] * .55,
            `${context}: Species dash-only notes should remain compact`);
        }
        if (compact) {
          assert(item.tableWidth <= item.articleWidth + 1, `${context}: table width`);
          assert(item.headerWidth <= 1.1, `${context}: header not visually hidden`);
          assert(item.firstLabel.includes(locale === "zh" ? "首次出现" : "First appears"), `${context}: visual labels`);
        } else {
          assert.equal(item.firstLabel, "none", `${context}: compact label leaked across breakpoint`);
        }
        assert.equal(item.phrase, "Check out the Bestial Alleys?", `${context}: exact code phrase`);
        assert.equal(item.phraseMarked, true, `${context}: exact phrase marker`);
        assert.equal(item.otherCodeMarked, false, `${context}: other choice code was changed`);
        if (width === 320) assert.equal(item.phraseWhiteSpace, "normal", `${context}: scoped wrap`);
        results.push({ engine, locale, width, mode: compact ? "compact" : "conventional", ...item });
        if (qaDir && [320, 459, 460].includes(width)) {
          await page.goto(route(locale, "codex-people-5")); await settle(page);
          await page.screenshot({ path: path.join(qaDir, `${engine.toLowerCase()}-${locale}-${width}.png`) });
        }
      }
    }
    assert.deepEqual(pageErrors, [], `${engine}: page errors`);
    for (const locale of locales) for (const pageName of ["memories", "equipment"]) {
      await page.goto(`${base}/${locale === "en" ? "en/" : ""}collectibles/${pageName}.html`);
      assert.equal(await page.locator("#kt-codex-responsive-style").count(), 0, `${engine}: unrelated stylesheet`);
      assert.equal(await page.locator("table.kt-codex-responsive-table").count(), 0, `${engine}: unrelated table`);
    }
  } finally { await page.close(); }
  return results;
}

async function inspectTarget(page, fragment, name, context) {
  const item = await page.evaluate(id => {
    const matches = [...document.querySelectorAll("[id]")].filter(node => node.id === id);
    const target = matches[0];
    if (!target) return { count: matches.length };
    const box = target.getBoundingClientRect();
    const header = document.getElementById("quarto-header").getBoundingClientRect();
    return { count: matches.length, text: target.textContent, tag: target.tagName,
      role: target.getAttribute("role"), tabindex: target.getAttribute("tabindex"),
      top: box.top, bottom: box.bottom, width: box.width, height: box.height,
      headerBottom: header.bottom, viewport: innerHeight,
      scrollMargin: parseFloat(getComputedStyle(target).scrollMarginTop),
      background: getComputedStyle(target).backgroundColor,
      row: target.closest("tr")?.sectionRowIndex, category: target.closest("section.level2")?.id,
      cells: target.closest("tr")?.cells.length };
  }, fragment);
  assert.equal(new URL(page.url()).hash, `#${fragment}`, `${context}: hash`);
  assert.equal(item.count, 1, `${context}: unique target`);
  assert.equal(item.text, name, `${context}: identifiable name`);
  assert.equal(item.tag, "SPAN", `${context}: target tag`);
  assert.equal(item.role, null, `${context}: unexpected role`);
  assert.equal(item.tabindex, null, `${context}: extra focus stop`);
  assert.equal(item.cells, 4, `${context}: original row cells`);
  assert(item.width > 0 && item.height > 0, `${context}: invisible target`);
  assert(item.top >= Math.max(0, item.headerBottom) - 3 && item.top < item.viewport &&
    item.bottom > Math.max(0, item.headerBottom), `${context}: occluded target ${JSON.stringify(item)}`);
  assert(item.scrollMargin >= 75, `${context}: scroll margin`);
  assert.notEqual(item.background, "rgba(0, 0, 0, 0)", `${context}: target highlight`);
  return item;
}

async function fragmentSweep(browser, engine, full) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const result = { engine, full, checked: 0, byWidth: {}, multiGroups: [] };
  try {
    for (const width of full ? [320, 390] : [320, 459, 460]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of locales) {
        const items = full ? codex[locale] : codex[locale].filter(record =>
          ["codex-people-3", "codex-people-9", "codex-species-2", "codex-magic-4", "codex-history-3", "codex-world-1"].includes(record.href.split("#")[1]));
        for (const record of items) {
          const fragment = record.href.split("#")[1];
          await page.goto(route(locale, fragment)); await settle(page);
          await inspectTarget(page, fragment, record.section.split(" · ").at(-1), `${engine} ${width} ${locale} ${fragment}`);
          result.checked++;
        }
        result.byWidth[`${width}-${locale}`] = items.length;
      }
    }
    await page.goto(route("en"));
    const groups = await page.locator("table.kt-codex-responsive-table tbody tr").evaluateAll(rows =>
      rows.map(row => [...row.cells[0].querySelectorAll(".kt-codex-entry")].map(span => span.id)).filter(ids => ids.length > 1));
    assert.equal(groups.length, 9, `${engine}: multi-entry groups`);
    if (full) {
      const swept = new Set(codex.en.map(record => record.href.split("#")[1]));
      assert(groups.every(group => group.every(id => swept.has(id))), `${engine}: multi-entry sweep coverage`);
    }
    result.multiGroups = groups;
  } finally { await page.close(); }
  return result;
}

async function searchCase(page, locale, query, objectID) {
  await page.goto(`${base}/${locale === "en" ? "en/" : ""}`);
  await page.locator("#kt-search-launcher").click();
  await page.locator("#kt-search-input").fill(query);
  const expected = core.search(prepared[locale], query, { limit: 24 });
  const index = expected.findIndex(item => item.objectID === objectID);
  assert(index >= 0, `${locale} ${query}: missing search result`);
  const record = expected[index];
  const fragment = record.href.split("#")[1];
  const link = page.locator("a.kt-search-result").nth(index);
  await link.waitFor();
  const href = new URL(await link.getAttribute("href"), base);
  assert.equal(href.hash, `#${fragment}`);
  assert.equal(href.searchParams.get("q"), query);
  await link.click(); await page.waitForLoadState("load"); await settle(page);
  await inspectTarget(page, fragment, record.section.split(" · ").at(-1), `${locale} search ${query}`);
  assert.equal(new URL(page.url()).searchParams.get("q"), query);
  assert(await page.locator(`#${fragment} mark.kt-search-mark`).count() > 0, `${locale} ${query}: name highlight`);
  return { locale, query, fragment };
}

async function switchLanguage(page, other, fragment) {
  const link = page.locator("nav.navbar ul.navbar-nav.ms-auto a.nav-link");
  await page.waitForFunction(expected =>
    document.querySelector("nav.navbar ul.navbar-nav.ms-auto a.nav-link")?.href === expected,
    route(other, fragment));
  // isVisible does not test a translated fixed header's viewport position.
  await page.evaluate(() => window.scrollBy(0, -180));
  await page.waitForFunction(() => document.getElementById("quarto-header").getBoundingClientRect().top >= -1);
  if (!(await link.isVisible())) {
    await page.locator("button.navbar-toggler").click();
    await page.waitForFunction(() => document.body.classList.contains("kt-global-nav-open"));
  }
  await link.click(); await page.waitForURL(route(other, fragment)); await settle(page);
  const record = codex[other].find(item => item.href.endsWith(`#${fragment}`));
  await inspectTarget(page, fragment, record.section.split(" · ").at(-1), `${other} language switch`);
}

async function interactions(browser, engine) {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  const result = { engine, searches: [], switches: 0, history: 0, category: false };
  try {
    for (const locale of locales) for (const [query, objectID] of searchCases)
      result.searches.push(await searchCase(page, locale, query, objectID));
    for (const locale of locales) {
      const other = locale === "zh" ? "en" : "zh";
      await page.goto(route(locale, "codex-species-2"));
      await switchLanguage(page, other, "codex-species-2");
      result.switches++;
    }
    for (const locale of locales) {
      await page.goto(route(locale, "codex-species-2"));
      await page.goto(route(locale, "codex-species-3"));
      await page.goBack(); await settle(page);
      assert.equal(new URL(page.url()).hash, "#codex-species-2");
      await page.goForward(); await settle(page);
      assert.equal(new URL(page.url()).hash, "#codex-species-3");
      result.history++;
    }
    await page.goto(route("zh"));
    await page.locator('a[href$="#codex-species"]').first().click();
    assert.equal(new URL(page.url()).hash, "#codex-species");
    result.category = true;
  } finally { await page.close(); }
  return result;
}

async function accessibility(browser, engine) {
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  const outcomes = [];
  try {
    for (const width of [320, 459, 460]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of locales) {
        await page.goto(route(locale, "codex-species-2"));
        const roles = { tables: await page.getByRole("table").count(), rows: await page.getByRole("row").count(),
          headers: await page.getByRole("columnheader").count(), cells: await page.getByRole("cell").count() };
        assert.deepEqual(roles, { tables: 5, rows: 44, headers: 20, cells: 156 }, `${engine} ${locale} ${width}: table semantics`);
        assert.equal(await page.locator(".kt-codex-entry").count(), 56);
        const stops = await page.locator(".kt-codex-entry[tabindex], .kt-codex-entry[role]").count();
        assert.equal(stops, 0, `${engine} ${locale} ${width}: target focus stops`);
        const firstTable = page.locator("table.kt-codex-responsive-table").first();
        const headerSnapshot = await firstTable.locator("thead").ariaSnapshot();
        const rowSnapshot = await firstTable.locator("tbody tr").first().ariaSnapshot();
        const multiSnapshot = await page.locator("#codex-species-2").locator("xpath=parent::td").ariaSnapshot();
        assert(headerSnapshot.includes(locale === "zh" ? "首次出现" : "First appears"), `${engine} ${locale} ${width}: header name`);
        assert(multiSnapshot.includes("Bovolian"), `${engine} ${locale} ${width}: multi-entry name`);
        const link = page.locator("#codex-people-5").locator("xpath=ancestor::tr").locator("td:nth-child(4) a[href]").first();
        await link.focus();
        assert.equal(await link.evaluate(node => document.activeElement === node), true, `${engine} ${locale} ${width}: note link focus`);
        outcomes.push({ engine, locale, width, roles, stops, headerSnapshot, rowSnapshot, multiSnapshot });
      }
    }
  } finally { await page.close(); }
  return outcomes;
}

async function runEngine(engine, browser, full) {
  console.log(`${engine} ${browser.version()} starting`);
  const sizes = await geometry(browser, engine);
  console.log(`${engine}: geometry ${sizes.length} width/locale states PASS`);
  const fragments = await fragmentSweep(browser, engine, full);
  console.log(`${engine}: exact fragments ${fragments.checked} PASS`);
  const flows = await interactions(browser, engine);
  console.log(`${engine}: search ${flows.searches.length}, switch ${flows.switches}, history ${flows.history} PASS`);
  const semantics = await accessibility(browser, engine);
  console.log(`${engine}: semantics ${semantics.length} states PASS`);
  return { engine, version: browser.version(), sizes, fragments, flows, semantics };
}

async function main() {
  assert.equal(codex.zh.length, 56);
  assert.equal(codex.en.length, 56);
  assert.deepEqual(codex.zh.map(item => item.objectID), codex.en.map(item => item.objectID));
  if (qaDir) fs.mkdirSync(qaDir, { recursive: true });
  const results = [];
  const wb = await webkit.launch({ headless: true });
  try { results.push(await runEngine("WebKit", wb, true)); } finally { await wb.close(); }
  assert(fs.existsSync(edgeExecutable), "Installed Edge executable unavailable");
  const eb = await chromium.launch({ executablePath: edgeExecutable, headless: true });
  try { results.push(await runEngine("Edge", eb, false)); } finally { await eb.close(); }
  if (qaDir) fs.writeFileSync(path.join(qaDir, "codex-responsive-runtime.json"), JSON.stringify({ results }, null, 2) + "\n");
  console.log("Responsive Codex runtime: PASS engines=WebKit,Edge");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
