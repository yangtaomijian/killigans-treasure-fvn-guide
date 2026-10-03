#!/usr/bin/env python3
"""Build short public search locators from assembled rendered HTML only."""

from collections import Counter
import json
from pathlib import Path
import re

from verify_navigation import Document, classes, label
from memory_identity import memory_identity
from codex_identity import codex_entries


OUTPUT = Path(__file__).resolve().parents[1] / "_site"
TEXT_LIMIT = {"zh": 120, "en": 220}
SKIP_HEADINGS = {"codex-cutoff"}  # Version boundary, not a player lookup topic.
MEMORY_HEADERS = {"顺序", "No."}


def clean(value):
    return re.sub(r"\s+", " ", value).strip()


def brief(value, locale, fallback, skip_version=False):
    """Take a complete public sentence/clause, never a raw long paragraph."""
    value = clean(value)
    parts = [part.strip() for part in re.split(r"(?<=[。；;!?])\s*|(?<=\.)\s+", value) if part.strip()]
    if skip_version and len(parts) > 1 and parts[0].startswith(("适用版本", "For Killigan", "Applies to Killigan")):
        parts = parts[1:]
    candidate = parts[0] if parts else value
    if len(candidate) <= TEXT_LIMIT[locale]:
        return candidate or fallback
    clauses = [part.strip() for part in re.split(r"[，,]", candidate) if part.strip()]
    if clauses and 18 <= len(clauses[0]) <= TEXT_LIMIT[locale]:
        return clauses[0]
    return clean(fallback)


def nodes_with_parent(root):
    yield root, None
    for child in root.children():
        yield from _descendants(child, root)


def _descendants(node, parent):
    yield node, parent
    for child in node.children():
        yield from _descendants(child, node)


def semantic_headings(main):
    """Pair explicit empty <a id> markers with their following visible heading."""
    flat = list(nodes_with_parent(main))
    pairs = {}
    for index, (node, parent) in enumerate(flat):
        if node.tag != "a" or "id" not in node.attrs or parent is None or parent.tag != "p" or label(parent):
            continue
        for heading, section in flat[index + 1:index + 6]:
            if heading.tag in ("h2", "h3", "h4") and section is not None and section.tag == "section":
                pairs[node.attrs["id"]] = (heading, section)
                break
            if heading.tag == "a" and "id" in heading.attrs:
                break
    return pairs


def direct_paragraph(section):
    for child in section.children("p"):
        if "kt-home-eyebrow" in classes(child):
            continue
        value = clean(label(child))
        if value:
            return value
    return ""


def table_header(table):
    row = next((node for node in table.walk() if node.tag == "tr" and node.children("th")), None)
    return [clean(label(cell)) for cell in row.children("th")] if row else []


def memory_rows(main, pairs):
    """Yield native Memory rows in public category and visible order."""
    by_section = {id(section): anchor for anchor, (_, section) in pairs.items()}
    for section in (node for node in main.walk() if node.tag == "section" and "level2" in classes(node)):
        for table in (node for node in section.walk() if node.tag == "table" and table_header(node)[:1] and table_header(node)[0] in MEMORY_HEADERS):
            anchor = by_section.get(id(section))
            if not anchor:
                raise ValueError(f"Memory category lacks explicit anchor: {section.attrs.get('id')}")
            heading = next(node for node in section.children() if node.tag == "h2")
            category = clean(label(heading))
            for position, row in enumerate((node for node in table.walk() if node.tag == "tr" and node.children("td")), 1):
                cells = row.children("td")
                if len(cells) != 3:
                    raise ValueError(f"Memory row shape changed: {category}")
                ordinal, native_title, scene = (clean(label(cell)) for cell in cells)
                if ordinal != str(position):
                    raise ValueError(f"Memory visible order changed: {category}: {ordinal} at row {position}")
                yield row, anchor, category, ordinal, native_title, scene



def equipment_rows(main, pairs):
    """Project complete wearable tables and the separate public supplies table."""
    parents = {id(node): parent for node, parent in nodes_with_parent(main)}
    for block in (n for n in main.walk() if classes(n) &
                  {"kt-equipment-completion", "kt-equipment-automatic"}):
        region = parents[id(block)]
        while region is not None and region.tag != "section":
            region = parents[id(region)]
        heading = next(n for n in region.children() if n.tag == "h2")
        region_name = clean(label(heading))
        table = next(n for n in block.walk() if n.tag == "table")
        headers = table_header(table)

        def column(*names):
            matches = [index for index, header in enumerate(headers) if header in names]
            if len(matches) != 1:
                raise ValueError(f"Equipment header missing or ambiguous: {names}: {headers}")
            return matches[0]

        item_col = column("装备", "Item")
        category_col = column("类别", "Category")
        stats_col = column("Stats")
        acquisition_col = column("时机／取得方式", "When / how", "自动取得时机", "When received")
        detail_col = column("详情", "Detail") if "kt-equipment-completion" in classes(block) else None
        for row in (n for n in table.walk() if n.tag == "tr" and n.children("td")):
            cells = row.children("td")
            if len(cells) != len(headers):
                raise ValueError(f"Equipment row/header shape differs: {region_name}")
            marker = next(n for n in cells[item_col].walk() if n.tag == "span" and
                          n.attrs.get("id", "").startswith("equipment-item-"))
            item_anchor = marker.attrs["id"]
            name = clean(label(marker))
            detail = next((n.attrs["href"][1:] for n in cells[detail_col].walk()
                           if n.tag == "a" and n.attrs.get("href", "").startswith("#")), None) if detail_col is not None else None
            anchor = ("aris-story-equipment" if "kt-equipment-automatic" in classes(block)
                      else detail or region.attrs["id"])
            locator = f"{name} · {clean(label(cells[category_col]))} · {clean(label(cells[stats_col]))} · {region_name}"
            yield f"equipment:{item_anchor}", anchor, locator, clean(label(cells[acquisition_col]))
    section = pairs["practical-items"][1]
    for row in (n for n in section.walk() if n.tag == "tr" and n.children("td")):
        cells = row.children("td")
        native_name = next(n for n in cells[1].walk() if n.tag == "strong")
        name = clean(label(native_name))
        index = ("Repair Hammer", "Rations", "Foragemeal", "Bedroll", "Arcanics Scroll").index(name.split("（")[0]) + 1
        yield f"equipment:practical-items:{index}", "practical-items", name, clean(label(row))


def trailmarker_rows(main):
    """Bounded projection of the nine visible Help rows; no new targets or types."""
    expected = ["PROLOGUE", "THE SPARK", "THE LESSONS", "THE BEASTSLAYER",
                "THE PURSUIT", "THE DREADSTONE", "???", "THE CATALYST", "THE THRUST"]
    blocks = [n for n in main.walk() if "kt-trailmarker-baselines" in classes(n)]
    if len(blocks) != 1:
        raise ValueError("Help requires exactly one Trailmarker baseline table")
    rows = [n for n in blocks[0].walk() if n.tag == "tr" and n.children("td")]
    titles = [clean(label(row.children("td")[0])) for row in rows]
    if titles != expected:
        raise ValueError(f"Trailmarker public rows changed: {titles}")
    for row, title in zip(rows, titles):
        cells = row.children("td")
        if len(cells) != 5:
            raise ValueError(f"Trailmarker baseline row shape changed: {title}")
        slug = "vision" if title == "???" else title.lower().replace(" ", "-")
        # Preserve the numeric baseline even when the start has two sentences
        # (CATALYST distinguishes the menu destination from the first HUD).
        start = clean(label(cells[1]))
        stats = clean(label(cells[2]))
        state = re.split(r"[。.;]", clean(label(cells[4])))[0]
        baseline = f"{start.rstrip('.。')} · {stats} · Ouros {clean(label(cells[3]))}"
        yield f"trailmarker:{slug}", title, baseline, state


def content_pages(root, locale):
    for path in sorted(root.rglob("*.html")):
        rel = path.relative_to(root)
        if rel.as_posix() in {"404.html"} or "site_libs" in rel.parts or (locale == "zh" and rel.parts[0] == "en"):
            continue
        yield path, rel.as_posix()


def build_locale(locale):
    root = OUTPUT / ("en" if locale == "en" else "")
    records = []
    public_names = {}
    seen_pages = 0
    for path, route in content_pages(root, locale):
        document = Document()
        document.feed(path.read_text(encoding="utf-8"))
        main = next((node for node in document.root.walk() if node.tag == "main" and node.attrs.get("id") == "quarto-document-content"), None)
        if main is None:
            raise ValueError(f"Missing public main: {path}")
        title_node = next((node for node in main.walk() if node.tag == "h1"), None)
        level1 = next((node for node in main.walk() if node.tag == "section" and "level1" in classes(node)), None)
        if title_node is None or level1 is None:
            raise ValueError(f"Missing page title/content: {path}")
        title = clean(label(title_node))
        intro = direct_paragraph(level1)
        if route == "reference/combat.html":
            # Its version line is a separate paragraph after the editorial pass.
            intro = next((clean(label(p)) for p in level1.children("p")
                          if clean(label(p)) and not clean(label(p)).startswith(
                              ("适用版本", "Applies to Killigan"))), intro)
        records.append(dict(objectID=route, href=route, title=title, section="",
                            text=brief(intro, locale, title, skip_version=True), type="page"))
        seen_pages += 1

        pairs = semantic_headings(main)
        parent_nodes = {id(node): parent for node, parent in nodes_with_parent(main)}
        for anchor, (heading, section) in pairs.items():
            if anchor in SKIP_HEADINGS:
                continue
            heading_text = clean(label(heading))
            if route == "reference/combat.html" and (heading.tag == "h3" or not section.children("section")):
                parent_section = parent_nodes.get(id(section))
                regional_heading = next(iter(parent_section.children("h2")), None) if parent_section else None
                if regional_heading is not None:
                    heading_text = clean(label(regional_heading)) + " · " + heading_text
                # Project native actions and Echo names from this public section.
                # No independent gameplay vocabulary or private evidence enters Search.
                choices = list(dict.fromkeys(clean(label(node)) for node in section.walk()
                               if node.tag == "code" or (anchor == "combat-echo" and node.tag == "strong" and "Echo" in label(node))))
                if choices:
                    heading_text += " · " + " / ".join(choices)
            records.append(dict(objectID=f"{route}#{anchor}", href=f"{route}#{anchor}", title=title,
                                section=heading_text,
                                text=brief(direct_paragraph(section), locale, heading_text), type="section"))

        if route == "help.html":
            for object_id, native_title, baseline, state in trailmarker_rows(main):
                preview = f"{baseline} · {state}"
                if len(preview) > TEXT_LIMIT[locale]:
                    preview = baseline
                if len(preview) > TEXT_LIMIT[locale]:
                    raise ValueError(f"Trailmarker preview needs a shorter public start: {native_title}")
                records.append(dict(objectID=object_id, href="help.html#help-trailmarkers", title=title,
                                    section=f"Trailmarker · {native_title}",
                                    text=preview, type="section"))

        if route == "collectibles/equipment.html":
            for section in (n for n in main.walk() if n.tag == "section" and
                            n.attrs.get("id", "").startswith("equipment-") and
                            n.attrs.get("id") not in {"equipment-state-care", "equipment-automatic"}):
                heading = next(iter(section.children("h2")), None)
                if heading is not None:
                    anchor = section.attrs["id"]
                    heading_text = clean(label(heading))
                    records.append(dict(objectID=f"{route}#{anchor}", href=f"{route}#{anchor}",
                                        title=title, section=heading_text,
                                        text=brief(direct_paragraph(section), locale, heading_text), type="section"))
            for object_id, anchor, name, prose in equipment_rows(main, pairs):
                records.append(dict(objectID=object_id, href=f"{route}#{anchor}", title=title,
                                    section=f"Equipment · {name}",
                                    text=brief(prose, locale, name), type="equipment"))

        if route == "collectibles/memories.html":
            for row, anchor, category, ordinal, native_title, scene in memory_rows(main, pairs):
                object_id, row_id = memory_identity(anchor, ordinal)
                if row.attrs.get("id") != row_id:
                    raise ValueError(f"Memory row ID missing or mismatched: {object_id}")
                records.append(dict(objectID=object_id, href=f"{route}#{row_id}",
                                    title=title, section=f"{category} · {ordinal}. {native_title}",
                                    text=brief(scene, locale, native_title), type="memory"))

        if route == "collectibles/dressing-room.html":
            inventory = json.loads((OUTPUT / 'assets/kt-dressing-room.json').read_text())
            for item in inventory['items']:
                targets = [node for node in main.walk() if node.attrs.get('id') == item['anchor']]
                if len(targets) != 1:
                    raise ValueError(f"Outfit target missing: {item['anchor']}")
                identity = f"outfit:{item['character']}:{item['category']}:{item['visibleValue']}"
                name = f"{item['characterName']} · {item['categoryName']} · {item['visibleValue']}"
                # The F02 recovery window is the useful short answer for these
                # routes. Project the same public route text, with no new facts.
                preview = item['recovery'][locale] if item['route'] in {'marchanide', 'spice-shop'} else item['publicUnlockText'][locale]
                records.append(dict(objectID=identity, href=f"{route}#{item['anchor']}", title=title,
                                    section=name, text=brief(preview, locale, name), type='outfit'))

        if route == "collectibles/codex.html":
            for entry in codex_entries(main, pairs):
                targets = [node for node in entry.cell.children("span") if node.attrs.get("id") == entry.fragment]
                if len(targets) != 1 or label(targets[0]) != entry.name:
                    raise ValueError(f"Codex entry target missing or mismatched: {entry.object_id}")
                public_names[entry.object_id] = entry.name
                records.append(dict(objectID=entry.object_id, href=f"{route}#{entry.fragment}", title=title,
                                    section=f"{entry.category} · {entry.name}",
                                    text=brief(f"{entry.first_header}: {entry.context}", locale, entry.name), type="codex"))

    if seen_pages != 14:
        raise ValueError(f"Expected 14 indexed {locale} pages, found {seen_pages}")
    if Counter(record["type"] for record in records)["memory"] != 87 or Counter(record["type"] for record in records)["codex"] != 56:
        raise ValueError(f"Public collection count changed in {locale}")
    return records, public_names


def main():
    zh, zh_names = build_locale("zh")
    en, en_names = build_locale("en")
    if set(zh_names) != set(en_names):
        raise ValueError("Codex public category/order identities differ between locales")
    for object_id in zh_names:
        if zh_names[object_id].casefold() != en_names[object_id].casefold():
            raise ValueError(f"Codex native name differs across locales: {object_id}")
    for locale, records in (("ZH", zh), ("EN", en)):
        output = OUTPUT / ("en/" if locale == "EN" else "") / "kt-search.json"
        temporary = output.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(output)
        print(f"{locale} controlled index: {dict(Counter(record['type'] for record in records))} total={len(records)}")


if __name__ == "__main__":
    main()
