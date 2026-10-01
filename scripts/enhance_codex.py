#!/usr/bin/env python3
"""Add exact public Codex entry targets to assembled rendered HTML."""

from collections import defaultdict
import html as html_module
from pathlib import Path
import re

from build_search_index import semantic_headings
from codex_identity import codex_entries
from verify_navigation import Document, label


SITE = Path(__file__).resolve().parents[1]
OUTPUT = SITE / "_site"
TARGET_CLASS = "kt-codex-entry"
RESPONSIVE_TABLE_CLASS = "kt-codex-responsive-table"
OVERFLOW_CODE_CLASS = "kt-codex-overflow-code"


class LocatedDocument(Document):
    def __init__(self):
        super().__init__()
        self.cell_starts = {}
        self.table_starts = {}
        self.code_starts = {}

    def handle_starttag(self, tag, attrs):
        position, source = self.getpos(), self.get_starttag_text()
        super().handle_starttag(tag, attrs)
        if tag == "td":
            self.cell_starts[id(self.stack[-1])] = position, source
        elif tag == "table":
            self.table_starts[id(self.stack[-1])] = position, source
        elif tag == "code":
            self.code_starts[id(self.stack[-1])] = position, source


def wrap_names(raw, entries):
    pieces = re.split(r"([；;])", raw)
    names = pieces[::2]
    if len(names) != len(entries):
        raise ValueError("Codex name-cell separator count changed")
    for index, (piece, entry) in enumerate(zip(names, entries)):
        if html_module.unescape(piece).strip() != entry.name:
            raise ValueError(f"Codex native name changed: {entry.object_id}")
        match = re.fullmatch(r"(\s*)(.*?)(\s*)", piece, flags=re.DOTALL)
        before, name, after = match.groups()
        names[index] = f'{before}<span id="{entry.fragment}" class="{TARGET_CLASS}">{name}</span>{after}'
    result = []
    for index, name in enumerate(names):
        result.append(name)
        if index < len(names) - 1:
            result.append(pieces[index * 2 + 1])
    return "".join(result)


def enhance_html(html, locale):
    document = LocatedDocument()
    document.feed(html)
    main = next((node for node in document.root.walk() if node.tag == "main" and node.attrs.get("id") == "quarto-document-content"), None)
    if main is None:
        raise ValueError(f"{locale}: missing public Codex main")
    entries = list(codex_entries(main, semantic_headings(main)))
    if len(entries) != 56 or len({entry.fragment for entry in entries}) != 56:
        raise ValueError(f"{locale}: expected 56 unique public Codex entries")
    groups = defaultdict(list)
    for entry in entries:
        groups[id(entry.cell)].append(entry)
    if len(groups) != 39 or sum(len(group) > 1 for group in groups.values()) != 9:
        raise ValueError(f"{locale}: Codex row/multi-entry structure changed")

    line_offsets = [0]
    for line in html.splitlines(keepends=True):
        line_offsets.append(line_offsets[-1] + len(line))
    edits = []
    tables = {id(entry.table): entry.table for entry in entries}
    if len(tables) != 5:
        raise ValueError(f"{locale}: expected five Codex tables")
    for table in tables.values():
        classes = table.attrs.get("class", "").split()
        if classes.count(RESPONSIVE_TABLE_CLASS) > 1:
            raise ValueError(f"{locale}: duplicate Codex responsive class")
        marked = RESPONSIVE_TABLE_CLASS in classes
        table_locale = table.attrs.get("data-codex-locale")
        if marked and table_locale == locale:
            continue
        if marked or table_locale is not None:
            raise ValueError(f"{locale}: inconsistent Codex responsive attributes")
        (line, column), source = document.table_starts[id(table)]
        start = line_offsets[line - 1] + column
        if html[start:start + len(source)] != source or not source.endswith(">"):
            raise ValueError(f"{locale}: unable to locate Codex table start tag")
        match = re.search(r'\bclass=("|\')(.*?)\1', source)
        if match:
            new = source[:match.start(2)] + match.group(2) + " " + RESPONSIVE_TABLE_CLASS + source[match.end(2):]
        else:
            new = source[:-1] + f' class="{RESPONSIVE_TABLE_CLASS}">'
        new = new[:-1] + f' data-codex-locale="{locale}">'
        edits.append((start, source, new))
    phrase_codes = [code for item in main.walk() if item.tag == "li" and
                    any(anchor.attrs.get("id") == "codex-aris-tax" for anchor in item.children("a"))
                    for code in item.children("code") if label(code) == "Check out the Bestial Alleys?"]
    if len(phrase_codes) != 1:
        raise ValueError(f"{locale}: Codex tax-note phrase not uniquely located")
    code = phrase_codes[0]
    code_classes = code.attrs.get("class", "").split()
    if code_classes.count(OVERFLOW_CODE_CLASS) > 1:
        raise ValueError(f"{locale}: duplicate Codex overflow-code class")
    if OVERFLOW_CODE_CLASS not in code_classes:
        (line, column), source = document.code_starts[id(code)]
        start = line_offsets[line - 1] + column
        if html[start:start + len(source)] != source or not source.endswith(">"):
            raise ValueError(f"{locale}: unable to locate Codex tax-note code tag")
        match = re.search(r'\bclass=("|\')(.*?)\1', source)
        if match:
            new = source[:match.start(2)] + match.group(2) + " " + OVERFLOW_CODE_CLASS + source[match.end(2):]
        else:
            new = source[:-1] + f' class="{OVERFLOW_CODE_CLASS}">'
        edits.append((start, source, new))
    for group in groups.values():
        cell = group[0].cell
        existing = cell.children()
        if existing:
            if len(existing) != len(group) or any(
                span.tag != "span" or span.attrs.get("id") != entry.fragment or
                TARGET_CLASS not in span.attrs.get("class", "").split() or label(span) != entry.name
                for span, entry in zip(existing, group)
            ):
                raise ValueError(f"{locale}: malformed existing Codex entry targets")
            continue
        (line, column), source = document.cell_starts[id(cell)]
        start = line_offsets[line - 1] + column + len(source)
        end = html.find("</td>", start)
        if end < 0 or "<" in html[start:end]:
            raise ValueError(f"{locale}: Codex name cell is no longer plain rendered text")
        raw = html[start:end]
        edits.append((start, raw, wrap_names(raw, group)))

    for start, old, new in sorted(edits, reverse=True):
        if html[start:start + len(old)] != old:
            raise ValueError(f"{locale}: Codex source position changed")
        html = html[:start] + new + html[start + len(old):]
    depth = "../../" if locale == "en" else "../"
    stylesheet = f'<link id="kt-codex-entry-style" rel="stylesheet" href="{depth}assets/kt-codex-entry.css">\n'
    responsive_stylesheet = f'<link id="kt-codex-responsive-style" rel="stylesheet" href="{depth}assets/kt-codex-responsive.css">\n'
    if 'id="kt-codex-entry-style"' not in html:
        if html.count("</head>") != 1:
            raise ValueError(f"{locale}: unexpected HTML head structure")
        html = html.replace("</head>", stylesheet + "</head>", 1)
    if 'id="kt-codex-responsive-style"' not in html:
        if html.count("</head>") != 1:
            raise ValueError(f"{locale}: unexpected HTML head structure")
        html = html.replace("</head>", responsive_stylesheet + "</head>", 1)
    return html, entries


def main():
    for locale, rel in (("zh", "collectibles/codex.html"), ("en", "en/collectibles/codex.html")):
        path = OUTPUT / rel
        before = path.read_text(encoding="utf-8")
        after, entries = enhance_html(before, locale)
        if after != before:
            path.write_text(after, encoding="utf-8")
        print(f"{rel}: Codex entry fragments={len(entries)} changed={after != before}")


if __name__ == "__main__":
    main()
