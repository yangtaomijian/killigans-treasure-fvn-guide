#!/usr/bin/env python3
"""Add public Memory row identity and enhance the existing category jump list."""

from collections import Counter
import html as html_module
from pathlib import Path
import re

from build_search_index import memory_rows, semantic_headings
from memory_identity import memory_identity
from verify_navigation import Document


SITE = Path(__file__).resolve().parents[1]
OUTPUT = SITE / "_site"
LANDING_STYLE = '<style id="kt-memory-row-landing">#quarto-document-content tr[id^="memory-"] { scroll-margin-top: 5rem; }</style>\n'
LOCATOR_ID = "kt-memory-locator"
RESPONSIVE_TABLE_CLASS = "kt-memory-responsive-table"


class LocatedDocument(Document):
    def __init__(self):
        super().__init__()
        self.row_positions = {}
        self.table_positions = {}
        self.list_positions = {}
        self.list_ends = {}

    def handle_starttag(self, tag, attrs):
        position = self.getpos()
        source = self.get_starttag_text()
        super().handle_starttag(tag, attrs)
        if tag == "tr":
            self.row_positions[id(self.stack[-1])] = position, source
        elif tag == "table":
            self.table_positions[id(self.stack[-1])] = position, source
        elif tag == "ul":
            self.list_positions[id(self.stack[-1])] = position

    def handle_endtag(self, tag):
        if tag == "ul":
            node = next((node for node in reversed(self.stack) if node.tag == "ul"), None)
            if node is not None:
                self.list_ends[id(node)] = self.getpos()
        super().handle_endtag(tag)


def enhance_html(html, locale):
    document = LocatedDocument()
    document.feed(html)
    main = next((node for node in document.root.walk() if node.tag == "main" and node.attrs.get("id") == "quarto-document-content"), None)
    if main is None:
        raise ValueError("Rendered Memory article is missing")
    rows = list(memory_rows(main, semantic_headings(main)))
    if len(rows) != 87:
        raise ValueError(f"Expected 87 public Memory rows, found {len(rows)}")
    existing_ids = Counter(node.attrs["id"] for node in document.root.walk() if "id" in node.attrs)
    line_offsets = [0]
    for line in html.splitlines(keepends=True):
        line_offsets.append(line_offsets[-1] + len(line))
    edits = []
    fragments = []
    memory_row_nodes = {id(row) for row, *_rest in rows}
    memory_tables = [table for table in main.walk() if table.tag == "table" and
                     any(id(child) in memory_row_nodes for child in table.walk() if child.tag == "tr")]
    if len(memory_tables) != 11:
        raise ValueError(f"Expected 11 public Memory tables, found {len(memory_tables)}")
    for table in memory_tables:
        classes = table.attrs.get("class", "").split()
        if classes.count(RESPONSIVE_TABLE_CLASS) > 1:
            raise ValueError("Duplicate Memory responsive table class")
        if RESPONSIVE_TABLE_CLASS in classes:
            continue
        (line, column), source = document.table_positions[id(table)]
        offset = line_offsets[line - 1] + column
        if html[offset:offset + len(source)] != source or not source.endswith(">"):
            raise ValueError("Unable to locate Memory table start tag")
        match = re.search(r'\bclass=("|\')(.*?)\1', source)
        if match:
            new = source[:match.start(2)] + match.group(2) + " " + RESPONSIVE_TABLE_CLASS + source[match.end(2):]
        else:
            new = source[:-1] + f' class="{RESPONSIVE_TABLE_CLASS}">'
        edits.append((offset, source, new))
    categories = list(dict.fromkeys(anchor for _row, anchor, *_rest in rows))
    candidates = []
    for node in main.walk():
        if node.tag != "ul":
            continue
        links = [child for child in node.walk() if child.tag == "a" and "href" in child.attrs]
        if [link.attrs["href"] for link in links] == [f"#{anchor}" for anchor in categories]:
            candidates.append(node)
    if len(categories) != 11 or len(candidates) != 1:
        raise ValueError("Expected one existing 11-destination Memory jump list")
    locator_list = candidates[0]
    navs = [node for node in main.walk() if node.tag == "nav" and node.attrs.get("id") == LOCATOR_ID]
    aria_label = "Memory categories" if locale == "en" else "Memories 分类导航"
    if navs:
        if len(navs) != 1 or navs[0].attrs.get("aria-label") != aria_label or locator_list not in navs[0].children("ul"):
            raise ValueError("Existing Memory locator structure changed or duplicated")
    else:
        start_line, start_column = document.list_positions[id(locator_list)]
        end_line, end_column = document.list_ends[id(locator_list)]
        start = line_offsets[start_line - 1] + start_column
        end = line_offsets[end_line - 1] + end_column + len("</ul>")
        if html[start:start + 4] != "<ul>" or html[end - 5:end] != "</ul>":
            raise ValueError("Unable to locate original Memory jump list")
        original_list = html[start:end]
        if original_list.count(" · ") != 8:
            raise ValueError("Original Memory jump-list separators changed")
        grouped_list = original_list.replace(" · ", " ")
        wrapped = f'<nav id="{LOCATOR_ID}" aria-label="{html_module.escape(aria_label, quote=True)}">\n{grouped_list}\n</nav>'
        edits.append((start, original_list, wrapped))
    for row, anchor, _category, ordinal, _title, _scene in rows:
        _object_id, fragment = memory_identity(anchor, ordinal)
        if fragment in fragments:
            raise ValueError(f"Duplicate derived Memory fragment: {fragment}")
        fragments.append(fragment)
        present = row.attrs.get("id")
        if present not in (None, fragment) or (present is None and existing_ids[fragment]):
            raise ValueError(f"Conflicting Memory fragment: {fragment}")
        if present == fragment and existing_ids[fragment] != 1:
            raise ValueError(f"Duplicate existing Memory fragment: {fragment}")
        mapped = row.attrs.get("data-memory-category")
        if mapped not in (None, anchor):
            raise ValueError(f"Conflicting Memory category: {fragment}")
        if present == fragment and mapped == anchor:
            continue
        (line, column), source = document.row_positions[id(row)]
        offset = line_offsets[line - 1] + column
        if html[offset:offset + len(source)] != source or not source.endswith(">"):
            raise ValueError(f"Unable to locate Memory row start tag: {fragment}")
        additions = (f' id="{fragment}"' if present is None else "") + (f' data-memory-category="{anchor}"' if mapped is None else "")
        edits.append((offset, source, source[:-1] + additions + ">"))
    for offset, old, new in sorted(edits, key=lambda edit: edit[0], reverse=True):
        html = html[:offset] + new + html[offset + len(old):]
    if 'id="kt-memory-row-landing"' not in html:
        if html.count("</head>") != 1:
            raise ValueError("Memory page head is missing or duplicated")
        html = html.replace("</head>", LANDING_STYLE + "</head>")
    elif html.count(LANDING_STYLE) != 1:
        raise ValueError("Memory row landing style changed or duplicated")
    depth = "../../" if locale == "en" else "../"
    stylesheet = f'<link id="kt-memory-locator-style" rel="stylesheet" href="{depth}assets/kt-memory-locator.css">\n'
    responsive_stylesheet = f'<link id="kt-memory-responsive-style" rel="stylesheet" href="{depth}assets/kt-memory-responsive.css">\n'
    script = f'<script id="kt-memory-locator-script" defer src="{depth}assets/kt-memory-locator.js"></script>\n'
    gallery_style = f'<link id="kt-memory-gallery-style" rel="stylesheet" href="{depth}assets/kt-memory-gallery.css">\n'
    gallery_script = f'<script id="kt-memory-gallery-script" defer src="{depth}assets/kt-memory-gallery.js"></script>\n'
    for marker, addition, closing in (("kt-memory-locator-style", stylesheet, "</head>"),
                                      ("kt-memory-responsive-style", responsive_stylesheet, "</head>"),
                                      ("kt-memory-gallery-style", gallery_style, "</head>"),
                                      ("kt-memory-gallery-script", gallery_script, "</body>"),
                                      ("kt-memory-locator-script", script, "</body>")):
        if f'id="{marker}"' not in html:
            if html.count(closing) != 1:
                raise ValueError(f"Memory page {closing} missing or duplicated")
            html = html.replace(closing, addition + closing)
        elif html.count(addition) != 1:
            raise ValueError(f"Memory locator {marker} changed or duplicated")
    return html, fragments


def main():
    updates = []
    for locale in ("zh", "en"):
        path = OUTPUT / ("en/" if locale == "en" else "") / "collectibles/memories.html"
        original = path.read_text(encoding="utf-8")
        enhanced, fragments = enhance_html(original, locale)
        if enhance_html(enhanced, locale)[0] != enhanced:
            raise ValueError(f"Memory enhancement is not idempotent: {locale}")
        updates.append((path, original, enhanced, fragments))
    if updates[0][3] != updates[1][3]:
        raise ValueError("ZH/EN Memory fragment identities differ")
    for path, original, enhanced, fragments in updates:
        if enhanced != original:
            path.write_text(enhanced, encoding="utf-8")
        print(f"{path.relative_to(OUTPUT)}: Memory row fragments={len(fragments)} changed={enhanced != original}")


if __name__ == "__main__":
    main()
