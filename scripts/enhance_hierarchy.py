#!/usr/bin/env python3
"""Add route-based page context to rendered ordinary pages."""

from html import escape
from pathlib import Path
import os
import re

from verify_render import OUTPUT, PAGES


# Route keys, rather than rendered headings, determine the breadcrumb.
PAGE_LABELS = {
    "discussions": ("全站讨论", "All guide discussions"),
    "help": ("帮助", "Help"),
    "guide/redroot": ("红根镇 / 红根镇荒野", "Redroot / Redroot Wilds"),
    "guide/aris": ("阿瑞斯", "Aris"),
    "guide/crystal-plains-shieldfall": ("水晶平原 / ??? / 盾落谷", "Crystal Plains / ??? / Shieldfall Vale"),
    "guide/spiceport": ("斯派斯港", "Spiceport"),
    "guide/blueleaf-grove": ("蓝叶森林", "Blueleaf Grove"),
    "reference/relationships": ("关系发展", "Relationships"),
    "reference/personality": ("性格", "Personality"),
    "reference/combat": ("战斗与 QTE", "Combat & QTEs"),
    "collectibles/memories": ("回忆与画面", "Memories / CG"),
    "collectibles/equipment": ("装备与物品", "Equipment"),
    "collectibles/dressing-room": ("Dressing Room", "Dressing Room"),
    "collectibles/codex": ("图鉴", "Codex"),
}
CATEGORY_LABELS = {
    "guide": ("旅程", "Journey"),
    "reference": ("参考", "Reference"),
    "collectibles": ("收集", "Collectibles"),
}
HOME_EYEBROW = {
    "zh": "非官方玩家攻略 · PUBLIC v0.57a",
    "en": "UNOFFICIAL PLAYER GUIDE · PUBLIC v0.57a",
}
MAIN_SECTION_RE = re.compile(
    r'(<main class="content" id="quarto-document-content">\s*'
    r'<header id="title-block-header" class="quarto-title-block"></header>\s*'
    r'<section id="[^"]+" class=")level1(">\s*)(<h1\b)'
)


def breadcrumb(route: str, locale: str, page: Path) -> str:
    locale_index = 0 if locale == "zh" else 1
    items = []
    category = route.split("/", 1)[0]
    if category in CATEGORY_LABELS:
        home = OUTPUT / ("en" if locale == "en" else "") / "index.html"
        href = Path(os.path.relpath(home, page.parent)).as_posix()
        label = escape(CATEGORY_LABELS[category][locale_index])
        items.append(f'<li><a href="{escape(href, quote=True)}">{label}</a></li>')
    items.append(f'<li aria-current="page">{escape(PAGE_LABELS[route][locale_index])}</li>')
    name = "路径导航" if locale == "zh" else "Breadcrumb"
    return (f'<nav class="kt-page-breadcrumb" aria-label="{name}">'
            f'<ol>{"".join(items)}</ol></nav>')


def enhance(html: str, route: str, locale: str, page: Path) -> str:
    if route == "index":
        marker = 'class="kt-home-eyebrow"'
        home_class = 'class="level1 kt-home-page"'
        if marker in html or home_class in html:
            if html.count(marker) == 1 and html.count(home_class) == 1:
                return html
            raise ValueError(f"{page}: partial Home hierarchy enhancement")
        eyebrow = f'<p class="kt-home-eyebrow">{escape(HOME_EYEBROW[locale])}</p>'
        updated, count = MAIN_SECTION_RE.subn(
            lambda match: f'{match[1]}level1 kt-home-page{match[2]}{eyebrow}\n{match[3]}', html
        )
        if count != 1:
            raise ValueError(f"{page}: expected one Home title section, found {count}")
        return updated
    if 'class="kt-page-breadcrumb"' in html or 'class="level1 kt-ordinary-page"' in html:
        if html.count('class="kt-page-breadcrumb"') == 1 and html.count('class="level1 kt-ordinary-page"') == 1:
            return html
        raise ValueError(f"{page}: partial hierarchy enhancement")
    nav = breadcrumb(route, locale, page)
    updated, count = MAIN_SECTION_RE.subn(
        lambda match: f'{match[1]}level1 kt-ordinary-page{match[2]}{nav}\n{match[3]}', html
    )
    if count != 1:
        raise ValueError(f"{page}: expected one ordinary title section, found {count}")
    return updated


def main() -> None:
    if set(PAGE_LABELS) != set(PAGES) - {"index"}:
        raise ValueError("breadcrumb route labels differ from public page routes")
    changed = 0
    for locale, prefix in (("zh", ""), ("en", "en/")):
        for route in PAGES:
            page = OUTPUT / prefix / f"{route}.html"
            original = page.read_text(encoding="utf-8")
            updated = enhance(original, route, locale, page)
            if updated != original:
                page.write_text(updated, encoding="utf-8")
                changed += 1
    print(f"Publication hierarchy: pages={2 * len(PAGES)} changed={changed}")


if __name__ == "__main__":
    main()
