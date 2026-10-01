"use strict";
const assert = require("node:assert/strict");
const { chromium, webkit } = require("playwright");
const base = process.env.KT_BASE_URL;
assert(base, "KT_BASE_URL required");
const key = "kt-global-nav-groups-v1";
const hamburger = ".navbar-toggler";
const groups = "#navbarCollapse .nav-item.dropdown > .dropdown-toggle";
async function expanded(page) {
  return page.locator(groups).evaluateAll(nodes => nodes.map(node => ({
    expanded: node.getAttribute("aria-expanded") === "true",
    toggle: node.classList.contains("show"), menu: node.nextElementSibling.classList.contains("show")
  })));
}
async function check(page, values, label) {
  assert.deepEqual(await expanded(page), values.map(value => ({ expanded: value, toggle: value, menu: value })), label);
}
async function open(page) { await page.locator(hamburger).click(); }
async function close(page) { await page.keyboard.press("Escape"); }
async function run(name, type, options) {
  const browser = await type.launch({ headless: true, ...options });
  let cases = 0;
  try {
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 874 }, colorScheme });
      await page.goto(`${base}/guide/aris.html`);
      await open(page);
      await check(page, [false, false, false], "first-use defaults");
      const location = page.url();
      const history = await page.evaluate(() => window.history.length);
      await page.locator(groups).nth(0).click();
      await page.locator(groups).nth(1).press(" ");
      await check(page, [true, true, false], "independent mouse/keyboard toggles");
      assert.equal(page.url(), location);
      assert.equal(await page.evaluate(() => window.history.length), history);
      await close(page);
      assert(await page.locator(hamburger).evaluate(node => node === document.activeElement));
      await open(page);
      await check(page, [true, true, false], "reopen");
      await page.locator(groups).nth(1).click();
      await page.locator("#kt-global-nav-close").click();
      await open(page);
      await check(page, [true, false, false], "explicit collapse retained");
      await page.locator("#kt-global-nav-backdrop").click({ position: { x: 380, y: 250 } });
      await open(page);
      await check(page, [true, false, false], "backdrop reopen");
      // Navigate through an actual drawer link; destination gets the preference.
      await Promise.all([
        page.waitForURL("**/guide/redroot.html"),
        page.locator("#navbarCollapse .dropdown-item[href$='guide/redroot.html']").click()
      ]);
      await open(page);
      await check(page, [true, false, false], "cross-page");
      await close(page);
      await page.reload();
      await open(page);
      await check(page, [true, false, false], "refresh");
      const prefs = await page.evaluate(key => localStorage.getItem(key), key);
      // Language link uses the same group directories in the other locale.
      await Promise.all([
        page.waitForURL("**/en/guide/redroot.html"),
        page.locator(".kt-language-utility").click()
      ]);
      await open(page);
      await check(page, [true, false, false], "ZH to EN");
      await page.locator(groups).nth(2).click();
      await page.setViewportSize({ width: 992, height: 900 });
      await page.waitForFunction(() => document.querySelector("#navbarCollapse .dropdown-toggle").getAttribute("data-bs-toggle") === "dropdown");
      await check(page, [false, false, false], "desktop cleanup");
      assert.equal(await page.locator("body.kt-global-nav-open").count(), 0);
      await page.locator(groups).nth(0).click();
      assert.equal(await page.locator(groups).nth(0).getAttribute("aria-expanded"), "true", "Bootstrap desktop dropdown");
      await page.locator("main.content h1").click();
      await page.setViewportSize({ width: 991, height: 900 });
      await page.waitForFunction(() => !document.querySelector("#navbarCollapse .dropdown-toggle").hasAttribute("data-bs-toggle"));
      await open(page);
      await check(page, [true, false, true], "mobile preference survived desktop dropdown");
      await close(page);
      await open(page);
      await page.locator("#kt-page-toc-trigger").click();
      assert.equal(await page.locator("body.kt-global-nav-open").count(), 0);
      await page.keyboard.press("Escape");
      await open(page);
      await check(page, [true, false, true], "page TOC handoff");
      await page.locator("#kt-search-launcher").click();
      await page.locator("#kt-search-input").fill("Macsen");
      await page.locator(".kt-search-result").first().waitFor();
      await page.keyboard.press("Escape");
      await open(page);
      await check(page, [true, false, true], "Search handoff");
      await close(page);
      assert(prefs, "preferences written");
      cases += 12;
      await page.close();
    }
    // Bad or unavailable storage must not prevent any drawer interaction.
    for (const mode of ["corrupt", "blocked"]) {
      const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
      await page.addInitScript(({ mode, key }) => {
        if (mode === "corrupt") localStorage.setItem(key, "{broken-json");
        else {
          Storage.prototype.getItem = () => { throw new DOMException("blocked", "SecurityError"); };
          Storage.prototype.setItem = () => { throw new DOMException("blocked", "SecurityError"); };
        }
      }, { mode, key });
      await page.goto(`${base}/index.html`);
      await open(page);
      await check(page, [false, false, false], `${mode}: defaults`);
      await page.locator(groups).nth(0).click();
      await close(page);
      await open(page);
      await check(page, [true, false, false], `${mode}: in-page fallback`);
      await close(page);
      assert.equal(await page.locator("#quarto-content").evaluate(node => node.inert), false);
      cases += 2;
      await page.close();
    }
    console.log(`${name}: PASS checks=${cases}; reopen, explicit collapse, pages, refresh, locale, Bootstrap desktop, 991/992, keyboard, TOC/Search, corrupt/blocked storage`);
  } finally { await browser.close(); }
}
(async () => {
  await run("Edge", chromium, { executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" });
  await run("WebKit", webkit, process.env.KT_WEBKIT_EXECUTABLE ? { executablePath: process.env.KT_WEBKIT_EXECUTABLE } : {});
})().catch(error => { console.error(error); process.exitCode = 1; });
