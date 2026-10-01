#!/usr/bin/env python3
"""Check the rendered language switch and its mirrored-page dependency."""

from pathlib import Path
import subprocess
import sys
from urllib.parse import unquote, urljoin, urlsplit

from verify_navigation import Document, classes, label
from verify_render import ANCHOR_RE, OUTPUT, PAGES, PRIVATE_PARTS, SITE


INCLUDE = SITE / "assets/kt-language-switch.html"


def main():
    errors = []
    script = INCLUDE.read_text(encoding="utf-8")
    if script.count("<script>") != 1 or script.count("</script>") != 1:
        errors.append("shared include must contain one inline script")
    for assignment in ("target.search = current.search", "target.hash = current.hash"):
        if assignment not in script:
            errors.append(f"state preservation missing: {assignment}")
    for forbidden in ("pushState", "replaceState", "scrollIntoView", "setInterval"):
        if forbidden in script:
            errors.append(f"forbidden runtime operation: {forbidden}")

    counts = {"zh": 0, "en": 0}
    duplicate_controls = 0
    pairs = 0
    for page in PAGES:
        zh_source = SITE / f"{page}.md"
        en_source = SITE / "en" / f"{page}.md"
        zh_target = OUTPUT / f"{page}.html"
        en_target = OUTPUT / "en" / f"{page}.html"
        if not all(path.is_file() for path in (zh_source, en_source, zh_target, en_target)):
            errors.append(f"missing mirrored source or output page: {page}")
            continue
        zh_anchors = ANCHOR_RE.findall(zh_source.read_text(encoding="utf-8"))
        en_anchors = ANCHOR_RE.findall(en_source.read_text(encoding="utf-8"))
        if set(zh_anchors) != set(en_anchors):
            errors.append(f"explicit anchor set differs on mirrored page: {page}")
        else:
            pairs += 1
        for locale, target in (("zh", zh_target), ("en", en_target)):
            current = target.relative_to(OUTPUT)
            html = target.read_text(encoding="utf-8")
            if html.count("ktMapLanguageUrl = mapLanguageUrl") != 1:
                errors.append(f"shared implementation missing or duplicated: {current}")
            document = Document()
            document.feed(html)
            rendered_anchors = {node.attrs.get("id") for node in document.root.walk() if node.tag == "a" and "id" in node.attrs}
            expected_anchors = set(zh_anchors if locale == "zh" else en_anchors)
            if not expected_anchors <= rendered_anchors:
                errors.append(f"rendered explicit anchors missing: {current}: {sorted(expected_anchors - rendered_anchors)}")
            navbars = [node for node in document.root.walk() if node.tag == "nav" and "navbar" in classes(node)]
            if len(navbars) != 1:
                errors.append(f"expected one navbar: {current}")
                continue
            navbar = navbars[0]
            right_lists = [node for node in navbar.walk() if node.tag == "ul" and {"navbar-nav", "ms-auto"} <= classes(node)]
            right_links = [node for nav in right_lists for node in nav.walk() if node.tag == "a"]
            expected_label = "EN" if locale == "zh" else "中文"
            language_links = [node for node in navbar.walk() if node.tag == "a" and label(node) in ("EN", "中文")]
            duplicate_controls += max(0, len(language_links) - 1)
            if len(right_lists) != 1 or len(right_links) != 1 or len(language_links) != 1 or right_links != language_links or label(right_links[0]) != expected_label:
                errors.append(f"language control count, position, or label changed: {current}")
                continue
            counts[locale] += 1
            href = right_links[0].attrs.get("href", "")
            parsed = urlsplit(href)
            if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or not parsed.path or parsed.path.endswith(".md"):
                errors.append(f"unsafe language fallback: {current}: {href}")
                continue
            resolved = urlsplit(urljoin("https://example.test/prefix/" + current.as_posix(), href))
            path = unquote(resolved.path)
            expected = "/prefix/en/index.html" if locale == "zh" else "/prefix/index.html"
            if resolved.netloc != "example.test" or path != expected or PRIVATE_PARTS & set(path.split("/")):
                errors.append(f"wrong language fallback: {current}: {href} -> {path}")

    print(f"switch controls: ZH={counts['zh']}/{len(PAGES)} EN={counts['en']}/{len(PAGES)} duplicates={duplicate_controls}")
    print(f"mirrored page anchor sets: {pairs}/{len(PAGES)} equal page by page")
    if not errors:
        test = subprocess.run(["node", str(SITE / "scripts/test_language_switch.cjs")], capture_output=True, text=True, check=False)
        print(test.stdout, end="")
        if test.returncode:
            errors.append(f"mapping regressions failed: {test.stderr.strip()}")
    for error in errors:
        print("ERROR:", error, file=sys.stderr)
    if errors:
        return 1
    print("Language switch contract: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
