#!/usr/bin/env python3
"""Verify controlled locators and aliases against assembled public HTML."""

from collections import Counter
import json
from pathlib import Path, PurePosixPath
import re
from urllib.parse import unquote, urlsplit

from verify_navigation import Document, label
from memory_identity import memory_identity
from codex_identity import codex_identity


SITE = Path(__file__).resolve().parents[1]
OUTPUT = SITE / "_site"
FIELDS = {"objectID", "href", "title", "section", "text", "type"}
TYPES = {"page", "section", "memory", "codex", "equipment", "outfit"}
LIMITS = {"ZH": 120, "EN": 220}  # Visible characters; builder chooses a complete clause or a short fallback.
PRIVATE_PARTS = {"research", "private-inputs", "runtime", "archive", "editorial"}
PRIVATE_SUFFIXES = {".md", ".csv", ".zip", ".save", ".persistent", ".rpy", ".rpyc", ".py", ".sh"}
PRIVATE_MARKERS = ("KT-v0.57a-", "../research/", "private-inputs/", "canonical/", "../kt-guide/")
EVIDENCE = {"public-displayed", "terminology-policy", "public-bilingual-equivalent"}


def fail(message):
    raise ValueError(message)


def clean(value):
    return re.sub(r"\s+", " ", value).strip()


def html_document(path, cache):
    if path not in cache:
        document = Document()
        document.feed(path.read_text(encoding="utf-8"))
        cache[path] = document
    return cache[path]


def public_main_text(cache):
    text = []
    for locale in ("", "en/"):
        for path in sorted((OUTPUT / locale).rglob("*.html")):
            rel = path.relative_to(OUTPUT)
            if rel.as_posix() == "404.html" or "site_libs" in rel.parts or (not locale and rel.parts[0] == "en"):
                continue
            document = html_document(path, cache)
            main = next((node for node in document.root.walk() if node.tag == "main" and node.attrs.get("id") == "quarto-document-content"), None)
            if main is None:
                fail(f"Public main missing: {rel}")
            text.append(label(main).casefold())
    return " ".join(text)


def check_aliases(cache):
    path = SITE / "scripts/search_aliases.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) != {"groups"} or not isinstance(data["groups"], list):
        fail("Alias vocabulary must contain only a groups array")
    visible = public_main_text(cache)
    # E02 removes search-task phrasing from prose. These two query forms map
    # to canonical, still-visible Aris optional-equipment wording; retrieval
    # is asserted by test_equipment_queries.cjs, without reinserting the query.
    query_only = {'equipment:missing-boots': {'缺少 boots', 'missing boots'}}
    concepts = set()
    surfaces = {}
    for group in data["groups"]:
        if not isinstance(group, dict) or set(group) != {"id", "forms", "evidence"}:
            fail("Malformed alias group")
        concept, forms, evidence = group["id"], group["forms"], group["evidence"]
        if not isinstance(concept, str) or not re.fullmatch(r"[a-z0-9]+:[a-z0-9-]+", concept) or concept in concepts:
            fail(f"Malformed or duplicate alias concept: {concept}")
        if evidence not in EVIDENCE or not isinstance(forms, list) or len(forms) < 2:
            fail(f"Malformed alias forms/evidence: {concept}")
        concepts.add(concept)
        for form in forms:
            if not isinstance(form, str) or not form or form != clean(form):
                fail(f"Malformed alias form: {concept}")
            surface = clean(form).casefold()
            if surface in surfaces:
                fail(f"Duplicate or conflicting alias surface {form!r}: {surfaces[surface]} / {concept}")
            if surface not in visible and surface not in query_only.get(concept, set()):
                fail(f"Alias form absent from rendered public main text: {form}")
            surfaces[surface] = concept
    missing_boots = next(g for g in data['groups'] if g['id'] == 'equipment:missing-boots')
    assert {'Aris 的可选装备', 'Aris optional equipment'} <= set(missing_boots['forms'])
    assert all(f.casefold() in visible for f in ('Aris 的可选装备', 'Aris optional equipment'))
    return len(concepts), len(surfaces), Counter(group["evidence"] for group in data["groups"])


def check_record(record, locale, root, cache):
    if not isinstance(record, dict) or set(record) != FIELDS or any(not isinstance(value, str) for value in record.values()):
        fail(f"{locale}: record has invalid exact string schema")
    if record["type"] not in TYPES or not record["objectID"] or not record["href"] or not record["title"] or not record["text"]:
        fail(f"{locale}: invalid record type or missing value: {record['objectID']}")
    if len(record["text"]) > LIMITS[locale]:
        fail(f"{locale}: preview exceeds {LIMITS[locale]}: {record['objectID']}")
    for field, value in record.items():
        if re.search(r"<\s*/?\s*[A-Za-z][^>]*>", value):
            fail(f"{locale}: HTML in {field}: {record['objectID']}")
        if any(marker.casefold() in value.casefold() for marker in PRIVATE_MARKERS):
            fail(f"{locale}: private marker in {field}: {record['objectID']}")
        if re.search(r"\b[^\s/<>]+\.(?:md|csv|zip|save|persistent|rpyc?|py|sh)\b", value, re.IGNORECASE):
            fail(f"{locale}: source filename in {field}: {record['objectID']}")
    parsed = urlsplit(record["href"])
    path = unquote(parsed.path)
    parts = PurePosixPath(path).parts
    if parsed.scheme or parsed.netloc or parsed.query or path.startswith("/") or ".." in parts or path.endswith(".md") or not path.endswith(".html"):
        fail(f"{locale}: invalid public href: {record['href']}")
    if PRIVATE_PARTS & set(parts) or any(path.lower().endswith(suffix) for suffix in PRIVATE_SUFFIXES):
        fail(f"{locale}: private href: {record['href']}")
    target = (root / path).resolve()
    if not target.is_relative_to(root.resolve()) or not target.is_file():
        fail(f"{locale}: broken public href: {record['href']}")
    fragment = unquote(parsed.fragment)
    if not fragment:
        if record["type"] in {"memory", "codex", "outfit"}:
            fail(f"{locale}: collection record lacks exact entry fragment: {record['href']}")
        return "page-root"
    document = html_document(target, cache)
    ids = {node.attrs["id"] for node in document.root.walk() if "id" in node.attrs}
    if fragment not in ids:
        fail(f"{locale}: missing DOM fragment: {record['href']}")
    explicit = {node.attrs["id"] for node in document.root.walk() if node.tag == "a" and "id" in node.attrs}
    if record["type"] == "memory":
        parts = record["objectID"].split(":")
        if len(parts) != 3 or fragment != memory_identity(parts[1], parts[2])[1]:
            fail(f"{locale}: Memory href does not match public identity: {record['href']}")
        matches = [node for node in document.root.walk() if node.tag == "tr" and node.attrs.get("id") == fragment]
        if len(matches) != 1:
            fail(f"{locale}: Memory href is not an exact row: {record['href']}")
        return "memory-row"
    if record["type"] == "codex":
        parts = record["objectID"].split(":")
        if len(parts) != 3 or not parts[2].isdigit() or fragment != codex_identity(parts[1], int(parts[2]))[1]:
            fail(f"{locale}: Codex href does not match public identity: {record['href']}")
        matches = [node for node in document.root.walk() if node.tag == "span" and node.attrs.get("id") == fragment]
        if len(matches) != 1 or "kt-codex-entry" not in matches[0].attrs.get("class", "").split():
            fail(f"{locale}: Codex href is not an exact entry target: {record['href']}")
        return "codex-entry"
    if record['type'] == 'outfit':
        items = json.loads((OUTPUT / 'assets/kt-dressing-room.json').read_text())['items']
        expected = {f"outfit:{i['character']}:{i['category']}:{i['visibleValue']}": i['anchor'] for i in items}
        if expected.get(record['objectID']) != fragment:
            fail(f"{locale}: Outfit href does not match native identity")
        return 'outfit-entry'
    return "stable-explicit" if fragment in explicit else "generated"


def check_disclosure(records, locale, root, cache):
    document = html_document(root / "guide/aris.html", cache)
    bodies = []
    for disclosure in (node for node in document.root.walk() if node.tag == "details"):
        body = clean(" ".join(label(node) for node in disclosure.children() if node.tag != "summary"))
        if not body:
            fail(f"{locale}: empty Aris disclosure body")
        bodies.append(body)
    if len(bodies) != 2:
        fail(f"{locale}: expected two Aris disclosures, found {len(bodies)}")
    for record in records:
        if not record["href"].startswith("guide/aris.html"):
            continue
        preview = clean(record["text"])
        for body in bodies:
            if preview == body or (len(preview) >= (25 if locale == "ZH" else 40) and preview in body):
                fail(f"{locale}: folded Aris body copied into preview: {record['objectID']}")
    return len(bodies)


def main():
    cache = {}
    groups, surfaces, evidence = check_aliases(cache)
    locales = {}
    for locale, root in (("ZH", OUTPUT), ("EN", OUTPUT / "en")):
        path = root / "kt-search.json"
        records = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(records, list):
            fail(f"{locale}: index is not a record array")
        ids = set()
        rows = set()
        destinations = Counter()
        hrefs = Counter()
        counts = Counter()
        for record in records:
            destination_class = check_record(record, locale, root, cache)
            object_id = record["objectID"]
            if object_id in ids or tuple(sorted(record.items())) in rows:
                fail(f"{locale}: duplicate objectID or record: {object_id}")
            ids.add(object_id)
            rows.add(tuple(sorted(record.items())))
            counts[record["type"]] += 1
            destinations[destination_class] += 1
            if record["type"] in {"memory", "codex", "outfit"}:
                hrefs[(record["type"], record["href"])] += 1
        if counts["outfit"] != 124:
            fail(f"{locale}: Outfit target count changed")
        if counts["memory"] != 87 or counts["codex"] != 56 or counts["page"] != 14:
            fail(f"{locale}: required record counts changed: {dict(counts)}")
        if destinations["memory-row"] != 87:
            fail(f"{locale}: exact Memory row destinations changed: {destinations['memory-row']}")
        if destinations["codex-entry"] != 56:
            fail(f"{locale}: exact Codex entry destinations changed: {destinations['codex-entry']}")
        folded = check_disclosure(records, locale, root, cache)
        shared = {kind: sum(count for (type_, _), count in hrefs.items() if type_ == kind and count > 1) for kind in ("memory", "codex")}
        locales[locale] = records
        print(f"{locale}: page={counts['page']} section={counts['section']} memory={counts['memory']} codex={counts['codex']} equipment={counts['equipment']} total={len(records)}")
        print(f"{locale}: original-semantic-anchor-destinations={destinations['stable-explicit']} memory-row-destinations={destinations['memory-row']} codex-entry-destinations={destinations['codex-entry']} page-root-destinations={destinations['page-root']} other-generated={destinations['generated']} shared collection destinations memory={shared['memory']} codex={shared['codex']} folded-bodies-checked={folded}")
        if shared["codex"]:
            fail(f"{locale}: Codex entry hrefs are not unique")

    for kind in ("memory", "codex", "section", "page", "equipment", "outfit"):
        zh = {record["objectID"] for record in locales["ZH"] if record["type"] == kind}
        en = {record["objectID"] for record in locales["EN"] if record["type"] == kind}
        print(f"paired {kind}: {len(zh & en)}/{len(zh)} ZH, {len(zh & en)}/{len(en)} EN; asymmetry ZH={len(zh - en)} EN={len(en - zh)}")
        if kind in ("memory", "codex") and zh != en:
            fail(f"{kind}: bilingual public identities diverge")
    print(f"aliases: groups={groups} surfaces={surfaces} evidence={dict(evidence)} conflicts=0")
    print("controlled search index: PASS")


if __name__ == "__main__":
    main()
