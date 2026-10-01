"use strict";

// Run against an already built, locally served _site/ with an installed
// Playwright package supplied through Node's normal module resolution.
// KT_BASE_URL and KT_PREFIX_URL are local HTTP origins, not production URLs.
const fs = require("node:fs");
const path = require("node:path");
const { webkit } = require("playwright");

const site = path.resolve(__dirname, "..");
const base = process.env.KT_BASE_URL || "http://127.0.0.1:8765";
const prefixed = process.env.KT_PREFIX_URL || "http://127.0.0.1:8766/kt-test";
const routes = [
  "index", "help",
  "guide/redroot", "guide/aris", "guide/crystal-plains-shieldfall",
  "guide/spiceport", "guide/blueleaf-grove",
  "reference/relationships", "reference/personality",
  "collectibles/memories", "collectibles/equipment", "collectibles/dressing-room", "collectibles/codex",
];
const anchors = Object.fromEntries(routes.map(route => [route,
  [...fs.readFileSync(path.join(site, `${route}.md`), "utf8").matchAll(/<a\s+id=["']([^"']+)["']\s*><\/a>/g)].map(match => match[1]),
]));
const failures = [];
const counts = { directZH: 0, directEN: 0, pageZH: 0, pageEN: 0, fragment: 0, query: 0, history: 0, refresh: 0, prefix: 0 };
const switchSelector = "nav.navbar ul.navbar-nav.ms-auto a.nav-link";

function record(ok, category, description) {
  if (!ok) failures.push({ category, description });
}

function expectedPath(route, english, root = "") {
  const relative = route === "index" ? "" : `${route}.html`;
  return `${root}/${english ? "en/" : ""}${relative}`;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function state(page) {
  return page.evaluate(selector => {
    const link = document.querySelector(selector);
    return {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      href: link?.href || null,
      controls: [...document.querySelectorAll("nav.navbar a")].filter(node => ["EN", "中文"].includes(node.textContent.trim())).length,
      title: document.title,
    };
  }, switchSelector);
}

function assertState(actual, wanted, category, label) {
  for (const [key, value] of Object.entries(wanted)) {
    record(actual[key] === value, category, `${label}: ${key}=${JSON.stringify(actual[key])}, expected ${JSON.stringify(value)}`);
  }
}

async function targetState(page, anchor) {
  return page.evaluate(id => {
    const matches = [...document.querySelectorAll("[id]")].filter(node => node.id === id);
    const element = matches[0];
    if (!element) return { count: 0 };
    let hidden = false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.inert || node.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden") hidden = true;
    }
    const rect = element.getBoundingClientRect();
    return {
      count: matches.length,
      hidden,
      top: rect.top,
      viewport: innerHeight,
      nearViewport: rect.top >= -160 && rect.top <= innerHeight + 100,
    };
  }, anchor);
}

async function inspectAnchor(page, anchor, category, label) {
  const actual = await state(page);
  const target = await targetState(page, anchor);
  record(actual.hash === `#${anchor}`, category, `${label}: hash ${actual.hash} != #${anchor}`);
  record(target.count === 1, category, `${label}: target count ${target.count}`);
  record(target.hidden === false, category, `${label}: target hidden`);
  record(target.nearViewport === true, category, `${label}: native scroll top=${target.top}, viewport=${target.viewport}`);
}

async function switchLocale(page, wanted, category, label) {
  const before = await state(page);
  record(before.controls === 1, category, `${label}: ${before.controls} controls before switch`);
  await page.locator(switchSelector).click();
  await page.waitForLoadState("load");
  await settle(page);
  const after = await state(page);
  assertState(after, { pathname: wanted.pathname, search: wanted.search || "", hash: wanted.hash || "", controls: 1 }, category, label);
  record(after.title.length > 0, category, `${label}: destination did not load a title`);
  record(!after.pathname.includes("/en/en/"), category, `${label}: double en path`);
  return after;
}

async function runCase(category, label, action) {
  try {
    await action();
  } catch (error) {
    failures.push({ category, description: `${label}: ${error.message}` });
  }
}

async function main() {
  const browser = await webkit.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const engine = { name: "WebKit", version: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent) };
  try {
    for (const english of [false, true]) {
      const category = english ? "direct-EN" : "direct-ZH";
      for (const route of routes) {
        for (const anchor of anchors[route]) {
          await runCase(category, `${route}#${anchor}`, async () => {
            await page.goto(`${base}${expectedPath(route, english)}#${anchor}`, { waitUntil: "load" });
            await settle(page);
            await inspectAnchor(page, anchor, category, `${route}#${anchor}`);
            counts[english ? "directEN" : "directZH"]++;
          });
        }
      }
    }
    console.log(`DIRECT_SWEEP ZH=${counts.directZH} EN=${counts.directEN} failures=${failures.length}`);

    for (const english of [false, true]) {
      for (const route of routes) {
        await runCase("page-switch", `${english ? "EN" : "ZH"} ${route}`, async () => {
          await page.goto(`${base}${expectedPath(route, english)}`, { waitUntil: "load" });
          await switchLocale(page, { pathname: expectedPath(route, !english) }, "page-switch", route);
          counts[english ? "pageEN" : "pageZH"]++;
        });
      }
    }
    console.log(`PAGE_MATRIX ZH_TO_EN=${counts.pageZH} EN_TO_ZH=${counts.pageEN} failures=${failures.length}`);

    for (const route of routes) {
      const available = anchors[route];
      if (!available.length) continue;
      const chosen = new Set([available[0], available[Math.floor(available.length / 2)], available.at(-1)]);
      if (route === "collectibles/codex") {
        chosen.add("codex-clutchmates");
        chosen.add("codex-aris-tax");
      }
      for (const anchor of chosen) {
        for (const english of [false, true]) {
          await runCase("fragment-switch", `${route}#${anchor} ${english ? "EN" : "ZH"}`, async () => {
            await page.goto(`${base}${expectedPath(route, english)}#${anchor}`, { waitUntil: "load" });
            await switchLocale(page, { pathname: expectedPath(route, !english), hash: `#${anchor}` }, "fragment-switch", `${route}#${anchor}`);
            await inspectAnchor(page, anchor, "fragment-switch", `${route}#${anchor}`);
            counts.fragment++;
          });
        }
      }
    }
    console.log(`FRAGMENT_SWITCH cases=${counts.fragment} failures=${failures.length}`);

    const queryCases = [
      { route: "guide/redroot", english: false, search: "?kt_test=1", hash: "" },
      { route: "reference/relationships", english: true, search: "?kt_test=1&x=2", hash: "#" + anchors["reference/relationships"][0] },
      { route: "collectibles/codex", english: false, search: "?kt_test=%E6%B5%8B%E8%AF%95&x=a%20b", hash: "#codex-clutchmates" },
      { route: "collectibles/memories", english: true, search: "?x=%2F&kt_test=2", hash: "" },
    ];
    for (const item of queryCases) {
      await runCase("query-switch", item.route, async () => {
        await page.goto(`${base}${expectedPath(item.route, item.english)}${item.search}${item.hash}`, { waitUntil: "load" });
        const before = await state(page);
        await switchLocale(page, { pathname: expectedPath(item.route, !item.english), search: before.search, hash: before.hash }, "query-switch", item.route);
        counts.query++;
      });
    }

    const redroot = anchors["guide/redroot"];
    await runCase("history-A", "fragment then switch", async () => {
      await page.goto(`${base}/guide/redroot.html`, { waitUntil: "load" });
      await page.goto(`${base}/guide/redroot.html#${redroot[0]}`);
      await switchLocale(page, { pathname: "/en/guide/redroot.html", hash: `#${redroot[0]}` }, "history-A", "switch");
      await page.goBack();
      assertState(await state(page), { pathname: "/guide/redroot.html", search: "", hash: `#${redroot[0]}` }, "history-A", "Back");
      await page.goForward();
      assertState(await state(page), { pathname: "/en/guide/redroot.html", search: "", hash: `#${redroot[0]}` }, "history-A", "Forward");
      counts.history++;
    });
    await runCase("history-B", "two fragments then switch", async () => {
      await page.goto(`${base}/guide/redroot.html#${redroot[0]}`, { waitUntil: "load" });
      await page.goto(`${base}/guide/redroot.html#${redroot[1]}`);
      await switchLocale(page, { pathname: "/en/guide/redroot.html", hash: `#${redroot[1]}` }, "history-B", "switch");
      for (const [direction, wanted] of [
        ["back", ["/guide/redroot.html", `#${redroot[1]}`]],
        ["back", ["/guide/redroot.html", `#${redroot[0]}`]],
        ["forward", ["/guide/redroot.html", `#${redroot[1]}`]],
        ["forward", ["/en/guide/redroot.html", `#${redroot[1]}`]],
      ]) {
        await (direction === "back" ? page.goBack() : page.goForward());
        assertState(await state(page), { pathname: wanted[0], search: "", hash: wanted[1] }, "history-B", direction);
      }
      counts.history++;
    });
    const memories = anchors["collectibles/memories"];
    await runCase("history-C", "reverse locale", async () => {
      await page.goto(`${base}/en/collectibles/memories.html?kt_test=history`, { waitUntil: "load" });
      await page.goto(`${base}/en/collectibles/memories.html?kt_test=history#${memories[0]}`);
      await switchLocale(page, { pathname: "/collectibles/memories.html", search: "?kt_test=history", hash: `#${memories[0]}` }, "history-C", "switch");
      await page.goBack();
      assertState(await state(page), { pathname: "/en/collectibles/memories.html", search: "?kt_test=history", hash: `#${memories[0]}` }, "history-C", "Back");
      await page.goForward();
      assertState(await state(page), { pathname: "/collectibles/memories.html", search: "?kt_test=history", hash: `#${memories[0]}` }, "history-C", "Forward");
      counts.history++;
    });
    await runCase("history-D", "homepages", async () => {
      await page.goto(`${base}/`, { waitUntil: "load" });
      await switchLocale(page, { pathname: "/en/" }, "history-D", "switch");
      await page.goBack();
      assertState(await state(page), { pathname: "/", search: "", hash: "" }, "history-D", "Back");
      await page.goForward();
      assertState(await state(page), { pathname: "/en/", search: "", hash: "" }, "history-D", "Forward");
      counts.history++;
    });
    console.log(`QUERY cases=${counts.query} HISTORY sequences=${counts.history} failures=${failures.length}`);

    await runCase("href-refresh", "hashchange and popstate", async () => {
      await page.goto(`${base}/guide/redroot.html`, { waitUntil: "load" });
      const target = hash => `${base}/en/guide/redroot.html${hash}`;
      record((await state(page)).href === target(""), "href-refresh", "initial href");
      await page.goto(`${base}/guide/redroot.html#${redroot[0]}`);
      record((await state(page)).href === target(`#${redroot[0]}`), "href-refresh", "anchor A href");
      await page.goto(`${base}/guide/redroot.html#${redroot[1]}`);
      record((await state(page)).href === target(`#${redroot[1]}`), "href-refresh", "anchor B href");
      await page.goBack();
      record((await state(page)).href === target(`#${redroot[0]}`), "href-refresh", "Back to A href");
      counts.refresh++;
    });

    await runCase("prefix", "prefixed route and fragment", async () => {
      const anchor = redroot[0];
      await page.goto(`${prefixed}/guide/redroot.html#${anchor}`, { waitUntil: "load" });
      await switchLocale(page, { pathname: "/kt-test/en/guide/redroot.html", hash: `#${anchor}` }, "prefix", "ZH to EN");
      await inspectAnchor(page, anchor, "prefix", "EN target");
      await switchLocale(page, { pathname: "/kt-test/guide/redroot.html", hash: `#${anchor}` }, "prefix", "EN to ZH");
      await inspectAnchor(page, anchor, "prefix", "ZH target");
      counts.prefix++;
    });
    console.log(`HREF_REFRESH cases=${counts.refresh} PREFIX cases=${counts.prefix} failures=${failures.length}`);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ engine, origin: base, prefixOrigin: prefixed, counts, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
