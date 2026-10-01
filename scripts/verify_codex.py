#!/usr/bin/env python3
"""Verify exact public Codex entry targets and controlled index hrefs."""

from collections import Counter, defaultdict
import json
from pathlib import Path

from build_search_index import semantic_headings
from codex_identity import codex_entries
from enhance_codex import TARGET_CLASS, RESPONSIVE_TABLE_CLASS, OVERFLOW_CODE_CLASS, enhance_html
from verify_navigation import Document, Node, label


OUTPUT = Path(__file__).resolve().parents[1] / "_site"
EXPECTED_CATEGORIES = {
    "codex-people": 16, "codex-species": 11, "codex-magic": 13,
    "codex-history": 8, "codex-world": 8,
}


def check_locale(locale):
    root = OUTPUT / ("en" if locale == "en" else "")
    path = root / "collectibles/codex.html"
    html = path.read_text(encoding="utf-8")
    depth = "../../" if locale == "en" else "../"
    link = f'<link id="kt-codex-entry-style" rel="stylesheet" href="{depth}assets/kt-codex-entry.css">\n'
    responsive_link = f'<link id="kt-codex-responsive-style" rel="stylesheet" href="{depth}assets/kt-codex-responsive.css">\n'
    if html.count(link) != 1 or html.count(responsive_link) != 1 or enhance_html(html, locale)[0] != html:
        raise ValueError(f"{locale}: Codex enhancer output is missing or not byte-idempotent")
    document = Document()
    document.feed(html)
    main = next(node for node in document.root.walk() if node.tag == "main" and node.attrs.get("id") == "quarto-document-content")
    entries = list(codex_entries(main, semantic_headings(main)))
    categories = Counter(entry.anchor for entry in entries)
    if dict(categories) != EXPECTED_CATEGORIES:
        raise ValueError(f"{locale}: native Codex category counts changed: {categories}")
    rows = {id(entry.row): entry.row for entry in entries}
    tables = {id(entry.table): entry.table for entry in entries}
    if len(entries) != 56 or len(rows) != 39 or len(tables) != 5:
        raise ValueError(f"{locale}: Codex table/row/entry count changed")
    marked = [node for node in main.walk() if node.tag == "table" and RESPONSIVE_TABLE_CLASS in node.attrs.get("class", "").split()]
    if len(marked) != 5 or {id(table) for table in marked} != set(tables) or any(table.attrs.get("data-codex-locale") != locale for table in marked):
        raise ValueError(f"{locale}: responsive Codex styling escaped its five tables")
    tax_items = [node for node in main.walk() if node.tag == "li" and
                 any(anchor.attrs.get("id") == "codex-aris-tax" for anchor in node.children("a"))]
    marked_codes = [node for node in main.walk() if node.tag == "code" and
                    OVERFLOW_CODE_CLASS in node.attrs.get("class", "").split()]
    if len(tax_items) != 1 or len(marked_codes) != 1 or marked_codes[0] not in tax_items[0].children("code") or \
       label(marked_codes[0]) != "Check out the Bestial Alleys?":
        raise ValueError(f"{locale}: inline-code overflow fix escaped its exact tax-note phrase")
    groups = defaultdict(list)
    for entry in entries:
        groups[id(entry.cell)].append(entry)
    if sum(len(group) > 1 for group in groups.values()) != 9:
        raise ValueError(f"{locale}: expected nine multi-entry rows")
    for group in groups.values():
        cell = group[0].cell
        if len(cell.parts) != 2 * len(group) - 1:
            raise ValueError(f"{locale}: Codex name-cell content was duplicated")
        for index, part in enumerate(cell.parts):
            if index % 2:
                if not isinstance(part, str) or part.strip() not in {"；", ";"}:
                    raise ValueError(f"{locale}: Codex name separator changed")
            else:
                entry = group[index // 2]
                if not isinstance(part, Node) or part.tag != "span" or part.attrs.get("id") != entry.fragment or \
                   part.attrs.get("class") != TARGET_CLASS or label(part) != entry.name or \
                   "tabindex" in part.attrs or "role" in part.attrs:
                    raise ValueError(f"{locale}: Codex entry target changed: {entry.object_id}")
        if len(group[0].row.children("td")) != 4:
            raise ValueError(f"{locale}: Codex row columns changed")
    fragments = [entry.fragment for entry in entries]
    if len(set(fragments)) != 56:
        raise ValueError(f"{locale}: duplicate Codex entry fragment")
    all_ids = [node.attrs["id"] for node in document.root.walk() if "id" in node.attrs]
    for fragment in fragments:
        if all_ids.count(fragment) != 1:
            raise ValueError(f"{locale}: Codex fragment does not resolve exactly once: {fragment}")
    records = json.loads((root / "kt-search.json").read_text(encoding="utf-8"))
    codex_records = [record for record in records if record["type"] == "codex"]
    expected = {entry.object_id: f"collectibles/codex.html#{entry.fragment}" for entry in entries}
    actual = {record["objectID"]: record["href"] for record in codex_records}
    if len(codex_records) != 56 or len(actual) != 56 or actual != expected or len(set(actual.values())) != 56:
        raise ValueError(f"{locale}: Codex controlled records do not have 56 unique exact hrefs")
    return {entry.object_id: (entry.fragment, entry.name) for entry in entries}


def main():
    zh = check_locale("zh")
    en = check_locale("en")
    if set(zh) != set(en) or any(zh[key] != en[key] for key in zh):
        raise ValueError("Codex entry identity/name pairing differs between locales")
    print("Codex entries: ZH=56/56 EN=56/56 paired=56 unique fragments=56/56 exact hrefs=56/56")
    print("Codex structure: five categories, 39 four-cell data rows, nine multi-entry rows per locale; enhancer byte-idempotent")
    print("Codex exact deep-link contract: PASS")


if __name__ == "__main__":
    main()
