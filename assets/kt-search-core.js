"use strict";

// Pure retrieval over public search records. No page, network, or Quarto state.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KTSearchCore = api;
})(globalThis, function () {
  const FIELDS = ["section", "title", "text"];
  const WEIGHTS = { section: 50, title: 30, text: 10 };
  const QUESTION = "\uE000";

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\?{3}/g, QUESTION)
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/['’]s\b/g, "")
      .replace(/['’]/g, "")
      .replace(/[^\p{L}\p{N}\s\uE000]/gu, " ")
      .replaceAll(QUESTION, " ??? ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function aliasForms(vocabulary) {
    if (!vocabulary || !Array.isArray(vocabulary.groups)) throw new TypeError("Alias groups are required");
    const forms = [];
    const seen = new Set();
    for (const group of vocabulary.groups) {
      if (typeof group.id !== "string" || !Array.isArray(group.forms)) throw new TypeError("Invalid alias group");
      for (const raw of group.forms) {
        const form = normalize(raw);
        if (!form || seen.has(form)) throw new TypeError(`Duplicate or empty alias form: ${raw}`);
        seen.add(form);
        forms.push({ form, concept: group.id });
      }
    }
    return forms.sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form, "en"));
  }

  function latinNumber(character) {
    return /[a-z0-9]/.test(character || "");
  }

  function extract(value, forms) {
    const concepts = [];
    const rest = [];
    for (let position = 0; position < value.length;) {
      const match = forms.find(({ form }) => value.startsWith(form, position)
        && (!latinNumber(form[0]) || !latinNumber(value[position - 1]))
        && (!latinNumber(form[form.length - 1]) || !latinNumber(value[position + form.length])));
      if (match) {
        concepts.push(match.concept);
        rest.push(" ");
        position += match.form.length;
      } else {
        rest.push(value[position]);
        position++;
      }
    }
    return { concepts: [...new Set(concepts)], remainder: rest.join("") };
  }

  function tokens(value, locale, segmenter) {
    const result = [];
    for (const run of value.match(/\?\?\?|\p{Script=Han}+|[\p{L}\p{N}]+/gu) || []) {
      if (/^\p{Script=Han}+$/u.test(run) && segmenter) {
        for (const piece of segmenter.segment(run)) if (piece.isWordLike) result.push(piece.segment);
      } else result.push(run);
    }
    return [...new Set(result)];
  }

  function makeSegmenter(locale, options) {
    if (options && options.segmenter === false) return null;
    return typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(locale === "zh" ? "zh" : "en", { granularity: "word" }) : null;
  }

  function parseWith(query, forms, locale, segmenter) {
    const normalized = normalize(query);
    const extracted = extract(normalized, forms);
    return { normalized, concepts: extracted.concepts, tokens: tokens(extracted.remainder, locale, segmenter) };
  }

  function parseQuery(query, vocabulary, locale = "en", options = {}) {
    return parseWith(query, aliasForms(vocabulary), locale, makeSegmenter(locale, options));
  }

  function prepare(records, vocabulary, locale = "en", options = {}) {
    if (!Array.isArray(records)) throw new TypeError("Controlled records must be an array");
    const forms = aliasForms(vocabulary);
    const segmenter = makeSegmenter(locale, options);
    const items = records.map((record, order) => {
      const fields = {};
      const concepts = {};
      for (const field of FIELDS) {
        fields[field] = normalize(record[field]);
        concepts[field] = new Set(extract(fields[field], forms).concepts);
      }
      return { record, order, fields, concepts };
    });
    return { items, forms, locale, segmenter };
  }

  function hasToken(haystack, token) {
    if (token === "???") return haystack.split(" ").includes("???");
    if (/^[a-z0-9]+$/.test(token)) {
      let at = haystack.indexOf(token);
      while (at >= 0) {
        if (!latinNumber(haystack[at - 1]) && !latinNumber(haystack[at + token.length])) return true;
        at = haystack.indexOf(token, at + 1);
      }
      return false;
    }
    return haystack.includes(token);
  }

  function score(item, query) {
    let total = 0;
    for (const concept of query.concepts) {
      const field = FIELDS.find(name => item.concepts[name].has(concept));
      if (!field) return null;
      total += WEIGHTS[field];
    }
    for (const token of query.tokens) {
      const field = FIELDS.find(name => hasToken(item.fields[name], token));
      if (!field) return null;
      total += WEIGHTS[field];
    }
    if (query.normalized && query.concepts.length + query.tokens.length > 0) {
      if (item.fields.section === query.normalized) total += 100;
      else if (item.fields.section.includes(query.normalized)) total += 35;
      else if (item.fields.title === query.normalized) total += 80;
      else if (item.fields.title.includes(query.normalized)) total += 25;
      else if (item.fields.text.includes(query.normalized)) total += 10;
    }
    if (item.record.type === "page" && query.concepts.length + query.tokens.length === 1) total += 45;
    if ((item.record.type === "memory" || item.record.type === "codex") && item.fields.section.includes(query.normalized)) total += 10;
    return total;
  }

  function search(prepared, query, options = {}) {
    const parsed = parseWith(query, prepared.forms, prepared.locale, prepared.segmenter);
    if (parsed.concepts.length + parsed.tokens.length === 0) return [];
    const limit = options.limit === undefined ? 24 : options.limit;
    const matched = [];
    for (const item of prepared.items) {
      const value = score(item, parsed);
      if (value !== null) matched.push({ item, score: value });
    }
    matched.sort((a, b) => b.score - a.score || a.item.order - b.item.order || a.item.record.objectID.localeCompare(b.item.record.objectID, "en"));
    return matched.slice(0, limit).map(({ item, score: value }) => options.detailed ? { record: item.record, score: value } : item.record);
  }

  return { normalize, parseQuery, prepare, search };
});
