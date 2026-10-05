#!/usr/bin/env python3
"""Verify the assembled site has one shared page TOC and one narrow entry."""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import unquote

from verify_render import OUTPUT, PAGES, is_native_theme_stylesheet


class LayoutPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = Counter()
        self.nodes = {}
        self.toc_links = []
        self.in_toc = False
        self.in_toc_title = False
        self.toc_titles = []
        self.assets = []
        self.global_div_depth = 0
        self.global_links = []
        self.togglers = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "div" and values.get("id") == "navbarCollapse":
            self.global_div_depth = 1
        elif tag == "div" and self.global_div_depth:
            self.global_div_depth += 1
        if tag == "a" and self.global_div_depth and values.get("href") not in (None, "#"):
            self.global_links.append(values["href"])
        if tag == "button" and "navbar-toggler" in values.get("class", "").split():
            self.togglers.append(values)
        if "id" in values and not is_native_theme_stylesheet(tag, values):
            self.ids[values["id"]] += 1
            self.nodes[values["id"]] = (tag, values)
        if tag == "nav" and values.get("id") == "TOC":
            self.in_toc = True
        if tag == "h2" and values.get("id") == "toc-title" and self.in_toc:
            self.in_toc_title = True
            self.toc_titles.append("")
        if tag == "a" and self.in_toc:
            self.toc_links.append(values.get("href", ""))
        if tag in {"script", "link"}:
            self.assets.append(values.get("src", values.get("href", "")))

    def handle_endtag(self, tag):
        if tag == "div" and self.global_div_depth:
            self.global_div_depth -= 1
        if tag == "h2" and self.in_toc_title:
            self.in_toc_title = False
        if tag == "nav" and self.in_toc:
            self.in_toc = False

    def handle_data(self, data):
        if self.in_toc_title:
            self.toc_titles[-1] += data


def main():
    errors = []
    links = 0
    for locale, prefix in (("zh", ""), ("en", "en/")):
        for route in PAGES:
            page = OUTPUT / prefix / f"{route}.html"
            html = page.read_text(encoding="utf-8")
            parser = LayoutPage()
            parser.feed(html)
            ids = parser.ids
            if ids["quarto-margin-sidebar"]:
                errors.append(f"{page}: KT TOC still owned by Quarto margin collision manager")
            has_toc = route not in {"index", "discussions"}
            required = ("quarto-content", "kt-page-toc-panel", "quarto-document-content", "TOC", "toc-title",
                        "kt-page-toc-trigger", "kt-page-toc-close", "kt-page-toc-backdrop",
                        "kt-search-launcher", "navbarCollapse", "kt-global-nav-toolbar",
                        "kt-global-nav-close", "kt-global-nav-backdrop", "kt-publication-brand")
            toc_ids = {"kt-page-toc-panel", "TOC", "toc-title", "kt-page-toc-trigger", "kt-page-toc-close", "kt-page-toc-backdrop"}
            required = tuple(key for key in required if has_toc or key not in toc_ids)
            if not has_toc and any(ids[key] for key in toc_ids):
                errors.append(f"{page}: home/alias unexpectedly has page-TOC controls")
            for key in required:
                if ids[key] != 1:
                    errors.append(f"{page}: {key} count={ids[key]}")
            for key, count in ids.items():
                if count > 1:
                    errors.append(f"{page}: duplicate id {key}")
            for key in ("kt-global-nav-utilities", "kt-global-nav-page", "kt-global-nav-search",
                        "kt-page-toc-utilities", "kt-page-toc-global-nav", "kt-page-toc-search"):
                if ids[key]:
                    errors.append(f"{page}: unexpected duplicate drawer control {key}")
            label = "本页目录" if locale == "zh" else "On this page"
            trigger = parser.nodes.get("kt-page-toc-trigger", (None, {}))
            toc = parser.nodes.get("TOC", (None, {}))
            if has_toc:
                if trigger[0] != "button" or trigger[1].get("aria-controls") != "kt-page-toc-panel" or trigger[1].get("aria-expanded") != "false" or trigger[1].get("aria-label") != label:
                    errors.append(f"{page}: trigger contract")
                if toc[0] != "nav" or toc[1].get("role") != "doc-toc" or toc[1].get("aria-label") != label:
                    errors.append(f"{page}: TOC landmark contract")
                if parser.nodes.get("toc-title", (None, {}))[0] != "h2" or parser.toc_titles != [label]:
                    errors.append(f"{page}: visible TOC title contract")
                if not parser.toc_links or any(not href.startswith("#") or unquote(href[1:]) not in ids for href in parser.toc_links):
                    errors.append(f"{page}: TOC fragment targets")
            links += len(parser.toc_links)
            if not any(asset.endswith("assets/kt-layout.css") for asset in parser.assets) or not any(asset.endswith("assets/kt-page-toc.js") for asset in parser.assets):
                errors.append(f"{page}: layout assets")
            if not any(asset.endswith("assets/kt-global-nav.js") for asset in parser.assets):
                errors.append(f"{page}: global-navigation controller missing")
            nav = parser.nodes.get("navbarCollapse", (None, {}))
            if nav[1].get("role") != "navigation" or nav[1].get("aria-label") != ("导航" if locale == "zh" else "Navigation"):
                errors.append(f"{page}: global-navigation landmark")
            expected_open = "打开导航" if locale == "zh" else "Open navigation"
            if len(parser.togglers) != 1 or parser.togglers[0].get("aria-controls") != "navbarCollapse" or parser.togglers[0].get("aria-expanded") != "false" or parser.togglers[0].get("aria-label") != expected_open or "data-bs-toggle" in parser.togglers[0]:
                errors.append(f"{page}: global-navigation trigger")
            close_label = "关闭导航" if locale == "zh" else "Close navigation"
            if parser.nodes.get("kt-global-nav-close", (None, {}))[1].get("aria-label") != close_label:
                errors.append(f"{page}: global-navigation close")
            brand = re.findall(r'<div id="kt-publication-brand">.*?</div>', html, re.S)
            edition = "攻略 · Public v0.57a" if locale == "zh" else "Guide · Public v0.57a"
            if (len(brand) != 1 or '<span class="kt-brand-name">Killigan’s Treasure</span>' not in brand[0]
                    or f'<span class="kt-brand-edition">{edition}</span>' not in brand[0]
                    or not re.search(r'<button class="navbar-toggler"[^>]*>.*?</button>\s*<div id="kt-publication-brand">', html, re.S)):
                errors.append(f"{page}: publication identity")
            language_label = "切换到英文" if locale == "zh" else "Switch to Chinese"
            language_links = re.findall(r'<a class="nav-link kt-language-utility"[^>]*>.*?</a>', html, re.S)
            if len(language_links) != 1 or f'aria-label="{language_label}"' not in language_links[0] or 'class="kt-language-icon"' not in language_links[0]:
                errors.append(f"{page}: single language utility with globe and accessible label")
            if len(parser.global_links) != len(PAGES) or len(set(parser.global_links)) != len(PAGES):
                errors.append(f"{page}: expected one global navigation tree with {len(PAGES)} unique destinations, got {len(parser.global_links)}")
            if not any(asset.endswith("assets/kt-foundation.css") for asset in parser.assets):
                errors.append(f"{page}: foundation asset missing")
            if not any("kt-language" in asset for asset in parser.assets) and "navbar-nav-scroll ms-auto" not in html:
                errors.append(f"{page}: language navigation missing")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Page TOC/global navigation static contract: PASS pages={2 * len(PAGES)} one tree each TOC-links={links}")


if __name__ == "__main__":
    main()
