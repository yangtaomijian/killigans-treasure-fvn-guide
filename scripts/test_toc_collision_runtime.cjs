"use strict";

// The KT left rail must not be rolled up by Quarto's right-margin collision
// manager. Exercise actual page sections and a visible aside on every route.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const base = process.env.KT_BASE_URL || "http://127.0.0.1:49260";
const output = process.env.KT_SITE_OUTPUT || path.resolve(__dirname, "../_site");
const routes = fs.readdirSync(output, { recursive: true })
  .filter(p => p.endsWith(".html") && !p.includes("site_libs") && fs.readFileSync(path.join(output, p), "utf8").includes('id="TOC"'));

async function state(page) {
  return page.evaluate(() => {
    const panel = document.getElementById("kt-page-toc-panel");
    const toc = panel.querySelector("#TOC");
    const rect = panel.getBoundingClientRect();
    const style = getComputedStyle(toc);
    return {
      count: document.querySelectorAll("#TOC").length,
      nativeMenu: !!document.getElementById("quarto-toc-toggle"),
      opacity: style.opacity, pointerEvents: style.pointerEvents,
      display: style.display, top: rect.top, bottom: rect.bottom,
      width: rect.width, active: toc.querySelector("a.active")?.getAttribute("href"),
      duplicateIds: [...document.querySelectorAll("[id]")].filter(el =>
        !(["quarto-text-highlighting-styles", "quarto-bootstrap"].includes(el.id) && el.tagName === "LINK") && document.querySelectorAll(`[id="${CSS.escape(el.id)}"]`).length > 1).map(el => el.id)
    };
  });
}
function check(s, where) {
  assert.equal(s.count, 1, `${where}: duplicate TOC`);
  assert.equal(s.nativeMenu, false, `${where}: native rollup menu`);
  assert.equal(s.opacity, "1", `${where}: invisible TOC`);
  assert.notEqual(s.pointerEvents, "none", `${where}: disabled TOC`);
  assert.notEqual(s.display, "none", `${where}: hidden TOC`);
  assert.deepEqual(s.duplicateIds, [], `${where}: duplicated IDs`);
}

async function run(name, type, options) {
  const browser = await type.launch({ headless: true, ...options });
  let sections = 0, drawers = 0;
  try {
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme });
      await page.addInitScript(() => {
        // Register before Quarto captures its conflict elements on DOM ready.
        document.addEventListener("DOMContentLoaded", () => {
          const aside = document.createElement("aside");
          aside.id = "kt-toc-collision-fixture";
          aside.style.cssText = "display:none;position:fixed;top:120px;right:10px;width:10px;height:300px";
          document.body.append(aside);
        }, { once: true });
      });
      for (const route of routes) {
        await page.goto(`${base}/${route}`);
        await page.waitForTimeout(150);
        const targets = await page.locator("#TOC a[data-scroll-target]").evaluateAll(links => links.map(a => a.getAttribute("data-scroll-target")));
        for (const hash of targets) {
          await page.evaluate(hash => document.getElementById(decodeURIComponent(hash.slice(1))).scrollIntoView(), hash);
          await page.waitForTimeout(80);
          check(await state(page), `${name}/${colorScheme}/${route}/${hash}`);
          sections++;
        }
        // A fixed aside is a native right-margin conflict regardless of which
        // page happens to have a floating action or annotation today.
        await page.evaluate(() => {
          document.getElementById("kt-toc-collision-fixture").style.display = "block";
          window.scrollBy(0, -40);
        });
        await page.waitForTimeout(180);
        const s = await state(page);
        check(s, `${name}/${colorScheme}/${route}/aside`);
        assert(s.top >= 0 && s.top < 160 && s.bottom <= 910, `${route}: sticky rail bounds`);
        await page.evaluate(() => document.getElementById("kt-toc-collision-fixture").remove());

        // The native scrollspy and exact anchor navigation still own #TOC.
        const link = page.locator("#TOC > ul > li > a[data-scroll-target]").first();
        const hash = await link.getAttribute("data-scroll-target");
        await link.click();
        await page.waitForTimeout(180);
        assert.equal(decodeURIComponent(new URL(page.url()).hash), decodeURIComponent(hash), `${route}: fragment navigation`);
        check(await state(page), `${route}/link`);
        await page.waitForFunction(hash => [...document.querySelectorAll("#TOC a.active")].some(a => a.getAttribute("data-scroll-target") === hash), hash);
        assert(await link.evaluate(a => a.classList.contains("active")), `${route}: scrollspy`);
        await page.reload();
        await page.waitForTimeout(180);
        check(await state(page), `${route}/reload`);

        // Check the shared mobile drawer on every route at the same location.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator("#kt-page-toc-trigger").click();
        await page.waitForTimeout(100);
        check(await state(page), `${route}/drawer`);
        assert(await page.locator("#kt-page-toc-trigger").getAttribute("aria-expanded") === "true");
        assert(await page.evaluate(() => document.getElementById("quarto-document-content").inert));
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#kt-page-toc-trigger").getAttribute("aria-expanded"), "false");
        assert(await page.evaluate(() => document.activeElement.id === "kt-page-toc-trigger"));
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(100);
        check(await state(page), `${route}/desktop-return`);
        drawers++;
      }
      await page.close();
    }
    console.log(`${name}: PASS routes=${routes.length} themes=2 sections=${sections} drawers=${drawers}; aside collisions, exact links, scrollspy, reload, Escape and breakpoint return`);
  } finally { await browser.close(); }
}
(async () => {
  await run("Edge", chromium, { executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" });
  await run("WebKit", webkit, process.env.KT_WEBKIT_EXECUTABLE ? { executablePath: process.env.KT_WEBKIT_EXECUTABLE } : {});
})().catch(error => { console.error(error); process.exitCode = 1; });
