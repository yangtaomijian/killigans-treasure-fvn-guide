#!/usr/bin/env python3
"""Verify route-based breadcrumbs and the ordinary-page title structure."""

from html import unescape
from pathlib import Path
import os
import re

from enhance_hierarchy import PAGE_LABELS, CATEGORY_LABELS, HOME_EYEBROW
from verify_render import OUTPUT, PAGES


MAIN_RE = re.compile(
    r'<main class="content" id="quarto-document-content">\s*'
    r'<header id="title-block-header" class="quarto-title-block"></header>\s*'
    r'<section id="[^"]+" class="([^"]+)">\s*'
    r'(?:(<p class="kt-home-eyebrow">([^<]+)</p>)\s*)?'
    r'(?:(<nav class="kt-page-breadcrumb" aria-label="([^"]+)">'
    r'<ol>(.*?)</ol></nav>)\s*)?'
    r'<h1\b[^>]*>.*?</h1>\s*<p\b[^>]*>.*?</p>', re.S,
)
LINK_RE = re.compile(r'<li><a href="([^"]+)">([^<]+)</a></li>')
CURRENT_RE = re.compile(r'<li aria-current="page">([^<]+)</li>')


def main() -> None:
    errors = []
    checked = 0
    for locale, prefix in (("zh", ""), ("en", "en/")):
        label_index = 0 if locale == "zh" else 1
        for route in PAGES:
            page = OUTPUT / prefix / f"{route}.html"
            html = page.read_text(encoding="utf-8")
            match = MAIN_RE.search(html)
            if not match:
                errors.append(f"{page}: missing title/intro structure")
                continue
            classes, eyebrow, eyebrow_text, nav, landmark, items = match.groups()
            nav_count = html.count('class="kt-page-breadcrumb"')
            if route == "index":
                if (nav_count or nav or "kt-ordinary-page" in classes.split()
                        or "kt-home-page" not in classes.split()
                        or html.count('class="kt-home-eyebrow"') != 1
                        or not eyebrow or eyebrow_text != HOME_EYEBROW[locale]):
                    errors.append(f"{page}: Home eyebrow/title structure")
                continue
            checked += 1
            if (nav_count != 1 or not nav or "kt-ordinary-page" not in classes.split()
                    or eyebrow or "kt-home-page" in classes.split()):
                errors.append(f"{page}: ordinary breadcrumb count/placement")
                continue
            if landmark != ("路径导航" if locale == "zh" else "Breadcrumb"):
                errors.append(f"{page}: breadcrumb landmark label")
            current = [unescape(text) for text in CURRENT_RE.findall(items)]
            if current != [PAGE_LABELS[route][label_index]]:
                errors.append(f"{page}: current route label")
            category = route.split("/", 1)[0]
            links = LINK_RE.findall(items)
            if category in CATEGORY_LABELS:
                home = OUTPUT / prefix / "index.html"
                expected_href = Path(os.path.relpath(home, page.parent)).as_posix()
                if links != [(expected_href, CATEGORY_LABELS[category][label_index])]:
                    errors.append(f"{page}: category link")
                if not (page.parent / unescape(expected_href)).is_file():
                    errors.append(f"{page}: category target missing")
            elif links:
                errors.append(f"{page}: unexpected direct-page link")
            if len(CURRENT_RE.findall(nav)) != 1:
                errors.append(f"{page}: current page breadcrumb cardinality")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Publication hierarchy: ordinary={checked}/{2 * (len(PAGES) - 1)} home=2/2 PASS")


if __name__ == "__main__":
    main()
