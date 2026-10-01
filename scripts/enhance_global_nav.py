#!/usr/bin/env python3
"""Turn Quarto's one navbar tree into the narrow global-navigation drawer."""

import os
import re
from pathlib import Path

from verify_render import OUTPUT, PAGES


TOGGLER = re.compile(r'<button class="navbar-toggler"[^>]*>')
COLLAPSE = '<div class="collapse navbar-collapse" id="navbarCollapse">'
END_COLLAPSE = '</div> <!-- /navcollapse -->'


def once(text, old, new, page):
    count = text.count(old)
    if count != 1:
        raise ValueError(f"{page}: expected one {old[:60]!r}, found {count}")
    return text.replace(old, new, 1)


def enhance(text, page, locale):
    if 'id="kt-global-nav-close"' in text:
        if all(f'id="{name}"' in text for name in ("kt-global-nav-backdrop", "navbarCollapse")):
            return text
        raise ValueError(f"{page}: partial global-navigation controls")

    zh = locale == "zh"
    title = "导航" if zh else "Navigation"
    close = "关闭导航" if zh else "Close navigation"
    open_label = "打开导航" if zh else "Open navigation"
    match = TOGGLER.search(text)
    if not match or len(TOGGLER.findall(text)) != 1:
        raise ValueError(f"{page}: expected one navbar toggler")
    toggler = match.group(0)
    if 'aria-controls="navbarCollapse"' not in toggler:
        raise ValueError(f"{page}: navbar toggler target changed")
    new_toggler = toggler.replace(' data-bs-toggle="collapse"', '').replace(' data-bs-target="#navbarCollapse"', '')
    new_toggler = new_toggler.replace(' role="menu"', '').replace('aria-label="Toggle navigation"', f'aria-label="{open_label}"')
    new_toggler = new_toggler.replace('aria-label="展开或折叠导航栏"', f'aria-label="{open_label}"')
    text = once(text, toggler, new_toggler, page)

    edition = "攻略 · Public v0.57a" if zh else "Guide · Public v0.57a"
    brand = ('<div id="kt-publication-brand">'
             '<span class="kt-brand-name">Killigan’s Treasure</span>'
             f'<span class="kt-brand-edition">{edition}</span></div>')
    text = once(text, '</button>\n          ' + COLLAPSE,
                '</button>\n          ' + brand + '\n          ' + COLLAPSE, page)

    toolbar = (f'<div id="kt-global-nav-toolbar">'
               f'<span id="kt-global-nav-title">{title}</span>'
               f'<button id="kt-global-nav-close" type="button" aria-label="{close}" title="{close}">'
               '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" '
               'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">'
               '<path d="M5 5l14 14M19 5L5 19"/></svg></button></div>')
    text = once(text, COLLAPSE, COLLAPSE.replace('id="navbarCollapse"',
        f'id="navbarCollapse" role="navigation" aria-label="{title}"') + '\n' + toolbar, page)
    text = once(text, END_COLLAPSE,
                END_COLLAPSE + '\n<div id="kt-global-nav-backdrop" aria-hidden="true"></div>', page)
    language = re.findall(r'<ul class="navbar-nav navbar-nav-scroll ms-auto">.*?</ul>', text, re.S)
    if len(language) != 1:
        raise ValueError(f"{page}: expected one language link list, found {len(language)}")
    language_label = "切换到英文" if zh else "Switch to Chinese"
    globe = ('<svg class="kt-language-icon" viewBox="0 0 24 24" width="17" height="17" '
             'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" '
             'stroke-linejoin="round" aria-hidden="true" focusable="false">'
             '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-2.5 2.4-3.8 5.4-3.8 9s1.3 6.6 3.8 9'
             'M12 3c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9"/></svg>')
    updated_language = once(language[0], '<a class="nav-link" ',
                            f'<a class="nav-link kt-language-utility" aria-label="{language_label}" ', page)
    updated_language = once(updated_language, '<span class="menu-text">',
                            globe + '<span class="menu-text">', page)
    text = once(text, language[0], updated_language, page)
    src = Path(os.path.relpath(OUTPUT / "assets" / "kt-global-nav.js", page.parent)).as_posix()
    text = once(text, '</body>', f'<script src="{src}"></script>\n</body>', page)
    return text


def main():
    changed = 0
    for locale, prefix in (("zh", ""), ("en", "en/")):
        for route in PAGES:
            page = OUTPUT / prefix / f"{route}.html"
            original = page.read_text(encoding="utf-8")
            updated = enhance(original, page, locale)
            if updated != original:
                page.write_text(updated, encoding="utf-8")
                changed += 1
    print(f"Global navigation drawer: pages={2 * len(PAGES)} changed={changed}")


if __name__ == "__main__":
    main()
