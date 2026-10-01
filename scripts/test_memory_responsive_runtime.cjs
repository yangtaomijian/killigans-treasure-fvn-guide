"use strict";

// Run against the assembled local site. WebKit sweeps every narrow row target;
// the installed system Edge, when present, receives the geometry and interaction checks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const core = require("../assets/kt-search-core.js");

const site = path.resolve(__dirname, "..");
const base = process.env.KT_BASE_URL || "http://127.0.0.1:8775";
const qaDir = process.env.KT_QA_DIR;
const widths = [1440, 1280, 1024, 575, 576, 430, 390, 375, 320, 600, 768, 820];
const locales = ["zh", "en"];
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const aliases = JSON.parse(fs.readFileSync(path.join(site, "scripts/search_aliases.json"), "utf8"));
const records = Object.fromEntries(locales.map(locale => [locale,
  JSON.parse(fs.readFileSync(path.join(site, `_site/${locale === "en" ? "en/" : ""}kt-search.json`), "utf8"))
]));
const prepared = Object.fromEntries(locales.map(locale => [locale, core.prepare(records[locale], aliases, locale)]));
const memories = Object.fromEntries(locales.map(locale => [locale, records[locale].filter(record => record.type === "memory")]));
const expectedTableHeights = {
  575: { zh: 6928, en: 7718 }, 576: { zh: 7334, en: 8532 },
  430: { zh: 7718, en: 8738 }, 390: { zh: 8254, en: 9682 },
  375: { zh: 8500, en: 10000 }, 320: { zh: 9554, en: 11186 },
  // The single-column shell gives the conventional table more width here.
  600: { zh: 6620, en: 8482 }, 768: { zh: 5780, en: 6620 },
  820: { zh: 5610, en: 6450 },
};

function route(locale, fragment = "", query = "") {
  return `${base}/${locale === "en" ? "en/" : ""}collectibles/memories.html${query ? `?q=${encodeURIComponent(query)}` : ""}${fragment ? `#${fragment}` : ""}`;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function inspectRow(page, fragment, label) {
  const detail = await page.evaluate(id => {
    const row = document.getElementById(id);
    if (!row) return { missing: true };
    const box = row.getBoundingClientRect();
    const header = document.getElementById("quarto-header").getBoundingClientRect();
    const current = document.querySelector('#kt-memory-locator a[aria-current="location"]');
    return { id: row.id, tag: row.tagName, cellCount: row.cells.length,
      category: row.dataset.memoryCategory, tableClass: row.closest("table")?.classList.contains("kt-memory-responsive-table"),
      display: getComputedStyle(row).display, scrollMargin: parseFloat(getComputedStyle(row).scrollMarginTop),
      top: box.top, bottom: box.bottom, width: box.width, height: box.height,
      headerBottom: header.bottom, viewport: innerHeight,
      current: current ? new URL(current.href).hash : "" };
  }, fragment);
  assert.equal(new URL(page.url()).hash, `#${fragment}`, `${label}: hash`);
  assert.equal(detail.id, fragment, `${label}: exact target`);
  assert.equal(detail.tag, "TR", `${label}: target tag`);
  assert.equal(detail.cellCount, 3, `${label}: cell count`);
  assert.equal(detail.tableClass, true, `${label}: Memory table scope`);
  assert.equal(detail.display, "grid", `${label}: compact layout`);
  assert(detail.scrollMargin >= 75, `${label}: scroll margin`);
  assert(detail.width > 0 && detail.height > 0, `${label}: invisible row`);
  assert(detail.top >= Math.max(0, detail.headerBottom) - 3,
    `${label}: row hidden behind header ${JSON.stringify(detail)}`);
  assert(detail.top < detail.viewport && detail.bottom > Math.max(0, detail.headerBottom),
    `${label}: row outside viewport ${JSON.stringify(detail)}`);
  assert.equal(detail.current, `#${detail.category}`, `${label}: locator state`);
  return detail;
}

async function measure(page) {
  return page.evaluate(() => {
    const article = document.getElementById("quarto-document-content");
    const tables = [...article.querySelectorAll("table.kt-memory-responsive-table")];
    const rows = tables.flatMap(table => [...table.querySelectorAll('tr[id^="memory-"]')]);
    const heights = rows.map(row => row.getBoundingClientRect().height).sort((a, b) => a - b);
    const locator = document.getElementById("kt-memory-locator");
    const locatorBox = locator.getBoundingClientRect();
    const locatorLinks = [...locator.querySelectorAll("a[href]")];
    const first = tables[0];
    const head = first.querySelector("thead");
    const otherTables = [...article.querySelectorAll("table:not(.kt-memory-responsive-table)")];
    return {
      viewport: innerWidth, articleWidth: article.getBoundingClientRect().width,
      documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      tableCount: tables.length, otherTableCount: otherTables.length, rowCount: rows.length,
      rowIds: new Set(rows.map(row => row.id)).size,
      tableWidth: Math.max(...tables.map(table => table.getBoundingClientRect().width)),
      tableHeight: tables.reduce((sum, table) => sum + table.getBoundingClientRect().height, 0),
      rowMedian: heights[Math.floor(heights.length / 2)], rowMax: heights.at(-1),
      tableDisplay: getComputedStyle(first).display,
      bodyDisplay: getComputedStyle(first.tBodies[0]).display,
      rowDisplay: getComputedStyle(rows[0]).display,
      headerPosition: getComputedStyle(head).position,
      headerWidth: head.getBoundingClientRect().width,
      otherTableDisplays: otherTables.map(table => getComputedStyle(table).display),
      columns: tables.map(table => [...table.tHead.rows[0].cells].map(cell => cell.getBoundingClientRect().width)),
      shortTitleLines: [...article.querySelectorAll("table.kt-memory-responsive-table td:nth-child(2) code")]
        .filter(code => /^(Redroot Wilds|Aris|Crystal Plains|Shieldfall Vale|Spiceport City|Blueleaf Grove) Day \d+$/.test(code.textContent))
        .map(code => {
          const range = document.createRange();
          range.selectNodeContents(code);
          return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size;
        }),
      locator: { position: getComputedStyle(locator).position, left: locatorBox.left, right: locatorBox.right,
        count: locatorLinks.length, escapingLinks: locatorLinks.filter(link => link.getBoundingClientRect().right > locatorBox.right + 1).length },
      stylesheetCount: document.querySelectorAll("#kt-memory-responsive-style").length,
    };
  });
}

async function geometry(browser, engine) {
  const page = await browser.newPage({ viewport: { width: 575, height: 900 } });
  const results = [];
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of locales) {
        await page.goto(route(locale));
        await settle(page);
        const item = await measure(page);
        const narrow = width <= 575;
        assert.equal(item.stylesheetCount, 1, `${engine} ${width} ${locale}: stylesheet`);
        assert.equal(item.tableCount, 11, `${engine} ${width} ${locale}: table count`);
        assert.equal(item.rowCount, 87, `${engine} ${width} ${locale}: row count`);
        assert.equal(item.rowIds, 87, `${engine} ${width} ${locale}: row IDs`);
        assert.equal(item.documentOverflow, 0, `${engine} ${width} ${locale}: document overflow`);
        assert.equal(item.locator.count, 11);
        assert.equal(item.locator.position, "static");
        assert.equal(item.locator.escapingLinks, 0);
        assert(item.locator.left >= -1 && item.locator.right <= width + 1, `${engine} ${width} ${locale}: locator overflow`);
        assert.equal(item.tableDisplay, narrow ? "block" : "table", `${engine} ${width} ${locale}: table display`);
        assert.equal(item.rowDisplay, narrow ? "grid" : "table-row", `${engine} ${width} ${locale}: row display`);
        assert.equal(item.headerPosition, narrow ? "absolute" : "static", `${engine} ${width} ${locale}: header position`);
        if (narrow) assert(item.headerWidth <= 1.1, `${engine} ${width} ${locale}: header not visually hidden`);
        assert(item.otherTableDisplays.every(display => display === "table"), `${engine} ${width} ${locale}: unrelated table changed`);
        if (width >= 992) {
          assert(item.columns.every(([order, title, scene]) => order >= 45 && order <= 65 && title > order * 2 && scene > title),
            `${engine} ${width} ${locale}: narrow order and useful title/scene columns`);
          assert(item.shortTitleLines.length > 20 && item.shortTitleLines.every(lines => lines === 1),
            `${engine} ${width} ${locale}: native place/day titles should fit on one line`);
        } else {
          const expected = expectedTableHeights[width][locale];
          const tolerance = width === 375 ? 0.18 : 0.12;
          assert(Math.abs(item.tableHeight - expected) / expected < tolerance,
            `${engine} ${width} ${locale}: table height deviates from spike ${Math.round(item.tableHeight)} vs ${expected}`);
        }
        results.push({ engine, locale, width, ...item });
        if (qaDir && [575, 576, 390, 320].includes(width)) {
          await page.evaluate(() => {
            document.documentElement.style.scrollBehavior = "auto";
            const table = document.querySelector("table.kt-memory-responsive-table");
            scrollTo(0, table.getBoundingClientRect().top + scrollY - 88);
          });
          await page.screenshot({ path: path.join(qaDir, `${engine}-${locale}-${width}.png`) });
        }
      }
    }
    assert.deepEqual(pageErrors, [], `${engine}: page errors`);
  } finally {
    await page.close();
  }
  return results;
}

async function fragmentSweep(browser, engine, full) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const result = { engine, full, checked: 0, byWidth: {} };
  const representative = ["memory-redroot-memories-1", "memory-redroot-memories-3",
    "memory-aris-summit-memories-7", "memory-spiceport-memories-10", "memory-blueleaf-memories-4"];
  try {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const locale of locales) {
        const fragments = full ? memories[locale].map(record => record.href.split("#")[1]) : representative;
        for (const fragment of fragments) {
          await page.goto(route(locale, fragment), { waitUntil: "load" });
          await settle(page);
          await inspectRow(page, fragment, `${engine} ${width} ${locale} ${fragment}`);
          result.checked++;
        }
        result.byWidth[`${width}-${locale}`] = fragments.length;
      }
    }
  } finally {
    await page.close();
  }
  return result;
}

async function searchToRow(page, locale, query, objectID) {
  await page.goto(`${base}/${locale === "en" ? "en/" : ""}`);
  await page.locator("#kt-search-launcher").click();
  await page.locator("#kt-search-input").fill(query);
  const expected = core.search(prepared[locale], query, { limit: 24 });
  const index = expected.findIndex(item => item.objectID === objectID);
  assert(index >= 0, `${locale} ${query}: expected Memory missing from search results`);
  const link = page.locator("a.kt-search-result").nth(index);
  await link.waitFor();
  await link.click();
  await page.waitForLoadState("load");
  await settle(page);
  const fragment = expected[index].href.split("#")[1];
  await inspectRow(page, fragment, `${locale} search ${query}`);
  const outcome = await page.evaluate(id => {
    const row = document.getElementById(id);
    const marks = [...row.querySelectorAll("mark.kt-search-mark")];
    return { q: new URL(location.href).searchParams.get("q"), hash: location.hash,
      marks: marks.length, visibleMarks: marks.filter(mark => {
        const box = mark.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(mark).display !== "none";
      }).length };
  }, fragment);
  assert.equal(outcome.q, query);
  assert(outcome.marks > 0 && outcome.visibleMarks > 0, `${locale} ${query}: missing visible row highlight`);
  return outcome;
}

async function interactions(browser, engine) {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  const result = { engine, searches: [], switches: [], history: null, locator: null };
  try {
    for (const [locale, query, objectID] of [
      ["zh", "Prologue Memories", "memory:redroot-memories:1"],
      ["en", "Prologue Memories", "memory:redroot-memories:1"],
      ["zh", "单身图标", "memory:aris-summit-memories:7"],
      ["en", "Single Memories", "memory:aris-summit-memories:7"],
    ]) {
      result.searches.push({ locale, query, ...await searchToRow(page, locale, query, objectID) });
    }
    for (const locale of locales) {
      const other = locale === "zh" ? "en" : "zh";
      const fragment = "memory-spiceport-memories-10";
      await page.goto(route(locale, fragment));
      // Native fragment scrolling can unpin the Headroom header.
      // Reveal it with an ordinary upward scroll before testing its controls.
      await page.evaluate(() => window.scrollBy(0, -180));
      await page.waitForFunction(() => document.getElementById("quarto-header").getBoundingClientRect().top >= -1);
      await page.locator("button.navbar-toggler").click();
      await page.locator("nav.navbar ul.navbar-nav.ms-auto a.nav-link").click();
      await page.waitForLoadState("load");
      await settle(page);
      assert.equal(page.url(), route(other, fragment));
      await inspectRow(page, fragment, `${engine} ${locale} switch`);
      result.switches.push(`${locale}->${other}`);
    }
    await page.goto(route("zh", "memory-redroot-memories-3"));
    await settle(page);
    await page.goto(route("zh", "memory-blueleaf-memories-4"));
    await settle(page);
    await page.goBack();
    await settle(page);
    await inspectRow(page, "memory-redroot-memories-3", `${engine} history back`);
    await page.goForward();
    await settle(page);
    await inspectRow(page, "memory-blueleaf-memories-4", `${engine} history forward`);
    result.history = "row A -> row B -> Back -> Forward";

    await page.goto(route("zh"));
    await page.locator('#kt-memory-locator a[href$="#aris-memories"]').click();
    const active = await page.locator('#kt-memory-locator a[aria-current="location"]').evaluate(link => new URL(link.href).hash);
    assert.equal(new URL(page.url()).hash, "#aris-memories");
    assert.equal(active, "#aris-memories");
    result.locator = { hash: "#aris-memories", active };
  } finally {
    await page.close();
  }
  return result;
}

async function accessibility(browser, engine) {
  const page = await browser.newPage({ viewport: { width: 576, height: 900 } });
  const states = [];
  try {
    for (const width of [576, 575, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of locales) {
        await page.goto(route(locale));
        const table = page.locator("table.kt-memory-responsive-table").first();
        const snapshot = await table.ariaSnapshot();
        const roles = { tables: await page.getByRole("table").count(), rows: await page.getByRole("row").count(),
          headers: await page.getByRole("columnheader").count(), cells: await page.getByRole("cell").count() };
        assert(snapshot.startsWith("- table:"), `${engine} ${width} ${locale}: table role absent`);
        assert(snapshot.includes("- columnheader") && snapshot.includes("- cell"), `${engine} ${width} ${locale}: header/cell roles absent`);
        assert.equal(roles.tables, 12);
        assert.equal(roles.rows, 103);
        assert.equal(roles.headers, 35);
        assert.equal(roles.cells, 269);
        const first = page.locator('table.kt-memory-responsive-table td a[href]').first();
        await first.focus();
        const focus = await first.evaluate(link => {
          const style = getComputedStyle(link);
          const before = [...link.closest("tr").cells].map(cell => getComputedStyle(cell, "::before").content);
          const box = link.getBoundingClientRect();
          return { outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
            visible: box.width > 0 && box.height > 0, before };
        });
        assert(focus.outline !== "none" && focus.outlineWidth >= 1 && focus.visible,
          `${engine} ${width} ${locale}: in-cell focus invisible`);
        assert(focus.before.every(content => content === "none"), `${engine} ${width} ${locale}: duplicate field labels`);
        const next = await first.evaluate(link => {
          const links = [...document.querySelectorAll('table.kt-memory-responsive-table td a[href]')];
          const following = links[links.indexOf(link) + 1];
          return { firstTabIndex: link.tabIndex, followingTabIndex: following?.tabIndex,
            followingText: following?.textContent.trim() };
        });
        assert.equal(next.firstTabIndex, 0, `${engine} ${width} ${locale}: first link is not keyboard-focusable`);
        assert.equal(next.followingTabIndex, 0, `${engine} ${width} ${locale}: next link is not in ordinary tab order`);
        if (engine === "Edge") {
          await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => document.activeElement.tagName), "A",
            `${engine} ${width} ${locale}: ordinary Tab navigation`);
        }
        states.push({ engine, width, locale, roles, focus, next, snapshot: snapshot.slice(0, 850) });
      }
    }
  } finally {
    await page.close();
  }
  return states;
}

async function runEngine(engine, browser, fullFragments) {
  console.log(`${engine} ${browser.version()} starting`);
  const geometryResult = await geometry(browser, engine);
  console.log(`${engine} geometry ${geometryResult.length}/${widths.length * locales.length} PASS`);
  const fragments = await fragmentSweep(browser, engine, fullFragments);
  console.log(`${engine} fragments ${fragments.checked} PASS`);
  const flows = await interactions(browser, engine);
  console.log(`${engine} search/language/history/locator PASS`);
  const semantics = await accessibility(browser, engine);
  console.log(`${engine} automated semantics ${semantics.length}/6 PASS`);
  return { engine, version: browser.version(), geometry: geometryResult, fragments, flows, semantics };
}

async function main() {
  assert.equal(memories.zh.length, 87);
  assert.equal(memories.en.length, 87);
  assert.deepEqual(memories.zh.map(item => item.objectID), memories.en.map(item => item.objectID));
  if (qaDir) fs.mkdirSync(qaDir, { recursive: true });
  const results = [];
  const wb = await webkit.launch({ headless: true });
  try { results.push(await runEngine("WebKit", wb, true)); } finally { await wb.close(); }
  let edgeStatus = "unavailable";
  if (fs.existsSync(edgeExecutable)) {
    let eb;
    try {
      eb = await chromium.launch({ executablePath: edgeExecutable, headless: true });
    } catch (error) {
      edgeStatus = `launch failed: ${error.message}`;
      console.log(`Edge ${edgeStatus}`);
    }
    if (eb) {
      try { results.push(await runEngine("Edge", eb, false)); edgeStatus = "tested"; }
      finally { await eb.close(); }
    }
  } else {
    edgeStatus = "system executable not installed";
    console.log(`Edge ${edgeStatus}`);
  }
  if (qaDir) fs.writeFileSync(path.join(qaDir, "responsive-runtime.json"), JSON.stringify({ edgeStatus, results }, null, 2) + "\n");
  console.log(`Memory responsive runtime: PASS engines=${results.map(item => item.engine).join(",")} Edge=${edgeStatus}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
