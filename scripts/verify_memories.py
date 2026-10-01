#!/usr/bin/env python3
"""Verify exact bilingual Memory row identity and controlled deep links."""

from collections import Counter, defaultdict
import json
from pathlib import Path
import re

from build_search_index import memory_rows, semantic_headings, table_header
from enhance_memories import LANDING_STYLE, LOCATOR_ID, RESPONSIVE_TABLE_CLASS, enhance_html
from memory_identity import memory_identity
from verify_navigation import Document, label


OUTPUT = Path(__file__).resolve().parents[1] / "_site"


def check_locale(locale):
    root = OUTPUT / locale
    path = root / "collectibles/memories.html"
    html = path.read_text(encoding="utf-8")
    if html.count(LANDING_STYLE) != 1:
        raise ValueError(f"{locale or 'ZH'}: fixed-header row landing style missing or duplicated")
    language = "en" if locale else "zh"
    depth = "../../" if locale else "../"
    responsive_link = f'<link id="kt-memory-responsive-style" rel="stylesheet" href="{depth}assets/kt-memory-responsive.css">\n'
    if html.count(responsive_link) != 1:
        raise ValueError(f"{locale or 'ZH'}: responsive Memory stylesheet missing or duplicated")
    if enhance_html(html, language)[0] != html:
        raise ValueError(f"{locale or 'ZH'}: Memory enhancement is not byte-idempotent")
    document = Document()
    document.feed(html)
    main = next(node for node in document.root.walk() if node.tag == "main" and node.attrs.get("id") == "quarto-document-content")
    rows = list(memory_rows(main, semantic_headings(main)))
    if len(rows) != 87:
        raise ValueError(f"{locale or 'ZH'}: expected 87 Memory rows, got {len(rows)}")
    categories = list(dict.fromkeys(anchor for _row, anchor, *_rest in rows))
    navigations = [node for node in main.walk() if node.tag == "nav" and node.attrs.get("id") == LOCATOR_ID]
    if len(navigations) != 1 or navigations[0].attrs.get("aria-label") != ("Memory categories" if locale else "Memories 分类导航"):
        raise ValueError(f"{locale or 'ZH'}: missing, duplicated, or mislabeled Memory locator")
    locator = navigations[0]
    if len(locator.children("ul")) != 1 or len(locator.children("ul")[0].children("li")) != 3:
        raise ValueError(f"{locale or 'ZH'}: original three-group jump-list structure changed")
    links = [node for node in locator.walk() if node.tag == "a"]
    actual_links = [(label(link), link.attrs.get("href")) for link in links]
    source = (OUTPUT.parent / locale / "collectibles/memories.md").read_text(encoding="utf-8")
    jump_lines = [line for line in source.split("<a id=")[0].splitlines() if line.startswith("- ")]
    source_links = re.findall(r"\[([^\]]+)\]\((#[^)]+)\)", "\n".join(jump_lines))
    if len(links) != 11 or actual_links != source_links:
        raise ValueError(f"{locale or 'ZH'}: locator labels/hrefs differ from public jump links")
    hrefs = [href for _name, href in actual_links]
    if hrefs != [f"#{anchor}" for anchor in categories] or len(set(hrefs)) != 11:
        raise ValueError(f"{locale or 'ZH'}: locator destinations missing, duplicated, reordered, or generated")
    all_data_rows = [node for node in main.walk() if node.tag == "tr" and node.children("td")]
    all_header_rows = [node for node in main.walk() if node.tag == "tr" and node.children("th")]
    if len(all_data_rows) != 91 or len(all_header_rows) != 12:
        raise ValueError(f"{locale or 'ZH'}: public table row count changed")
    tables = [node for node in main.walk() if node.tag == "table" and table_header(node)[:1] and table_header(node)[0] in {"顺序", "No."}]
    if len(tables) != 11:
        raise ValueError(f"{locale or 'ZH'}: expected 11 Memory category tables, got {len(tables)}")
    marked_tables = [node for node in main.walk() if node.tag == "table" and RESPONSIVE_TABLE_CLASS in node.attrs.get("class", "").split()]
    if marked_tables != tables:
        raise ValueError(f"{locale or 'ZH'}: responsive styling is not scoped to the 11 Memory tables")
    for table in tables:
        heads = [node for node in table.walk() if node.tag == "tr" and node.children("th")]
        if len(heads) != 1 or len(heads[0].children("th")) != 3:
            raise ValueError(f"{locale or 'ZH'}: Memory table header shape changed")
        if len([node for node in table.walk() if node.tag == "tr" and node.children("td")]) == 0:
            raise ValueError(f"{locale or 'ZH'}: empty Memory category table")
    ids = Counter(node.attrs["id"] for node in document.root.walk() if "id" in node.attrs)
    fragments = []
    titles = defaultdict(list)
    for row, anchor, _category, ordinal, native_title, _scene in rows:
        object_id, fragment = memory_identity(anchor, ordinal)
        if row.attrs.get("id") != fragment or ids[fragment] != 1:
            raise ValueError(f"{locale or 'ZH'}: missing or duplicate Memory row ID: {fragment}")
        if row.attrs.get("data-memory-category") != anchor or set(row.attrs) != {"class", "id", "data-memory-category"}:
            raise ValueError(f"{locale or 'ZH'}: unexpected Memory row attributes: {fragment}")
        fragments.append(fragment)
        titles[(anchor, native_title)].append((object_id, fragment))
    if len(set(fragments)) != 87:
        raise ValueError(f"{locale or 'ZH'}: Memory row IDs are not unique")
    generated_rows = [node.attrs["id"] for node in all_data_rows if node.attrs.get("id", "").startswith("memory-")]
    if generated_rows != fragments:
        raise ValueError(f"{locale or 'ZH'}: extra, missing, or reordered Memory row IDs")
    if any(f"#{row.attrs['data-memory-category']}" not in hrefs for row, *_rest in rows):
        raise ValueError(f"{locale or 'ZH'}: a Memory row has no locator category")
    if any(ids[href[1:]] != 1 for href in hrefs):
        raise ValueError(f"{locale or 'ZH'}: locator destination does not resolve exactly once")

    records = json.loads((root / "kt-search.json").read_text(encoding="utf-8"))
    memories = [record for record in records if record["type"] == "memory"]
    if len(memories) != 87 or len({record["objectID"] for record in memories}) != 87 or len({record["href"] for record in memories}) != 87:
        raise ValueError(f"{locale or 'ZH'}: Memory records or hrefs are not 87 unique items")
    expected = {memory_identity(anchor, ordinal)[0]: memory_identity(anchor, ordinal)[1] for _, anchor, _, ordinal, _, _ in rows}
    for record in memories:
        fragment = expected.get(record["objectID"])
        if not fragment or record["href"] != f"collectibles/memories.html#{fragment}":
            raise ValueError(f"{locale or 'ZH'}: inexact Memory href: {record['objectID']}: {record['href']}")
        if ids[fragment] != 1:
            raise ValueError(f"{locale or 'ZH'}: unresolved Memory href: {record['href']}")
    repeated = {key: items for key, items in titles.items() if len(items) > 1}
    if not repeated:
        raise ValueError(f"{locale or 'ZH'}: repeated native titles unexpectedly absent")
    for items in repeated.values():
        if len({item[0] for item in items}) != len(items) or len({item[1] for item in items}) != len(items):
            raise ValueError(f"{locale or 'ZH'}: repeated title identities collapsed")
    return fragments, repeated


def main():
    zh, zh_repeated = check_locale("")
    en, en_repeated = check_locale("en/")
    if zh != en:
        raise ValueError("Memory row fragments differ between ZH and EN")
    example = zh_repeated.get(("redroot-memories", "Redroot"))
    if not example or len(example) < 2:
        raise ValueError("Redroot repeated-title example changed")
    print("Memory rows: ZH=87/87 EN=87/87 unique=87 paired=87 exact hrefs=87/87 per locale unresolved=0")
    print("Memory tables: 11 per locale, 87 three-column rows; page table rows=91 data/12 headers; enhancer byte-idempotent")
    print("Memory locator: 11/11 source labels and semantic anchors per locale; three original groups; 87/87 row categories; generated slugs=0")
    print("Memory responsive scope: 11/11 Memory tables per locale; other tables=0; dedicated stylesheet linked once per locale")
    print(f"Repeated Redroot title: {example[0][0]} -> {example[0][1]}; {example[1][0]} -> {example[1][1]}")
    print(f"Repeated-title groups: ZH={len(zh_repeated)} EN={len(en_repeated)}")
    print("Memory deep-link contract: PASS")


if __name__ == "__main__":
    main()
