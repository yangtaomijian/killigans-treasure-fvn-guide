#!/usr/bin/env python3
"""Verify production-only metadata and verify public content checksums."""
import hashlib
import os
import re
import struct
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

from enhance_production import FAVICON_ASSETS, ORIGIN, SOCIAL_IMAGES, canonical
from verify_render import OUTPUT, PAGES, SITE


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.meta = []

    def handle_starttag(self, tag, attrs):
        if tag == 'link': self.links.append(dict(attrs))
        if tag == 'meta': self.meta.append(dict(attrs))


def png_size(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', str(path) + ': invalid PNG'
    return struct.unpack('>II', data[16:24])


def verify_icons(head, path, asset_root):
    def target(href):
        return (OUTPUT / href.lstrip('/') if href.startswith('/') else path.parent / href).resolve()
    icons = [x for x in head.links if x.get('rel') == 'icon']
    touch = [x for x in head.links if x.get('rel') == 'apple-touch-icon']
    assert len(icons) == 2 and len(touch) == 1, str(path) + ': favicon link count'
    expected = {'image/svg+xml': 'favicon.svg', 'image/png': 'favicon-32x32.png'}
    assert {icon.get('type') for icon in icons} == set(expected), str(path)
    for icon in icons:
        assert target(icon['href']) == (asset_root / expected[icon['type']]).resolve(), str(path)
        if icon['type'] == 'image/png': assert icon.get('sizes') == '32x32', str(path)
    assert target(touch[0]['href']) == (asset_root / 'apple-touch-icon.png').resolve(), str(path)
    assert touch[0].get('sizes') == '180x180', str(path)


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
            verify_icons(h, OUTPUT / relative, OUTPUT / locale / 'assets')
            for key in ('description', 'og:url', 'og:image', 'og:title', 'og:description', 'og:locale', 'og:image:type', 'og:image:width', 'og:image:height', 'twitter:card', 'twitter:title', 'twitter:image'):
                values = [x['content'] for x in h.meta if x.get('property', x.get('name')) == key]
                assert len(values) == 1 and values[0], relative + ': ' + key
                if key == 'og:url': assert values[0] == url
                if key in ('og:image', 'twitter:image'): assert values[0] == ORIGIN + '/' + SOCIAL_IMAGES['en' if locale else 'zh']
                if key in ('og:image:type', 'og:image:width', 'og:image:height', 'twitter:card'):
                    assert values[0] == {'og:image:type':'image/png', 'og:image:width':'1200', 'og:image:height':'630', 'twitter:card':'summary_large_image'}[key], relative
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
        image = SOCIAL_IMAGES[locale]
        assert image == f'assets/social/killigans-treasure-guide-{locale}.png', 'Social-card filenames must remain version-agnostic'
        source_asset, target_asset = SITE / image, OUTPUT / image
        assert source_asset.is_file() and target_asset.is_file(), image
        assert png_size(source_asset) == png_size(target_asset) == (1200, 630), image
        assert source_asset.read_bytes() == target_asset.read_bytes(), image + ': output differs from source asset'
    svg = ET.parse(SITE / 'assets/favicon.svg').getroot()
    assert svg.get('width') == svg.get('height') == '64' and svg.get('viewBox') == '0 0 64 64'
    for locale in ('', 'en/'):
        for name in FAVICON_ASSETS:
            source_asset, target_asset = SITE / 'assets' / name, OUTPUT / locale / 'assets' / name
            assert source_asset.is_file() and target_asset.is_file(), locale + name
            assert source_asset.read_bytes() == target_asset.read_bytes(), locale + name
        assert png_size(OUTPUT / locale / 'assets/favicon-32x32.png') == (32, 32)
        assert png_size(OUTPUT / locale / 'assets/apple-touch-icon.png') == (180, 180)
    assert (OUTPUT / 'CNAME').read_text().strip() == ORIGIN.split('://')[1]
    assert ORIGIN + '/sitemap.xml' in (OUTPUT / 'robots.txt').read_text()
    assert 'noindex,follow' in (OUTPUT / '404.html').read_text()
    not_found = Head()
    not_found.feed((OUTPUT / '404.html').read_text())
    verify_icons(not_found, OUTPUT / '404.html', OUTPUT / 'assets')
    assert all(link['href'].startswith('/assets/') for link in not_found.links), '404 favicon links must resolve from missing nested routes'
    print(f'PASS: {len(fingerprints)}/48 public content checksums; 28 bilingual pages; 28 sitemap routes; 404 noindex; favicon in both locales; version-agnostic 1200x630 social cards and OG/Twitter metadata')


if __name__ == '__main__':
    main()
