#!/usr/bin/env python3
"""Verify the bilingual navbar in the assembled Quarto site."""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


OUTPUT = Path(__file__).resolve().parents[1] / "_site"
EXPECTED = {
    "zh": (
        ("首页", "index.html"),
        ("旅程", (
            ("红根镇 / 红根镇荒野", "guide/redroot.html"),
            ("阿瑞斯", "guide/aris.html"),
            ("水晶平原 / ??? / 盾落谷", "guide/crystal-plains-shieldfall.html"),
            ("斯派斯港", "guide/spiceport.html"),
            ("蓝叶森林", "guide/blueleaf-grove.html"),
        )),
        ("参考", (
            ("关系发展", "reference/relationships.html"),
            ("性格", "reference/personality.html"),
            ("战斗与 QTE", "reference/combat.html"),
        )),
        ("收集", (
            ("回忆与画面", "collectibles/memories.html"),
            ("装备与物品", "collectibles/equipment.html"),
            ("Dressing Room", "collectibles/dressing-room.html"),
            ("图鉴", "collectibles/codex.html"),
        )),
        ("帮助", "help.html"),
    ),
    "en": (
        ("Home", "index.html"),
        ("Journey", (
            ("Redroot / Redroot Wilds", "guide/redroot.html"),
            ("Aris", "guide/aris.html"),
            ("Crystal Plains / ??? / Shieldfall Vale", "guide/crystal-plains-shieldfall.html"),
            ("Spiceport", "guide/spiceport.html"),
            ("Blueleaf Grove", "guide/blueleaf-grove.html"),
        )),
        ("Reference", (
            ("Relationships", "reference/relationships.html"),
            ("Personality", "reference/personality.html"),
            ("Combat & QTEs", "reference/combat.html"),
        )),
        ("Collectibles", (
            ("Memories", "collectibles/memories.html"),
            ("Equipment", "collectibles/equipment.html"),
            ("Dressing Room", "collectibles/dressing-room.html"),
            ("Codex", "collectibles/codex.html"),
        )),
        ("Help", "help.html"),
    ),
}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
PRIVATE_PARTS = {"research", "private-inputs", "runtime", "archive", "editorial"}


class Node:
    def __init__(self, tag, attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.parts = []

    def children(self, tag=None):
        return [part for part in self.parts if isinstance(part, Node) and (tag is None or part.tag == tag)]

    def walk(self):
        yield self
        for child in self.children():
            yield from child.walk()

    def text(self):
        return "".join(part.text() if isinstance(part, Node) else part for part in self.parts)


class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("document")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].parts.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].parts.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        for position in range(len(self.stack) - 1, 0, -1):
            if self.stack[position].tag == tag:
                del self.stack[position:]
                break

    def handle_data(self, data):
        self.stack[-1].parts.append(data)


def classes(node):
    return set(node.attrs.get("class", "").split())


def label(node):
    return re.sub(r"\s+", " ", node.text()).strip()


def leaf_pages(items):
    for _, value in items:
        if isinstance(value, str):
            yield value
        else:
            yield from (page for _, page in value)


def main():
    errors = []
    expected_pages = {Path(prefix + page) for prefix, locale in (("", "zh"), ("en/", "en")) for page in leaf_pages(EXPECTED[locale])}
    expected_pages.update({Path("discussions.html"), Path("en/discussions.html")})
    actual_pages = {path.relative_to(OUTPUT) for path in OUTPUT.rglob("*.html") if "site_libs" not in path.parts and path.name != "404.html"} if OUTPUT.is_dir() else set()
    missing_pages = sorted(expected_pages - actual_pages)
    unexpected_pages = sorted(actual_pages - expected_pages)
    if missing_pages:
        errors.append(f"missing public pages: {missing_pages}")
    if unexpected_pages:
        errors.append(f"unexpected public pages: {unexpected_pages}")

    checked_links = 0
    broken_targets = []
    md_targets = []
    cross_locale = []
    private_targets = []
    nav_pages = Counter()
    toc_pages = 0
    global_sidebars = 0
    active_direct = 0
    inactive_submenu_pages = []

    def check_link(current, href, expected):
        nonlocal checked_links
        checked_links += 1
        parsed = urlsplit(href)
        path = unquote(parsed.path)
        if parsed.scheme or parsed.netloc or not path or parsed.fragment:
            broken_targets.append(f"{current}: {href}")
            return None
        if path.lower().endswith(".md"):
            md_targets.append(f"{current}: {href}")
        target = (OUTPUT / current.parent / path).resolve()
        if not target.is_relative_to(OUTPUT.resolve()):
            private_targets.append(f"{current}: {href}")
            return None
        rel = target.relative_to(OUTPUT.resolve())
        if PRIVATE_PARTS & set(rel.parts):
            private_targets.append(f"{current}: {href}")
        if not target.is_file():
            broken_targets.append(f"{current}: {href}")
        locale = "en" if "en" in current.parts else "zh"
        if ("en" in rel.parts) != (locale == "en"):
            cross_locale.append(f"{current}: {href}")
        intended = Path(("en/" if locale == "en" else "") + expected)
        if rel != intended:
            errors.append(f"wrong navbar destination: {current}: {href} -> {rel}, expected {intended}")
        nav_pages[(locale, current, rel)] += 1
        return rel

    for current in sorted(actual_pages & expected_pages):
        document = Document()
        document.feed((OUTPUT / current).read_text(encoding="utf-8"))
        nodes = list(document.root.walk())
        navbars = [node for node in nodes if node.tag == "nav" and "navbar" in classes(node)]
        if len(navbars) != 1:
            errors.append(f"expected one navbar on {current}, found {len(navbars)}")
            continue
        global_sidebars += sum(node.attrs.get("id") == "quarto-sidebar" or "sidebar-navigation" in classes(node) for node in nodes)
        toc = [node for node in nodes if node.tag == "nav" and node.attrs.get("id") == "TOC"]
        expected_toc = 0 if current.stem in {"index", "discussions"} else 1
        if len(toc) != expected_toc:
            errors.append(f"expected page TOC on {current}, found {len(toc)}")
        elif toc:
            toc_pages += 1
        lists = [node for node in navbars[0].walk() if node.tag == "ul" and "navbar-nav" in classes(node) and "me-auto" in classes(node)]
        if len(lists) != 1:
            errors.append(f"expected one navbar item list on {current}, found {len(lists)}")
            continue
        top_items = lists[0].children("li")
        locale = "en" if "en" in current.parts else "zh"
        expected_items = EXPECTED[locale]
        if len(top_items) != len(expected_items):
            errors.append(f"navbar group count on {current}: {len(top_items)} != {len(expected_items)}")
            continue
        for item, (expected_label, value) in zip(top_items, expected_items):
            links = item.children("a")
            if len(links) != 1:
                errors.append(f"navbar group link count on {current}: {expected_label}")
                continue
            top_link = links[0]
            if label(top_link) != expected_label:
                errors.append(f"navbar label/order on {current}: {label(top_link)!r} != {expected_label!r}")
            menus = [node for node in item.children("ul") if "dropdown-menu" in classes(node)]
            if isinstance(value, str):
                if menus:
                    errors.append(f"unexpected submenu on {current}: {expected_label}")
                target = check_link(current, top_link.attrs.get("href", ""), value)
                active = top_link.attrs.get("aria-current") == "page" and "active" in classes(top_link)
                if target == current and active:
                    active_direct += 1
                elif target == current:
                    errors.append(f"direct current page lacks active navbar state: {current}")
                elif active:
                    errors.append(f"wrong direct navbar item active on {current}: {expected_label}")
            else:
                if top_link.attrs.get("href") != "#" or len(menus) != 1:
                    errors.append(f"dropdown structure changed on {current}: {expected_label}")
                    continue
                children = menus[0].children("li")
                if len(children) != len(value):
                    errors.append(f"submenu count on {current}: {expected_label}: {len(children)} != {len(value)}")
                for child, (child_label, child_page) in zip(children, value):
                    child_links = child.children("a")
                    if len(child_links) != 1:
                        errors.append(f"submenu link count on {current}: {expected_label} / {child_label}")
                        continue
                    link = child_links[0]
                    if label(link) != child_label:
                        errors.append(f"submenu label/order on {current}: {label(link)!r} != {child_label!r}")
                    target = check_link(current, link.attrs.get("href", ""), child_page)
                    active = link.attrs.get("aria-current") == "page" or "active" in classes(link)
                    if active and target != current:
                        errors.append(f"wrong submenu item active on {current}: {child_label}")
                    elif target == current and not active:
                        inactive_submenu_pages.append(str(current))
        expected_for_locale = {Path(("en/" if locale == "en" else "") + page) for page in leaf_pages(expected_items)}
        actual_for_page = Counter({rel: count for (loc, page, rel), count in nav_pages.items() if loc == locale and page == current})
        if set(actual_for_page) != expected_for_locale or any(count != 1 for count in actual_for_page.values()):
            errors.append(f"navbar page coverage differs on {current}")

    if global_sidebars:
        errors.append(f"global site sidebars found: {global_sidebars}")
    for name, items in (("broken targets", broken_targets), (".md targets", md_targets), ("cross-locale targets", cross_locale), ("private targets", private_targets)):
        if items:
            errors.append(name + ": " + ", ".join(items))
    print(f"pages: ZH={sum('en' not in path.parts for path in actual_pages)} EN={sum('en' in path.parts for path in actual_pages)} missing={len(missing_pages)} unexpected={len(unexpected_pages)}")
    print(f"navbar: links={checked_links} broken={len(broken_targets)} .md={len(md_targets)} cross-locale={len(cross_locale)} private={len(private_targets)}")
    zh_covered = {rel for locale, _, rel in nav_pages if locale == "zh"}
    en_covered = {rel for locale, _, rel in nav_pages if locale == "en"}
    print(f"coverage: ZH={len(zh_covered)} EN={len(en_covered)}; Journey order checked on every page")
    print(f"sidebar: global={global_sidebars}; page TOC={toc_pages}/{len(expected_pages)}")
    direct_total = sum(isinstance(value, str) for entries in EXPECTED.values() for _, value in entries)
    submenu_total = sum(len(value) for entries in EXPECTED.values() for _, value in entries if not isinstance(value, str))
    print(f"active: direct pages={active_direct}/{direct_total}; submenu pages without Quarto active marker={len(inactive_submenu_pages)}/{submenu_total}")
    if inactive_submenu_pages:
        print("navigation warning: Quarto did not mark dropdown destination pages active")
    if errors:
        for error in errors:
            print("ERROR:", error, file=sys.stderr)
        return 1
    print("Navigation contract: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
