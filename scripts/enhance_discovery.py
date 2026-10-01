#!/usr/bin/env python3
"""Attach publication styling to the bilingual home pages."""
from pathlib import Path
import re

SITE = Path(__file__).resolve().parents[1]
OUTPUT = SITE / '_site'


def entry_routes(text, locale):
    """Promote existing destinations to full hit areas, without choosing a hub."""
    def group(match):
        markup = match.group(0)
        anchors = re.findall(r'<a href="([^"]+)">(.*?)</a>', markup)
        assert anchors, 'Home entry group has no destinations'
        # Help formerly placed its only destination in the heading. Keep all
        # four headings explanatory and expose Help alongside the other routes.
        markup = re.sub(r'(<h3\b[^>]*>)<a href="[^"]+">(.*?)</a>(</h3>)', r'\1\2\3', markup)
        markup = re.sub(r'<p><a href="[^"]+">.*?</p>\s*', '', markup)
        links = []
        for href, title in anchors:
            if href.removeprefix('./') == 'help.html':
                title = '查看帮助' if locale == 'zh' else 'Open help'
            links.append(f'<li><a class="kt-home-route" href="{href}"><span>{title}</span><span class="kt-home-route-arrow" aria-hidden="true">→</span></a></li>')
        routes = '<ul class="kt-home-route-list">\n' + '\n'.join(links) + '\n</ul>\n'
        return markup.replace('</section>', routes + '</section>')
    return re.sub(r'<section\b[^>]*class="[^"]*\bkt-home-entry\b[^"]*">.*?</section>', group, text, flags=re.S)


def enhance(text, locale, route):
    if 'id="kt-discovery-style"' in text:
        return text
    if route == 'index':
        text = entry_routes(text, locale)
    depth = '../' if locale == 'en' else ''
    head = f'<link id="kt-discovery-style" rel="stylesheet" href="{depth}assets/kt-discovery.css">\n'
    return text.replace('</head>', head + '</head>', 1)


def main():
    for locale, prefix in [('zh', ''), ('en', 'en/')]:
        for route in ['index']:
            path = OUTPUT / prefix / (route + '.html')
            updated = enhance(path.read_text(), locale, route)
            assert enhance(updated, locale, route) == updated
            path.write_text(updated)
            print(f'Home publication: {prefix}{route}.html styled')


if __name__ == '__main__':
    main()
