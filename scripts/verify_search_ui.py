#!/usr/bin/env python3
"""Static contract for the controlled search adapter in all rendered pages."""

from html.parser import HTMLParser
import sys

from verify_render import OUTPUT, PAGES, SITE


class SearchPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.nav_links = []
        self.in_nav = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if "id" in values:
            self.ids.append(values["id"])
        if tag == "nav" and "navbar" in values.get("class", "").split():
            self.in_nav = True
        if self.in_nav and tag == "a":
            self.nav_links.append(values.get("href", ""))

    def handle_endtag(self, tag):
        if tag == "nav":
            self.in_nav = False


def main():
    errors = []
    adapter = (SITE / "assets/kt-search.html").read_text(encoding="utf-8")
    for forbidden in ("quarto-search.js", "pushState"):
        if forbidden in adapter:
            errors.append(f"forbidden adapter reference: {forbidden}")
    if 'new URL("kt-search.json", root)' not in adapter:
        errors.append("controlled index URL is missing")
    if "search.json" in adapter.replace("kt-search.json", ""):
        errors.append("native index reference in adapter")
    if 'asset("kt-search-core.js")' not in adapter or 'asset("kt-search-aliases.json")' not in adapter:
        errors.append("core or curated aliases not loaded")
    for config in (SITE / "_quarto.yml", SITE / "en/_quarto.yml"):
        value = config.read_text(encoding="utf-8")
        if "search: false" not in value or "kt-search.html" not in value:
            errors.append(f"Quarto search safety/config missing: {config.relative_to(SITE)}")
    for asset in ("assets/kt-search-core.js", "assets/kt-search-aliases.json"):
        if not (OUTPUT / asset).is_file():
            errors.append(f"missing controlled asset: {asset}")
    for locale in ("", "en/"):
        if not (OUTPUT / locale / "kt-search.json").is_file():
            errors.append(f"missing locale index: {locale}kt-search.json")
        for route in PAGES:
            rel = f"{locale}{route}.html"
            path = OUTPUT / rel
            if not path.is_file():
                errors.append(f"missing page: {rel}")
                continue
            html = path.read_text(encoding="utf-8")
            page = SearchPage()
            page.feed(html)
            for unique in (
                "kt-search-launcher", "kt-search-dialog", "kt-search-input", "kt-search-clear",
                "kt-search-close", "kt-search-results", "kt-search-status",
            ):
                if page.ids.count(unique) != 1:
                    errors.append(f"{rel}: {unique} count {page.ids.count(unique)}")
            if "ktMapLanguageUrl" not in html:
                errors.append(f"{rel}: language switch missing")
            if html.count('new URL("kt-search.json", root)') != 1:
                errors.append(f"{rel}: controlled adapter duplicate/missing")
            # The home link is the locale-root authority used by the adapter.
            expected = "../index.html" if "/" in route else "./index.html"
            if not page.nav_links or page.nav_links[0] != expected:
                errors.append(f"{rel}: unexpected home link: {page.nav_links[:1]}")
    if errors:
        for error in errors:
            print("ERROR:", error, file=sys.stderr)
        return 1
    print(f"Controlled search UI static contract: PASS ({2 * len(PAGES)} pages, one launcher each)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
