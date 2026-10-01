"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const include = fs.readFileSync(path.join(__dirname, "../assets/kt-language-switch.html"), "utf8");
const script = include.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script, "production mapping script exists");
const context = { URL };
vm.runInNewContext(script[1], context);
const map = context.ktMapLanguageUrl;
assert.equal(typeof map, "function");

const origin = "https://example.test";
const cases = [
  ["/", "/en/index.html", false, "/en/"],
  ["/index.html", "/en/index.html", false, "/en/"],
  ["/en/", "/index.html", true, "/"],
  ["/en/index.html", "/index.html", true, "/"],
  ["/guide/redroot.html", "/en/index.html", false, "/en/guide/redroot.html"],
  ["/en/guide/redroot.html", "/index.html", true, "/guide/redroot.html"],
  ["/en/reference/relationships.html", "/index.html", true, "/reference/relationships.html"],
  ["/collectibles/memories.html", "/en/index.html", false, "/en/collectibles/memories.html"],
  ["/guide/aris.html?foo=bar", "/en/index.html", false, "/en/guide/aris.html?foo=bar"],
  ["/collectibles/memories.html#foo", "/en/index.html", false, "/en/collectibles/memories.html#foo"],
  ["/en/reference/relationships.html?x=1#bar", "/index.html", true, "/reference/relationships.html?x=1#bar"],
  ["/prefix/guide/redroot.html?x=%2F#foo%20bar", "/prefix/en/index.html", false, "/prefix/en/guide/redroot.html?x=%2F#foo%20bar"],
  ["/prefix/en/collectibles/codex.html#codex-aris-tax", "/prefix/index.html", true, "/prefix/collectibles/codex.html#codex-aris-tax"],
  ["/prefix/guide/space%20name.html?raw=%2f#part%2Fone", "/prefix/en/index.html", false, "/prefix/en/guide/space%20name.html?raw=%2f#part%2Fone"],
];

for (const [current, fallback, fromEnglish, expected] of cases) {
  assert.equal(map(origin + current, origin + fallback, fromEnglish), origin + expected, current);
}
assert.equal(map(origin + "/elsewhere.html", origin + "/prefix/en/index.html", false), null);
console.log(`mapping regressions: ${cases.length} mirrored cases + out-of-root guard PASS`);
