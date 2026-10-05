#!/usr/bin/env python3
"""Check the public pages in the assembled Quarto output."""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import sys
from urllib.parse import unquote, urlsplit


SITE = Path(__file__).resolve().parents[1]
OUTPUT = SITE / "_site"
PAGES = (
    "index", "discussions", "help",
    "guide/redroot", "guide/aris", "guide/crystal-plains-shieldfall",
    "guide/spiceport", "guide/blueleaf-grove",
    "reference/relationships", "reference/personality", "reference/combat",
    "collectibles/memories", "collectibles/equipment", "collectibles/dressing-room", "collectibles/codex",
)
ANCHOR_RE = re.compile(r'<a\s+id=["\']([^"\']+)["\']\s*></a>')
MARKDOWN_LINK_RE = re.compile(r'(?<!!)\[[^\]]*\]\(([^)]+)\)')
TABLE_RULE_RE = re.compile(r'^\|\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$')
PRIVATE_PARTS = {"research", "private-inputs", "runtime", "archive", "editorial"}
PRIVATE_SUFFIXES = {".md", ".csv", ".zip", ".save", ".persistent", ".rpy", ".rpyc", ".py", ".sh"}
PUBLIC_JSON = {Path("assets/kt-dressing-room.json"), Path("search.json"), Path("en/search.json"), Path("kt-search.json"), Path("en/kt-search.json"), Path("assets/kt-search-aliases.json")}
PUBLIC_ASSETS = {Path("404.html"), Path("CNAME"), Path(".nojekyll"), Path("robots.txt"), Path("sitemap.xml"), Path("assets/favicon.svg"), Path("assets/favicon-32x32.png"), Path("assets/apple-touch-icon.png"), Path("assets/social/killigans-treasure-guide-zh.png"), Path("assets/social/killigans-treasure-guide-en.png"), Path("assets/kt-production-shell.css"), Path("assets/kt-discussion.css"), Path("assets/kt-feedback.css"), Path("assets/kt-adaptive-tables.js"), Path("assets/kt-dressing-room.css"), Path("assets/kt-dressing-room.js"), Path("assets/vendor/mermaid.min.js"), Path("assets/kt-story-map.css"), Path("assets/kt-story-map.js"), Path("assets/kt-read-layers.js"), Path("assets/kt-discovery.css"), Path("assets/kt-discovery.js"), Path("assets/kt-memory-gallery.css"), Path("assets/kt-memory-gallery.js"), Path("assets/kt-mobile-header.css"), Path("assets/kt-mobile-header.js"), Path("assets/kt-search-core.js"), Path("assets/kt-memory-locator.css"), Path("assets/kt-memory-locator.js"), Path("assets/kt-memory-responsive.css"), Path("assets/kt-codex-entry.css"), Path("assets/kt-codex-responsive.css"), Path("assets/kt-foundation.css"), Path("assets/kt-publication.css"), Path("assets/kt-layout.css"), Path("assets/kt-components.css"), Path("assets/kt-page-toc.js"), Path("assets/kt-global-nav.js"), Path("assets/kt-theme.js"), Path("assets/kt-theme.css"), Path("assets/fonts/newsreader-latin-standard-normal.woff2"), Path("assets/fonts/Newsreader-OFL.txt")}
PUBLIC_ASSETS.update(Path('en/assets') / name for name in ('favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png'))


def is_native_theme_stylesheet(tag, values):
    # Quarto intentionally shares these IDs across its primary, alternate and fallback sheets.
    # Only native stylesheet nodes qualify; all content/control IDs remain strictly unique.
    classes = set(values.get("class", "").split())
    return (tag == "link" and values.get("id") in {
        "quarto-bootstrap", "quarto-text-highlighting-styles"
    } and bool(classes & {"quarto-color-scheme", "quarto-color-scheme-extra"})
        and values.get("rel") in {"stylesheet", "disabled-stylesheet"})


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.anchor_ids = []
        self.links = []
        self.language_links = []
        self.in_right_nav = False
        self.resources = []
        self.tags = Counter()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "ul" and {"navbar-nav", "ms-auto"} <= set(values.get("class", "").split()):
            self.in_right_nav = True
        self.tags[tag] += 1
        if "id" in values and not is_native_theme_stylesheet(tag, values):
            self.ids.append(values["id"])
            if tag == "a":
                self.anchor_ids.append(values["id"])
        if tag == "a" and "href" in values:
            if self.in_right_nav:
                self.language_links.append(values["href"])
            else:
                self.links.append(values["href"])
        for key in ("href", "src"):
            if key in values:
                self.resources.append(values[key])

    def handle_endtag(self, tag):
        if tag == "ul" and self.in_right_nav:
            self.in_right_nav = False


def source_contract(path):
    text = path.read_text(encoding="utf-8")
    # Resolve only known local map includes for exact details/link accounting.
    def include(match):
        target = (path.parent / match.group(1)).resolve()
        if SITE / '_includes' not in target.parents:
            raise ValueError(f'Unexpected include: {target}')
        return target.read_text(encoding='utf-8')
    text = re.sub(r'\{\{< include ([^ ]+) >\}\}', include, text)
    anchors = ANCHOR_RE.findall(text)
    fragments = Counter()
    for link in MARKDOWN_LINK_RE.findall(text):
        parsed = urlsplit(link)
        if not parsed.scheme and not parsed.netloc and parsed.fragment:
            fragments[unquote(parsed.fragment)] += 1
    tables = sum(bool(TABLE_RULE_RE.match(line)) for line in text.splitlines())
    return anchors, fragments, Counter(re.findall(r"</?(details|summary)\b", text)), tables


def main():
    errors = []
    expected = {Path(f"{locale}{page}.html") for locale in ("", "en/") for page in PAGES}
    actual = {path.relative_to(OUTPUT) for path in OUTPUT.rglob("*.html") if "site_libs" not in path.parts and path.name != "404.html"} if OUTPUT.is_dir() else set()
    for path in sorted(expected - actual):
        errors.append(f"missing page: {path}")
    for path in sorted(actual - expected):
        errors.append(f"unexpected page: {path}")

    unexpected_files = []
    mac_metadata = []
    for path in OUTPUT.rglob("*") if OUTPUT.is_dir() else ():
        if not path.is_file():
            continue
        rel = path.relative_to(OUTPUT)
        if path.name == ".DS_Store":
            mac_metadata.append(str(rel))
            continue
        if (PRIVATE_PARTS & set(rel.parts)) or path.suffix.lower() in PRIVATE_SUFFIXES or (path.suffix.lower() == ".json" and rel not in PUBLIC_JSON) or path.name.startswith("KT-v0.57a-"):
            unexpected_files.append(str(rel))
        elif rel not in expected and rel not in PUBLIC_JSON and rel not in PUBLIC_ASSETS and "site_libs" not in rel.parts:
            unexpected_files.append(str(rel))
    if unexpected_files:
        errors.append("unexpected/private output files: " + ", ".join(sorted(unexpected_files)))

    pages = {}
    contracts = {}
    duplicate_total = 0
    for locale in ("", "en/"):
        for page in PAGES:
            source = SITE / locale / f"{page}.md"
            target = OUTPUT / locale / f"{page}.html"
            if not source.is_file() or not target.is_file():
                continue
            contract = source_contract(source)
            parsed = Page()
            parsed.feed(target.read_text(encoding="utf-8"))
            rel = target.relative_to(OUTPUT)
            pages[rel] = parsed
            contracts[rel] = contract
            expected_ids, source_fragments, source_tags, source_tables = contract
            for anchor, count in Counter(expected_ids).items():
                if count > 1:
                    errors.append(f"duplicate source anchor: {rel}#{anchor} ({count})")
            for anchor in expected_ids:
                if anchor not in parsed.ids:
                    errors.append(f"missing anchor: {rel}#{anchor}")
                if anchor not in parsed.anchor_ids:
                    errors.append(f"anchor is no longer an <a>: {rel}#{anchor}")
            for anchor, count in Counter(parsed.ids).items():
                if count > 1:
                    duplicate_total += 1
                    errors.append(f"duplicate DOM id: {rel}#{anchor} ({count})")
            for tag in ("details", "summary"):
                if parsed.tags[tag] != source_tags[tag] // 2:
                    errors.append(f"{tag} count changed: {rel} source={source_tags[tag] // 2} html={parsed.tags[tag]}")
            if parsed.tags["table"] < source_tables:
                errors.append(f"table count fell: {rel} source={source_tables} html={parsed.tags['table']}")
            rendered_fragments = Counter(unquote(urlsplit(link).fragment) for link in parsed.links if urlsplit(link).fragment)
            for fragment, count in source_fragments.items():
                if rendered_fragments[fragment] < count:
                    errors.append(f"source fragment link lost: {rel}#{fragment}")
            for ref in parsed.resources:
                parts = set(unquote(urlsplit(ref).path).split("/"))
                if PRIVATE_PARTS & parts or any(unquote(urlsplit(ref).path).lower().endswith(s) for s in PRIVATE_SUFFIXES):
                    errors.append(f"private resource path: {rel}: {ref}")

    zh_ids = {anchor for rel, contract in contracts.items() if "en" not in rel.parts for anchor in contract[0]}
    en_ids = {anchor for rel, contract in contracts.items() if "en" in rel.parts for anchor in contract[0]}
    for locale, ids in (("ZH", zh_ids), ("EN", en_ids)):
        count = sum(len(contract[0]) for rel, contract in contracts.items() if ("en" in rel.parts) == (locale == "EN"))
        # Frozen baseline plus eight approved bilingual Personality sections.
        if count != 133:
            errors.append(f"{locale} source explicit anchor contract changed: occurrences={count}, unique={len(ids)}")
    if zh_ids != en_ids:
        errors.append(f"locale anchor sets differ: ZH-only={sorted(zh_ids - en_ids)}, EN-only={sorted(en_ids - zh_ids)}")
    for page in PAGES:
        zh = contracts.get(Path(f"{page}.html"))
        en = contracts.get(Path(f"en/{page}.html"))
        if zh and en and zh[0] != en[0]:
            errors.append(f"page anchor order differs: {page}")

    page_links = fragment_links = md_links = 0
    broken_pages = []
    broken_fragments = []
    crossed_locales = []
    for rel, parsed in pages.items():
        for link in parsed.links:
            url = urlsplit(link)
            if url.scheme or url.netloc or link.startswith("//"):
                continue
            pathname = unquote(url.path)
            if pathname.endswith(".md"):
                md_links += 1
                continue
            if pathname and not (pathname.endswith(".html") or pathname.endswith("/")):
                continue
            page_links += 1
            target = (OUTPUT / pathname.lstrip("/") if pathname.startswith("/") else OUTPUT / rel.parent / pathname).resolve() if pathname else (OUTPUT / rel).resolve()
            if pathname.endswith("/"):
                target /= "index.html"
            if not target.is_relative_to(OUTPUT.resolve()) or not target.is_file():
                broken_pages.append(f"{rel}: {link}")
                continue
            target_rel = target.relative_to(OUTPUT.resolve())
            if ("en" in rel.parts) != ("en" in target_rel.parts):
                crossed_locales.append(f"{rel}: {link}")
            if url.fragment:
                fragment_links += 1
                dest = pages.get(target_rel)
                if dest is None or unquote(url.fragment) not in dest.ids:
                    broken_fragments.append(f"{rel}: {link}")
    if md_links:
        errors.append(f"rendered .md links: {md_links}")
    if broken_pages:
        errors.append("broken page targets: " + ", ".join(broken_pages))
    if broken_fragments:
        errors.append("broken fragments: " + ", ".join(broken_fragments))
    if crossed_locales:
        errors.append("cross-locale page links: " + ", ".join(crossed_locales))

    for locale in ("", "en/"):
        index = OUTPUT / locale / "search.json"
        if index.is_file():
            try:
                records = json.loads(index.read_text(encoding="utf-8"))
                allowed = {f"{page}.html" for page in PAGES}
                for record in records:
                    href = record.get("href", "")
                    if urlsplit(href).path not in allowed:
                        errors.append(f"unexpected search index target: {index.relative_to(OUTPUT)}: {href}")
            except (ValueError, TypeError, AttributeError) as exc:
                errors.append(f"invalid generated search index: {index.relative_to(OUTPUT)}: {exc}")

    for locale, ids in (("ZH", zh_ids), ("EN", en_ids)):
        actual_ids = sum(len(set(contracts[rel][0]) & set(pages[rel].ids)) for rel in contracts if ("en" in rel.parts) == (locale == "EN"))
        expected_count = sum(len(contracts[rel][0]) for rel in contracts if ("en" in rel.parts) == (locale == "EN"))
        print(f"{locale}: pages={sum(('en' in rel.parts) == (locale == 'EN') for rel in pages)} explicit anchors={expected_count} preserved={actual_ids}")
    print(f"DOM: duplicate content/control IDs={duplicate_total} (native theme stylesheet IDs verified separately)")
    print(f"links: internal pages={page_links} fragments={fragment_links} broken pages={len(broken_pages)} broken fragments={len(broken_fragments)} .md={md_links} cross-locale={len(crossed_locales)}")
    print(f"HTML: details={sum(p.tags['details'] for p in pages.values())} summary={sum(p.tags['summary'] for p in pages.values())} tables={sum(p.tags['table'] for p in pages.values())}/{sum(contract[3] for contract in contracts.values())}")
    print(f"output isolation: unexpected/private files={len(unexpected_files)}")
    if mac_metadata:
        print("output warning: macOS metadata present=" + ", ".join(sorted(mac_metadata)))
    print("Codex list anchors:", ", ".join(f"{rel}:{anchor}={'ok' if anchor in pages[rel].anchor_ids else 'missing'}" for rel in (Path("collectibles/codex.html"), Path("en/collectibles/codex.html")) if rel in pages for anchor in ("codex-clutchmates", "codex-aris-tax")))
    if errors:
        for error in errors:
            print("ERROR:", error, file=sys.stderr)
        return 1
    print("Render contract: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
