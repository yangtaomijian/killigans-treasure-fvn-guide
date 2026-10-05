"use strict";

// Run against the assembled local site with Playwright available on NODE_PATH.
const assert = require("node:assert/strict");
const { webkit, chromium } = require("playwright");

const base = process.env.KT_BASE_URL || "http://127.0.0.1:18775";
const edgeExecutable = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const routes = ["index", "help", "guide/redroot", "guide/aris",
  "guide/crystal-plains-shieldfall", "guide/spiceport", "guide/blueleaf-grove",
  "reference/relationships", "reference/personality", "reference/combat", "collectibles/memories",
  "collectibles/equipment", "collectibles/dressing-room", "collectibles/codex"];
const widths = [1440, 1280, 1024, 991, 820, 768, 767, 600, 575, 520, 480, 430, 390, 375, 353, 352, 351, 320];
const ordinary = "#quarto-document-content table.table:not(.kt-memory-responsive-table):not(.kt-codex-responsive-table)";
const three = `${ordinary}:has(> thead > tr > th:nth-child(3):last-child)`;
const url = (locale, route) => `${base}/${locale === "en" ? "en/" : ""}${route}.html`;

async function measure(page) {
  return page.evaluate(selector => {
    const article = document.querySelector("main.content").getBoundingClientRect();
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      articleWidth: article.width,
      tables: [...document.querySelectorAll(selector)].map(table => {
        const box = table.getBoundingClientRect();
        const first = table.tBodies[0].rows[0].cells[0];
        const style = getComputedStyle(first);
        const rows = [...table.tBodies[0].rows];
        const heights = rows.map(row => row.getBoundingClientRect().height).sort((a, b) => a - b);
        const timingCells = rows.map(row => row.cells[1])
          .filter(cell => ["一格", "两格", "结束下午", "One slot", "Two slots"].includes(cell.textContent));
        return {
          recordMode: !!table.closest('.kt-record-mode'),
          recordLabels: [...table.querySelectorAll('tbody td .kt-record-label')].map(n=>({
            display:getComputedStyle(n).display,text:n.textContent,hidden:n.getAttribute('aria-hidden'),
            inline:n.parentElement.matches('.kt-record-category,.kt-record-cost') ||
              (!!n.closest('.kt-inline-category') && n.parentElement.cellIndex===1)
          })),
          recordLabelCount: table.querySelectorAll('tbody td .kt-record-label').length,
          expectedLabelCount: rows.length * table.tHead.rows[0].cells.length,
          headerClip: getComputedStyle(table.tHead).clipPath,
          primePlan: table.matches("#prime-attire > section.level3:first-of-type > table.table"),
          compactStock: rows[0].cells[0].textContent.includes("Old-Fashioned Vest"),
          compactGifts: rows[0].cells[1].textContent.includes("Focusing Wriststrap"),
          activitySchedule: table.matches("section:has(> p > #spiceport-day5) + section > .kt-travel-schedule > table.table"),
          timingLines: timingCells.map(cell => {
            const range = document.createRange();
            range.selectNodeContents(cell);
            return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size;
          }),
          columns: table.tHead.rows[0].cells.length,
          width: box.width,
          containerWidth: table.parentElement.getBoundingClientRect().width,
          height: box.height,
          localOverflow: Math.max(0, box.right - article.right),
          medianRowHeight: heights[Math.floor(heights.length / 2)] || 0,
          maxRowHeight: heights.at(-1) || 0,
          firstWidth: first.getBoundingClientRect().width,
          secondWidth: rows[0].cells[1].getBoundingClientRect().width,
          thirdWidth: rows[0].cells[2]?.getBoundingClientRect().width || 0,
          headerHeight: table.tHead.getBoundingClientRect().height,
          headerWidth: table.tHead.getBoundingClientRect().width,
          tableBorderStyle: getComputedStyle(table).borderTopStyle,
          tableRadius: parseFloat(getComputedStyle(table).borderTopLeftRadius),
          headerBackground: getComputedStyle(table.tHead.rows[0].cells[0]).backgroundColor,
          headerRule: getComputedStyle(table.tHead.rows[0].cells[0]).borderBottomColor,
          headerFirstWidth: table.tHead.rows[0].cells[0].getBoundingClientRect().width,
          headerSecondWidth: table.tHead.rows[0].cells[1].getBoundingClientRect().width,
          headerThirdWidth: table.tHead.rows[0].cells[2]?.getBoundingClientRect().width || 0,
          wrap: style.overflowWrap,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          verticalAlign: style.verticalAlign,
          tableDisplay: getComputedStyle(table).display,
          headerDisplay: getComputedStyle(table.tHead).display,
          headerRowDisplay: getComputedStyle(table.tHead.rows[0]).display,
          rowDisplay: getComputedStyle(table.tBodies[0].rows[0]).display,
          cellDisplay: style.display,
          colgroupDisplay: table.querySelector("colgroup") ? getComputedStyle(table.querySelector("colgroup")).display : null,
          foragemealRow: rows.find(row => row.cells[0].textContent.includes("Foragemeal"))?.getBoundingClientRect().height || 0,
          clutchmatesRow: rows.find(row => row.cells[0].textContent.includes("clutchmates"))?.getBoundingClientRect().height || 0,
          residentialRow: rows.find(row => row.cells[0].textContent.includes("Residential Streets nursery"))?.getBoundingClientRect().height || 0,
        };
      }),
    };
  }, ordinary);
}

async function semantics(page) {
  const tables = page.locator(ordinary);
  const result = [];
  for (let i = 0; i < await tables.count(); i++) {
    const table = tables.nth(i);
    result.push({
      rows: await table.getByRole("row").count(),
      headers: await table.getByRole("columnheader").count(),
      cells: await table.getByRole("cell").count(),
      links: await table.getByRole("link").count(),
      focusable: await table.locator("a[href],button,input,[tabindex]:not([tabindex='-1'])").count(),
      text: await table.locator("th,td").allTextContents(),
      aria: await table.ariaSnapshot(),
    });
  }
  return result;
}

async function codeStyles(page) {
  return page.locator(`${ordinary} code`).evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return { text: node.textContent, display: style.display, whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap, wordBreak: style.wordBreak,
      color: style.color, background: style.backgroundColor };
  }));
}

async function specialized(page, selector) {
  const tables = page.locator(selector);
  return {
    count: await tables.count(),
    headers: await tables.getByRole("columnheader").count(),
    cells: await tables.getByRole("cell").count(),
    display: await tables.first().evaluate(node => getComputedStyle(node).display),
    rowDisplay: await tables.first().locator("tbody tr").first().evaluate(node => getComputedStyle(node).display),
    targetIds: await tables.locator("[id]").evaluateAll(nodes => nodes.map(node => node.id)),
    heights: await tables.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height)),
  };
}

async function run(engine, launcher, options = {}) {
  const browser = await launcher.launch({ headless: true, ...options });
  const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
  const totals = { states: 0, tables: 0, three: 0, rows: 0, headers: 0, cells: 0, links: 0, code: 0, focus: 0 };
  const examples = {};
  try {
    for (const locale of ["zh", "en"]) {
      for (const route of routes) {
        await page.goto(url(locale, route));
        // Cover tables inside disclosures as well as always-visible tables.
        await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
        await page.setViewportSize({ width: 353, height: 800 });
        const semantic353 = await semantics(page);
        const tableRoles353 = await page.getByRole("table").count();
        const threeCount = await page.locator(three).count();
        // Automatic Equipment is now four columns (Stats added); the Prime
        // planning and Supplies helper tables remain exactly three columns.
        assert.equal(threeCount, ["collectibles/equipment","guide/spiceport"].includes(route) ? 2 : ["collectibles/dressing-room","reference/combat"].includes(route) ? 1 : 0,
          `${engine} ${locale} ${route}: exactly-three-column inventory`);
        if (route === 'collectibles/equipment') {
          assert.equal(await page.locator('.kt-equipment-completion table').count(),5);
          assert.equal(await page.locator('.kt-equipment-completion table thead tr th').count(),30);
          assert.equal(await page.locator('.kt-equipment-automatic table thead tr th').count(),4);
          assert.equal(await page.locator('.kt-equipment-automatic table tbody tr').count(),11);
        }
        if (route === 'help') {
          const baseline=page.locator('.kt-trailmarker-baselines table');
          assert.equal(await baseline.getByRole('columnheader').count(),5);
          assert.equal(await baseline.locator('tbody tr').count(),9);
          assert.deepEqual(await baseline.locator('tbody tr td:first-child').evaluateAll(cells=>cells.map(cell=>{
            const copy=cell.cloneNode(true);copy.querySelector('.kt-record-label')?.remove();return copy.textContent.trim();
          })),
            ['PROLOGUE','THE SPARK','THE LESSONS','THE BEASTSLAYER','THE PURSUIT','THE DREADSTONE','???','THE CATALYST','THE THRUST']);
        }
        if (route === 'collectibles/dressing-room') {
          assert.equal(semantic353.length,2);
          assert.deepEqual(semantic353.map(t=>t.headers),[3,2]);
          assert.deepEqual(semantic353.map(t=>t.rows),[14,5]);
        }
        totals.three += threeCount;
        await page.setViewportSize({ width: 352, height: 800 });
        assert.deepEqual(await semantics(page), semantic353, `${engine} ${locale} ${route}: 353/352 reading order and roles`);
        assert.equal(await page.getByRole("table").count(), tableRoles353,
          `${engine} ${locale} ${route}: 352 table roles`);
        await page.setViewportSize({ width: 320, height: 800 });
        assert.deepEqual(await semantics(page), semantic353, `${engine} ${locale} ${route}: 353/320 reading order and roles`);
        assert.equal(await page.getByRole("table").count(), tableRoles353,
          `${engine} ${locale} ${route}: 320 table roles`);
        totals.tables += semantic353.length;
        for (const item of semantic353) {
          totals.rows += item.rows;
          totals.headers += item.headers;
          totals.cells += item.cells;
          totals.links += item.links;
        }
        const codes = await codeStyles(page);
        totals.code += codes.length;
        if (codes.length) {
          await page.route("**/assets/kt-components.css", request => request.abort());
          await page.reload();
          await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
          assert.deepEqual(await codeStyles(page), codes, `${engine} ${locale} ${route}: exact-choice code styles`);
          await page.unroute("**/assets/kt-components.css");
          await page.reload();
          await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
        }
        for (const width of widths) {
          await page.setViewportSize({ width, height: 800 });
          await page.evaluate(async()=>{await window.ktAdaptiveTables.whenSettled()});
          const state = await measure(page);
          assert(state.documentWidth <= width, `${engine} ${locale} ${route} ${width}: document overflow`);
          for (const table of state.tables) {
            assert(table.localOverflow <= 0.5, `${engine} ${locale} ${route} ${width}: local table overflow`);
            if (table.recordMode) {
              assert.equal(table.tableDisplay,"block");assert.equal(table.rowDisplay,"block");assert.equal(table.cellDisplay,"block");
              assert.equal(table.recordLabelCount,table.expectedLabelCount);
              assert(table.recordLabels.every(x=>x.display===(x.inline ? "inline" : "block")&&x.text&&x.hidden==="true"),
                `${engine} ${locale} ${route} ${width}: visible labels follow the compact-field contract`);
              assert(Math.abs(table.width-table.containerWidth)<=.5,
                `${engine} ${locale} ${route} ${width}: record table fills its measured container`);
              assert(Math.abs(table.firstWidth-table.width)<=.5&&Math.abs(table.secondWidth-table.width)<=.5);
              if(table.columns>=3)assert(Math.abs(table.thirdWidth-table.width)<=.5);
              assert(table.headerHeight<=1.01&&table.headerWidth<=1.01);
              assert.equal(table.headerClip,"inset(50%)");
              if(table.colgroupDisplay!==null)assert.equal(table.colgroupDisplay,"none");
            } else if (table.primePlan && width <= 767) {
              assert.equal(table.tableDisplay, "block", `${engine} ${locale} ${route} ${width}: Prime plan hybrid table`);
              assert.equal(table.headerDisplay, "block");
              assert.equal(table.headerRowDisplay, "grid");
              assert.equal(table.rowDisplay, "grid");
              assert.equal(table.cellDisplay, "block");
              assert(Math.abs(table.width - state.articleWidth) <= 0.5);
              assert(Math.abs(table.firstWidth - table.width) <= 0.5);
              assert(table.secondWidth > table.thirdWidth * 1.65,
                `${engine} ${locale} ${route} ${width}: Prime instructions need room`);
              if (table.colgroupDisplay !== null) assert.equal(table.colgroupDisplay, "none");
            } else if (table.columns === 3 && width <= 352) {
              assert.equal(table.tableDisplay, "block", `${engine} ${locale} ${route} ${width}: hybrid table`);
              assert.equal(table.headerDisplay, "block", `${engine} ${locale} ${route} ${width}: visible hybrid header`);
              assert.equal(table.headerRowDisplay, "grid", `${engine} ${locale} ${route} ${width}: hybrid header row`);
              assert.equal(table.rowDisplay, "grid", `${engine} ${locale} ${route} ${width}: hybrid body row`);
              assert.equal(table.cellDisplay, "block", `${engine} ${locale} ${route} ${width}: hybrid cell`);
              assert(Math.abs(table.width - state.articleWidth) <= 0.5, `${engine} ${locale} ${route} ${width}: article fit`);
              assert(Math.abs(table.firstWidth - table.width) <= 0.5, `${engine} ${locale} ${route} ${width}: full-width identity`);
              assert(Math.abs(table.secondWidth - table.thirdWidth) <= 0.5,
                `${engine} ${locale} ${route} ${width}: equal detail columns`);
              assert(table.headerHeight > 0 && Math.abs(table.headerFirstWidth - table.width) <= 0.5,
                `${engine} ${locale} ${route} ${width}: visible full-width native header`);
              assert(Math.abs(table.headerSecondWidth - table.headerThirdWidth) <= 0.5,
                `${engine} ${locale} ${route} ${width}: equal native detail headers`);
              if (table.colgroupDisplay !== null) assert.equal(table.colgroupDisplay, "none");
            } else {
              assert.equal(table.tableDisplay, "table", `${engine} ${locale} ${route} ${width}: conventional table`);
              assert.equal(table.headerDisplay, "table-header-group", `${engine} ${locale} ${route} ${width}: conventional header`);
              assert.equal(table.headerRowDisplay, "table-row", `${engine} ${locale} ${route} ${width}: conventional header row`);
              assert.equal(table.rowDisplay, "table-row", `${engine} ${locale} ${route} ${width}: conventional body row`);
              assert.equal(table.cellDisplay, "table-cell", `${engine} ${locale} ${route} ${width}: conventional cell`);
            }
            if (width >= 992) {
              if (route === "guide/spiceport") {
                assert(table.thirdWidth > table.firstWidth && table.thirdWidth > table.secondWidth,
                  `${engine} ${locale} ${route} ${width}: schedule description should have the majority`);
                assert(table.timingLines.every(lines => lines === 1),
                  `${engine} ${locale} ${route} ${width}: normal time values should stay on one line`);
                if (table.activitySchedule) assert(table.firstWidth > table.secondWidth * 1.5,
                  `${engine} ${locale} ${route} ${width}: activity should have more room than time`);
              }
              if (table.compactStock || table.compactGifts) {
                assert(table.width < state.articleWidth - 40,
                  `${engine} ${locale} ${route} ${width}: short table should shrink to its content`);
              }
              if (table.primePlan) {
                assert(table.secondWidth > table.firstWidth * 3 && table.secondWidth > table.thirdWidth,
                  `${engine} ${locale} ${route} ${width}: schedule instructions need natural column room`);
              }
              assert(parseFloat(table.paddingLeft) >= 10.5 && parseFloat(table.paddingLeft) <= 10.8);
              assert.equal(table.tableBorderStyle, "solid");
              assert(table.tableRadius >= 6 && table.tableRadius <= 8);
              assert.equal(table.headerBackground, "rgb(242, 239, 232)");
              assert.equal(table.headerRule, "rgb(183, 174, 160)");
            } else {
              if(table.recordMode)assert.equal(parseFloat(table.paddingLeft),0);
              else assert(parseFloat(table.paddingLeft) >= 6 && parseFloat(table.paddingLeft) <= 6.5);
            }
            assert.equal(table.paddingRight, table.paddingLeft);
            assert.equal(table.verticalAlign, "top");
            assert.equal(table.wrap, table.recordMode ? "anywhere" : "normal", `${engine} ${locale} ${route} ${width}: no emergency word break`);
          }
          if (route === "collectibles/equipment" && [430, 390, 375, 352, 351, 320].includes(width)) {
            examples[`${locale}-equipment-${width}`] = state;
          }
          if (route === "guide/spiceport" && [390, 375, 352, 351, 320].includes(width)) {
            examples[`${locale}-spiceport-${width}`] = state;
          }
          totals.states++;
        }
        if (["guide/aris", "collectibles/memories"].includes(route)) {
          for (const width of [320, 352, 390]) {
            await page.setViewportSize({ width, height: 800 });
            const link = page.locator(`${ordinary} a[href]`).first();
            await link.focus();
            const focus = await link.evaluate(node => ({ active: document.activeElement === node,
              outline: parseFloat(getComputedStyle(node).outlineWidth),
              decoration: getComputedStyle(node).textDecorationLine }));
            assert(focus.active && focus.outline >= 2 && focus.decoration.includes("underline"),
              `${engine} ${locale} ${route} ${width}: table link focus`);
            totals.focus++;
          }
        }
      }
      for (const [route, width, selector, count, headers, cells] of [
        ["collectibles/memories", 575, "table.kt-memory-responsive-table", 11, 33, 261],
        ["collectibles/memories", 576, "table.kt-memory-responsive-table", 11, 33, 261],
        ["collectibles/codex", 459, "table.kt-codex-responsive-table", 5, 20, 156],
        ["collectibles/codex", 460, "table.kt-codex-responsive-table", 5, 20, 156],
      ]) {
        await page.goto(url(locale, route));
        await page.setViewportSize({ width, height: 800 });
        const state = await specialized(page, selector);
        assert.equal(state.count, count);
        assert.equal(state.headers, headers);
        assert.equal(state.cells, cells);
        assert.equal(state.display, width === 575 || width === 459 ? "block" : "table");
        assert.equal(state.rowDisplay, width === 575 || width === 459 ? "grid" : "table-row");
        assert(state.targetIds.length > 0 && state.targetIds.length === new Set(state.targetIds).size,
          `${engine} ${locale} ${route} ${width}: stable target identities`);
        assert(state.heights.every(height => height > 0), `${engine} ${locale} ${route} ${width}: table geometry`);
      }
    }
    // Per locale: +1 Help table (10 rows/5 headers/45 cells), Equipment
    // +6 headers/+46 cells, and one fewer three-column table.
    // Also account exactly for the pre-existing Personality table in the inventory
    // (+1 table/9 rows/2 headers/16 cells/4 choices per locale), without editing it.
    assert.deepEqual(totals, { states: 504, tables: 46, three: 12, rows: 318, headers: 154, cells: 990,
      links: 64, code: 82, focus: 12 }, `${engine}: ordinary table inventory`);
    // Check actual text containment at 320px; row heights depend on content.
    for (const locale of ["zh","en"]) for (const route of ["collectibles/equipment","guide/spiceport","reference/combat"]) {
      await page.setViewportSize({width:320,height:800}); await page.goto(url(locale,route));
      await page.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
      await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(100);
      const clipped = await page.locator(`${ordinary} tbody td`).evaluateAll(cells=>cells.flatMap(cell=>{
        const box=cell.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(cell);
        return [...range.getClientRects()].filter(r=>r.width>0 && r.height>0)
          .filter(r=>r.left<box.left-.8 || r.right>box.right+.8 || r.top<box.top-.8 || r.bottom>box.bottom+.8)
          .map(r=>({text:cell.textContent.slice(0,60),left:r.left,right:r.right,top:r.top,bottom:r.bottom,
            box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom}}));
      }));
      assert.deepEqual(clipped,[],`${engine} ${locale} ${route}: every narrow-table field fits its cell`);
    }
    console.log(`${engine}: PASS ${JSON.stringify(totals)}; Equipment/Spiceport 320 heights=${[
      examples["zh-equipment-320"].tables.at(-1).height,
      examples["en-equipment-320"].tables.at(-1).height,
      examples["zh-spiceport-320"].tables.at(-1).height,
      examples["en-spiceport-320"].tables.at(-1).height].join("/")}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await run("WebKit", webkit);
  await run("Edge", chromium, { executablePath: edgeExecutable });
})().catch(error => { console.error(error); process.exitCode = 1; });
