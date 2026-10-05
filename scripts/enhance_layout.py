#!/usr/bin/env python3
"""Attach one responsive control to Quarto's existing page-local TOC."""

from pathlib import Path
import os
import re

from verify_render import OUTPUT, PAGES


TOC_TITLE_RE = re.compile(r'(<h2\b[^>]*\bid="toc-title"[^>]*>)[^<]*(</h2>)')


def once(text, old, new, page):
    count = text.count(old)
    if count != 1:
        raise ValueError(f"{page}: expected one {old[:60]!r}, found {count}")
    return text.replace(old, new, 1)


def enhance(text, page, locale):
    zh = locale == "zh"
    label = "本页目录" if zh else "On this page"
    text, title_count = TOC_TITLE_RE.subn(lambda match: f"{match[1]}{label}{match[2]}", text)
    has_toc = title_count == 1
    if title_count not in (0, 1) or (not has_toc and page.stem not in {"index", "discussions"}):
        raise ValueError(f"{page}: expected one TOC title, found {title_count}")

    # KT owns this left rail and mobile drawer. Quarto's native right-margin
    # manager folds #quarto-margin-sidebar around any visible aside/column
    # content, cloning #TOC and its IDs. Keep the native TOC for scrollspy,
    # but give its container independent ownership before Quarto initializes.
    if has_toc:
        text = text.replace('id="quarto-margin-sidebar"', 'id="kt-page-toc-panel"')
        text = text.replace('aria-controls="quarto-margin-sidebar"', 'aria-controls="kt-page-toc-panel"')

    if 'id="kt-theme-controls"' in text and not has_toc:
        return text
    if 'id="kt-page-toc-trigger"' in text:
        if all(f'id="{name}"' in text for name in ("kt-page-toc-close", "kt-page-toc-backdrop")):
            return text
        raise ValueError(f"{page}: partial page-TOC controls")

    visible = "本页" if zh else "Page"
    close = "关闭" if zh else "Close"
    trigger = (f'<button id="kt-page-toc-trigger" type="button" aria-controls="kt-page-toc-panel" '
               f'aria-expanded="false" aria-label="{label}">{visible}</button>')
    if has_toc:
        text = once(text, '<div class="quarto-navbar-tools">',
                    f'<div class="quarto-navbar-tools">\n{trigger}', page)
    auto_text = "自动" if zh else "Auto"
    auto_label = "跟随系统外观" if zh else "Follow system appearance"
    group_label = "外观" if zh else "Appearance"
    native = re.compile(r'<a\b[^>]*class="quarto-color-scheme-toggle[^>]*>.*?</a>', re.S)
    text, theme_count = native.subn(
        lambda match: f'<div id="kt-theme-controls" role="group" aria-label="{group_label}">'
        f'{match[0]}<button id="kt-theme-auto" type="button" aria-label="{auto_label}" '
        f'title="{auto_label}" aria-pressed="true">{auto_text}</button></div>', text)
    if theme_count != 1:
        raise ValueError(f"{page}: expected one native theme toggle, found {theme_count}")

    aside = '<div id="kt-page-toc-panel" class="sidebar margin-sidebar">'
    controls = (f'<div id="kt-page-toc-backdrop" aria-hidden="true"></div>\n{aside}\n'
                f'<button id="kt-page-toc-close" type="button" aria-label="{close}">{close}</button>')
    if has_toc:
        text = once(text, aside, controls, page)
    toc = '<nav id="TOC" role="doc-toc" class="toc-active">'
    if has_toc:
        text = once(text, toc, f'<nav id="TOC" role="doc-toc" class="toc-active" aria-label="{label}">', page)

    script = OUTPUT / "assets" / "kt-page-toc.js"
    src = Path(os.path.relpath(script, page.parent)).as_posix()
    text = once(text, "</body>", f'<script src="{src.replace("kt-page-toc.js", "kt-theme.js")}"></script>\n<script src="{src}"></script>\n<script src="{src.replace("kt-page-toc.js", "kt-adaptive-tables.js")}"></script>\n</body>', page)
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
    print(f"Page TOC shell: pages={2 * len(PAGES)} changed={changed}")


if __name__ == "__main__":
    main()
