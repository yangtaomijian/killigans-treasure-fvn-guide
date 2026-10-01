"""Public Codex entry identities from rendered category tables."""

from dataclasses import dataclass
import re

from verify_navigation import classes, label


CODEX_HEADERS = {"游戏内条目", "In-game entry"}


@dataclass(frozen=True)
class CodexEntry:
    table: object
    row: object
    cell: object
    anchor: str
    category: str
    position: int
    name: str
    name_index: int
    names_in_row: int
    first_header: str
    context: str
    object_id: str
    fragment: str


def codex_identity(anchor, position):
    """Keep the search objectID and its matching public entry fragment."""
    if not re.fullmatch(r"codex-[a-z0-9-]+", anchor) or not isinstance(position, int) or position < 1:
        raise ValueError(f"Invalid public Codex identity: {anchor!r} {position!r}")
    return f"codex:{anchor}:{position}", f"{anchor}-{position}"


def codex_entries(main, pairs):
    """Expand each visible native name, preserving its original table row."""
    by_section = {id(section): anchor for anchor, (_, section) in pairs.items()}
    for section in (node for node in main.walk() if node.tag == "section" and "level2" in classes(node)):
        for table in (node for node in section.walk() if node.tag == "table"):
            header_row = next((row for row in table.walk() if row.tag == "tr" and row.children("th")), None)
            headers = [label(cell) for cell in header_row.children("th")] if header_row else []
            if not headers or headers[0] not in CODEX_HEADERS:
                continue
            if len(headers) != 4:
                raise ValueError("Codex table header shape changed")
            anchor = by_section.get(id(section))
            if not anchor:
                raise ValueError(f"Codex category lacks explicit anchor: {section.attrs.get('id')}")
            heading = next(node for node in section.children() if node.tag == "h2")
            category = label(heading)
            position = 0
            for row in (node for node in table.walk() if node.tag == "tr" and node.children("td")):
                cells = row.children("td")
                if len(cells) != 4:
                    raise ValueError(f"Codex row shape changed: {category}")
                names = [name.strip() for name in re.split(r"[；;]", label(cells[0]))]
                if not all(names):
                    raise ValueError(f"Empty Codex name: {category}")
                for name_index, name in enumerate(names):
                    position += 1
                    object_id, fragment = codex_identity(anchor, position)
                    yield CodexEntry(table, row, cells[0], anchor, category, position, name,
                                     name_index, len(names), headers[1], label(cells[1]),
                                     object_id, fragment)
