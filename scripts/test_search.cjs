"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../assets/kt-search-core.js");

const site = path.resolve(__dirname, "..");
const read = file => JSON.parse(fs.readFileSync(path.join(site, file), "utf8"));
const aliases = read("scripts/search_aliases.json");
const corpus = read("scripts/search_cases.json");
const records = {
  zh: read("_site/kt-search.json"),
  en: read("_site/en/kt-search.json"),
};
const browserLike = {};
vm.runInNewContext(fs.readFileSync(path.join(site, "assets/kt-search-core.js"), "utf8"), browserLike);
assert.equal(typeof browserLike.KTSearchCore.search, "function");
const prepared = Object.fromEntries(Object.entries(records).map(([locale, rows]) => [locale, core.prepare(rows, aliases, locale)]));

assert.equal(core.normalize("  ＡＲＩＳ，  Day   7  "), "aris day 7");
assert.equal(core.normalize("I’ll top"), core.normalize("I'll top"));
assert.equal(core.normalize("Sure, why not."), core.normalize("Sure why not"));
assert.equal(core.normalize("???"), "???");
assert.deepEqual(core.parseQuery("??? Memories", aliases, "en").tokens, ["???", "memories"]);
assert.deepEqual(core.parseQuery("Redroot Wilds", aliases, "en").concepts, ["region:redroot-wilds"]);
assert.deepEqual(core.parseQuery("红根镇荒野", aliases, "zh").concepts, ["region:redroot-wilds"]);
assert.deepEqual(core.parseQuery("Redroot", aliases, "en").concepts, ["region:redroot"]);
assert.deepEqual(core.parseQuery("红根镇", aliases, "zh").concepts, ["region:redroot"]);
const mixed = core.parseQuery("红根镇荒野Codex", aliases, "zh");
assert.deepEqual(mixed.concepts, ["region:redroot-wilds"]);
assert.deepEqual(mixed.tokens, ["codex"]);
const fallback = core.parseQuery("未知汉字串Macsen", aliases, "zh", { segmenter: false });
assert.deepEqual(fallback.tokens, ["未知汉字串", "macsen"]);
const fallbackPool = core.prepare(records.zh, aliases, "zh", { segmenter: false });
assert(core.search(fallbackPool, "Macsen").length > 0);
assert.equal(core.search(fallbackPool, "未知汉字串Macsen").length, 0);
assert.deepEqual(core.search(prepared.en, "  "), []);

const categories = {};
const pairs = new Map();
const caseIds = new Set();
let checked = 0;
for (const test of corpus.cases) {
  assert.equal(typeof test.id, "string");
  assert(!caseIds.has(test.id), `duplicate case ${test.id}`);
  caseIds.add(test.id);
  assert(["zh", "en"].includes(test.locale), test.id);
  assert.equal(typeof test.query, "string", test.id);
  assert.equal(typeof test.category, "string", test.id);
  categories[test.category] = (categories[test.category] || 0) + 1;
  const pool = prepared[test.locale];
  const result = core.search(pool, test.query, { limit: records[test.locale].length });
  const ids = result.map(record => record.objectID);
  const context = `${test.id} (${test.locale}, ${JSON.stringify(test.query)})`;
  assert.deepEqual(result, core.search(pool, test.query, { limit: records[test.locale].length }), `nondeterministic ${context}`);
  assert(result.every(record => Object.keys(record).sort().join() === "href,objectID,section,text,title,type"), context);
  if (test.none) assert.equal(ids.length, 0, context);
  if (test.top) assert.equal(ids[0], test.top, `${context}: got ${ids.slice(0, 5).join(", ")}`);
  if (test.excludeTop) assert.notEqual(ids[0], test.excludeTop, context);
  if (test.within) assert(ids.slice(0, test.within.n).includes(test.within.id), `${context}: missing ${test.within.id} in ${ids.slice(0, test.within.n)}`);
  if (test.allWithin) for (const id of test.allWithin.ids) {
    assert(ids.slice(0, test.allWithin.n).includes(id), `${context}: missing ${id} in ${ids.slice(0, test.allWithin.n)}`);
  }
  if (test.pair) {
    const group = pairs.get(test.pair) || [];
    group.push({ locale: test.locale, expected: test.top || test.within?.id || test.allWithin?.ids.join("|") });
    pairs.set(test.pair, group);
  }
  checked++;
}

for (const [name, group] of pairs) {
  assert.equal(group.length, 2, `pair ${name} needs ZH and EN`);
  assert.deepEqual(group.map(value => value.locale).sort(), ["en", "zh"], name);
  assert.equal(group[0].expected, group[1].expected, `paired target mismatch: ${name}`);
}
for (const [locale, negative, parts] of [
  ["en", "Macsen Hydronetics", ["Macsen", "Hydronetics"]],
  ["en", "Spiceport Dreadstones", ["Spiceport", "Dreadstones"]],
  ["en", "Species Timeline", ["Species", "Timeline"]],
  ["zh", "蓝叶森林 Prologue", ["蓝叶森林", "Prologue"]],
]) {
  assert(parts.every(part => core.search(prepared[locale], part).length > 0), `AND premise missing: ${negative}`);
  assert.equal(core.search(prepared[locale], negative).length, 0, `OR leakage: ${negative}`);
}
const repeated = core.search(prepared.en, "Redroot Wilds Day 8 Memories", { limit: 30 });
assert(repeated.some(record => record.objectID === "memory:redroot-wilds-memories:4"));
assert(repeated.some(record => record.objectID === "memory:redroot-wilds-memories:5"));
const ranked = core.search(prepared.en, "People Macsen", { detailed: true });
assert(ranked.length > 0 && Number.isFinite(ranked[0].score));
assert.equal(ranked[0].record.objectID, "codex:codex-people:5");

for (let pass = 0; pass < 3; pass++) {
  for (const test of corpus.cases) {
    const a = core.search(prepared[test.locale], test.query, { limit: 246 }).map(record => record.objectID);
    const b = core.search(core.prepare(records[test.locale], aliases, test.locale), test.query, { limit: 246 }).map(record => record.objectID);
    assert.deepEqual(a, b, `reprepare determinism ${test.id} pass ${pass}`);
  }
}

console.log(`Search core: PASS cases=${checked} categories=${JSON.stringify(categories)}`);
console.log(`Bilingual paired cases=${pairs.size} failures=0; AND, alias, fallback, literal ???, and 3 reprepare passes PASS`);
