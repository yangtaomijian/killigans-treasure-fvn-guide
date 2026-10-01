"use strict";

// Run after build.sh, with local servers for _site/ and a /kt-test/ symlink.
// Example: KT_BASE_URL=http://127.0.0.1:8767 KT_PREFIX_URL=http://127.0.0.1:8766/kt-test
// NODE_PATH=<installed Playwright module root> node scripts/test_search_runtime.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");
const core = require("../assets/kt-search-core.js");

const base = process.env.KT_BASE_URL || "http://127.0.0.1:8767";
const prefix = process.env.KT_PREFIX_URL || "http://127.0.0.1:8766/kt-test";
const site = path.resolve(__dirname, "..");
const json = file => JSON.parse(fs.readFileSync(path.join(site, file), "utf8"));
const aliases = json("scripts/search_aliases.json");
const pools = Object.fromEntries(["zh", "en"].map(locale => [locale,
  core.prepare(json(`_site/${locale === "en" ? "en/" : ""}kt-search.json`), aliases, locale)
]));
const cases = {
  zh: ["Memories", "Redroot Codex", "红根镇荒野 Codex", "Take it", "Redroot Wilds Day 8 Memories", "People Macsen", "???", "??? Memories", "Macsen Hydronetics", "Day 7 可选场景", "遇到陌生人的邀约后选"],
  en: ["Codex", "红根镇 Codex", "红根镇荒野 Codex", "Help treat him", "Redroot Wilds Day 8 Memories", "People Macsen", "???", "??? Memories", "Macsen Hydronetics", "Aris optional adult scene", "the stranger invites you"]
};

function urlFor(root, locale, record, query) {
  const url = new URL(`${locale === "en" ? "en/" : ""}${record.href}`, `${root}/`);
  url.searchParams.set("q", query);
  return url.href;
}

async function ready(page) {
  await page.waitForFunction(() => !document.getElementById("kt-search-status").textContent.includes("加载") &&
    !document.getElementById("kt-search-status").textContent.includes("Loading"));
}

async function open(page) {
  const launcher = page.locator("#kt-search-launcher");
  assert.equal(await launcher.count(), 1);
  assert(await launcher.isVisible());
  await launcher.click();
  assert(await page.locator("#kt-search-dialog").evaluate(node => node.open));
  assert.equal(await page.evaluate(() => document.activeElement.id), "kt-search-input");
}

async function query(page, root, locale, term) {
  await page.locator("#kt-search-input").fill(term);
  await ready(page);
  const expected = core.search(pools[locale], term, { limit: 24 });
  const actual = await page.locator(".kt-search-result").evaluateAll(nodes => nodes.map(node => node.href));
  assert.deepEqual(actual, expected.map(record => urlFor(root, locale, record, term)), `${locale}: ${term}`);
  assert(actual.length <= 24);
  if (!term.trim()) assert.equal(actual.length, 0);
  if (!expected.length && term.trim()) assert.match(await page.locator("#kt-search-status").textContent(), /没有找到|No results/);
  return expected;
}

async function navigateResult(page, root, locale, term, type) {
  await page.goto(`${root}/${locale === "en" ? "en/" : ""}`);
  await open(page);
  const expected = await query(page, root, locale, term);
  const position = expected.findIndex(item => item.type === type);
  assert(position >= 0, `${term}: no ${type} result`);
  const record = expected[position];
  await page.locator(".kt-search-result").nth(position).click();
  await page.waitForLoadState("load");
  const destination = new URL(urlFor(root, locale, record, term));
  assert.equal(new URL(page.url()).pathname, destination.pathname);
  assert.equal(new URL(page.url()).searchParams.get("q"), term);
  assert.equal(new URL(page.url()).hash, destination.hash);
  if (destination.hash) {
    const target = page.locator(`[id="${destination.hash.slice(1)}"]`);
    assert.equal(await target.count(), 1);
    const top = await target.evaluate(node => node.getBoundingClientRect().top);
    assert(top >= -160 && top <= 900, `${term}: fragment landing top ${top}`);
  }
  await page.waitForTimeout(150);
  return record;
}

async function engineRun(browserType) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const requests = [];
  const errors = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  try {
    for (const locale of ["zh", "en"]) {
      await page.goto(`${base}/${locale === "en" ? "en/" : ""}`);
      await open(page);
      await query(page, base, locale, " ");
      for (const term of cases[locale]) await query(page, base, locale, term);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#kt-search-dialog").evaluate(node => node.open), false);
      await open(page);
      await query(page, base, locale, "???");
      await page.locator("#kt-search-close").click();
      await open(page);
      await query(page, base, locale, "Memories");
      await page.locator("#kt-search-input").press("ArrowDown");
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains("kt-search-result")), true);
      await page.keyboard.press("ArrowDown");
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains("kt-search-result")), true);
      await page.keyboard.press("Escape");
      await open(page);
      await query(page, base, locale, "Memories");
      await page.locator("#kt-search-input").press("Enter");
      await page.waitForLoadState("load");
      assert.equal(new URL(page.url()).searchParams.get("q"), "Memories");
    }

    const pageRecord = await navigateResult(page, base, "en", "Memories", "page");
    assert.equal(pageRecord.href, "collectibles/memories.html");
    const sectionRecord = await navigateResult(page, base, "zh", "Day 7 可选场景", "section");
    assert.equal(sectionRecord.href, "guide/aris.html#aris-day7-tavern");
    assert.equal(await page.locator("details[open]").count(), 0);
    assert.equal(await page.locator("details mark.kt-search-mark").evaluateAll(nodes =>
      nodes.filter(node => !node.closest("summary")).length), 0);
    const memoryRecord = await navigateResult(page, base, "en", "Redroot Wilds Cabotte Killigan on top", "memory");
    assert(memoryRecord.href.includes("#memory-redroot-wilds-memories-4"));
    const codexRecord = await navigateResult(page, base, "en", "People Macsen", "codex");
    assert(codexRecord.href.includes("#codex-people"));
    assert(await page.locator("mark.kt-search-mark").count() > 0);
    const preservedHash = new URL(page.url()).hash;
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("mark.kt-search-mark").count(), 0);
    assert.equal(new URL(page.url()).searchParams.has("q"), false);
    assert.equal(new URL(page.url()).hash, preservedHash);
    await page.goBack();
    assert.equal(new URL(page.url()).pathname, "/en/");
    await page.goForward();
    assert.equal(new URL(page.url()).hash, preservedHash);
    assert.equal(new URL(page.url()).searchParams.has("q"), false);

    await navigateResult(page, base, "en", "??? Memories", "section");
    assert(await page.locator("mark.kt-search-mark").count() > 0);
    await page.locator("main h1").click();
    assert.equal(new URL(page.url()).searchParams.has("q"), false);
    assert.equal(await page.locator("mark.kt-search-mark").count(), 0);

    await navigateResult(page, base, "zh", "Redroot Wilds Codex", "codex");
    const beforeSwitch = new URL(page.url());
    await page.locator("nav.navbar ul.navbar-nav.ms-auto a.nav-link").click();
    await page.waitForLoadState("load");
    assert.equal(new URL(page.url()).search, beforeSwitch.search);
    assert.equal(new URL(page.url()).hash, beforeSwitch.hash);
    assert(new URL(page.url()).pathname.startsWith("/en/"));
    await navigateResult(page, base, "en", "红根镇 Codex", "codex");
    assert(await page.locator("mark.kt-search-mark").filter({ hasText: /Redroot/i }).count() > 0);
    await page.goto(`${base}/en/help.html?keep=1&q=not-in-page#help-menu`);
    await page.keyboard.press("Escape");
    assert.equal(new URL(page.url()).search, "?keep=1");
    assert.equal(new URL(page.url()).hash, "#help-menu");

    for (const width of [430, 390, 375, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(`${base}/`);
      await open(page);
      await query(page, base, "zh", "???");
      const sizes = await page.evaluate(() => {
        const dialog = document.getElementById("kt-search-dialog").getBoundingClientRect();
        const launcher = document.getElementById("kt-search-launcher").getBoundingClientRect();
        return { dialogLeft: dialog.left, dialogRight: dialog.right, launcherLeft: launcher.left,
          launcherRight: launcher.right, viewport: innerWidth, document: document.documentElement.scrollWidth };
      });
      assert(sizes.launcherLeft >= 0 && sizes.launcherRight <= width, `${width}: launcher outside viewport`);
      assert(sizes.dialogLeft >= 0 && sizes.dialogRight <= width, `${width}: dialog outside viewport`);
      assert(sizes.document <= width + 1, `${width}: search introduced page overflow ${sizes.document}`);
      await page.keyboard.press("Escape");
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    for (const locale of ["zh", "en"]) {
      await page.goto(`${prefix}/${locale === "en" ? "en/" : ""}`);
      await open(page);
      await query(page, prefix, locale, "??? Memories");
      await page.locator(".kt-search-result").first().click();
      await page.waitForLoadState("load");
      assert(new URL(page.url()).pathname.startsWith(`/kt-test/${locale === "en" ? "en/" : ""}`));
      assert(new URL(page.url()).hash);
    }

    for (const locale of ["zh", "en"]) {
      await page.goto(`${base}/${locale === "en" ? "en/" : ""}`);
      await page.route("**/kt-search.json", route => route.abort());
      await open(page);
      await page.locator("#kt-search-input").fill("Memories");
      await page.waitForFunction(() => /暂时不可用|temporarily unavailable/.test(document.getElementById("kt-search-status").textContent));
      assert.equal(await page.locator(".kt-search-result").count(), 0);
      await page.locator("#kt-search-close").click();
      await page.unroute("**/kt-search.json");
      await open(page);
      await query(page, base, locale, "Memories");
    }
    await page.goto(`${base}/`);
    await page.route("**/kt-search.json", async route => {
      const records = json("_site/kt-search.json");
      records.find(record => record.href === "collectibles/memories.html").title = '<img src=x onerror=alert(1)> Memories';
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(records) });
    });
    await open(page);
    await page.locator("#kt-search-input").fill("Memories");
    await page.locator(".kt-search-result").first().waitFor();
    assert.equal(await page.locator("#kt-search-results img").count(), 0);
    assert(await page.locator(".kt-search-result").filter({ hasText: "<img src=x" }).count() > 0);
    await page.unroute("**/kt-search.json");
    assert(!requests.some(url => /(?:^|\/)search\.json(?:\?|$)/.test(url)), "native search index requested");
    assert.deepEqual(errors, []);
    console.log(`${browserType.name()}: PASS queries=22 mobile=4 prefix=2 navigation=4 failure-retry=2 escaped-index=1`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await engineRun(webkit);
  if (fs.existsSync(chromium.executablePath())) await engineRun(chromium);
  else console.log("Chromium: not installed; WebKit runtime coverage used");
})().catch(error => { console.error(error); process.exitCode = 1; });
