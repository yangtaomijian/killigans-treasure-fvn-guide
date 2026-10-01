#!/usr/bin/env python3
"""Verify production-only metadata and verify public content checksums."""
import hashlib
import os
import re
import struct
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

from enhance_production import ORIGIN, canonical
from verify_render import OUTPUT, PAGES, SITE


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.meta = []

    def handle_starttag(self, tag, attrs):
        if tag == 'link': self.links.append(dict(attrs))
        if tag == 'meta': self.meta.append(dict(attrs))


def main():
    fingerprints = (SITE / 'scripts/public-content.sha256').read_text().splitlines()
    for row in fingerprints:
        digest, relative = row.split('  ', 1)
        assert hashlib.sha256((SITE / relative).read_bytes()).hexdigest() == digest, relative + ': public content checksum drift'
    assert not any((OUTPUT / prefix / "about.html").exists() for prefix in ("", "en/")), "About pages must be absent"
    expected = set()
    for locale in ('', 'en/'):
        for page in PAGES:
            relative = locale + page + '.html'
            source = (OUTPUT / relative).read_text()
            h = Head()
            h.feed(re.search(r'<head\b[^>]*>(.*?)</head>', source, re.S).group(1))
            target = page + '.html'
            url = canonical(locale + target)
            assert [x['href'] for x in h.links if x.get('rel') == 'canonical'] == [url], relative
            assert [(x.get('hreflang'),x.get('href')) for x in h.links if x.get('rel') == 'alternate'] == [
                ('zh-Hans', canonical(target)), ('en', canonical('en/' + target)), ('x-default', canonical(target))], relative
            social_ready = (SITE / ('assets/social/kt-public-v0.57a-' + ('en' if locale else 'zh') + '.png')).is_file()
            icons = [x for x in h.links if x.get('rel') == 'icon']
            assert len(icons) == int((SITE / 'assets/favicon.svg').is_file()), relative
            for key in ('description', 'og:url', 'og:image', 'og:title', 'og:description', 'og:locale', 'twitter:card', 'twitter:title', 'twitter:image'):
                values = [x['content'] for x in h.meta if x.get('property', x.get('name')) == key]
                if key in ('og:image', 'twitter:image') and not social_ready:
                    assert not values, relative + ': unpublished visual must not be referenced'
                    continue
                assert len(values) == 1 and values[0], relative + ': ' + key
                if key == 'og:url': assert values[0] == url
                if key in ('og:image', 'twitter:image'): assert values[0] == ORIGIN + '/assets/social/kt-public-v0.57a-' + ('en' if locale else 'zh') + '.png'
            assert source.count('class="kt-publication-footer"') == 1, relative
            assert source.count('data-kt-analytics') == int(bool(os.environ.get('KT_CF_ANALYTICS_TOKEN'))), relative + ': analytics injection count'
            assert 'kt-discussion-environment' in source and 'kt-discussion-api' in source
            robots = [x['content'] for x in h.meta if x.get('name') == 'robots']
            expected.add(url)
            assert not robots
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'x': 'http://www.w3.org/1999/xhtml'}
    root = ET.parse(OUTPUT / 'sitemap.xml').getroot()
    entries = root.findall('s:url', ns)
    assert len(entries) == 28
    assert {node.find('s:loc', ns).text for node in entries} == expected
    for node in entries:
        links = node.findall('x:link',ns)
        assert len(links) == 3
        assert all(link.get('href') in expected for link in links)
    for locale in ('zh','en'):
        source_asset = SITE / f'assets/social/kt-public-v0.57a-{locale}.png'
        target_asset = OUTPUT / f'assets/social/kt-public-v0.57a-{locale}.png'
        if not source_asset.is_file():
            assert not target_asset.exists(), 'Missing source social asset must not appear in output'
            continue
        data = target_asset.read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II', data[16:24]) == (1200, 630)
    assert (OUTPUT / 'CNAME').read_text().strip() == ORIGIN.split('://')[1]
    assert ORIGIN + '/sitemap.xml' in (OUTPUT / 'robots.txt').read_text()
    assert 'noindex,follow' in (OUTPUT / '404.html').read_text()
    assert (OUTPUT / 'assets/favicon.svg').exists() == (SITE / 'assets/favicon.svg').exists()
    print(f'PASS: {len(fingerprints)}/48 public content checksums; 28 bilingual pages; 28 sitemap routes; 404 noindex; visual assets checked only if user finals supplied')


if __name__ == '__main__':
    main()
