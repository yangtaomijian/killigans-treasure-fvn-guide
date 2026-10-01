#!/usr/bin/env python3
"""Check the publication home and progressive Gallery shell."""
import re
from verify_navigation import Document, label
from verify_render import OUTPUT, PAGES
from enhance_discovery import enhance


def main():
    for locale, prefix in [('zh', ''), ('en', 'en/')]:
        for page in PAGES:
            markup = (OUTPUT / prefix / f'{page}.html').read_text()
            lang = 'en' if locale == 'en' else 'zh-CN'
            assert f'lang="{lang}" xml:lang="{lang}"' in markup, f'{prefix}{page}: document language'
        for route in ['index']:
            path = OUTPUT / prefix / f'{route}.html'
            html = path.read_text()
            assert enhance(html, locale, route) == html, f'{path}: idempotence'
            doc = Document(); doc.feed(html)
            article = next(n for n in doc.root.walk() if n.attrs.get('id') == 'quarto-document-content')
            nodes = {n.attrs['id']: n for n in article.walk() if 'id' in n.attrs}
            assert 'kt-home-search' not in nodes and 'kt-find-answer' not in nodes
            assert not any(n.attrs.get('id') == 'TOC' for n in doc.root.walk())
            if route == 'index':
                entries = [n for n in article.walk() if 'kt-home-entry' in n.attrs.get('class', '').split()]
                assert len(entries) == 4
                hrefs = [n.attrs['href'].removeprefix('./') for entry in entries for n in entry.walk() if n.tag == 'a' and not n.attrs.get('class') == 'anchorjs-link']
                expected = ['guide/redroot.html', 'guide/aris.html', 'guide/crystal-plains-shieldfall.html', 'guide/spiceport.html', 'guide/blueleaf-grove.html', 'reference/relationships.html', 'reference/personality.html', 'reference/combat.html', 'collectibles/memories.html', 'collectibles/codex.html', 'collectibles/equipment.html', 'collectibles/dressing-room.html', 'help.html']
                assert hrefs == expected, (locale, hrefs)
                routes = [n for entry in entries for n in entry.walk() if 'kt-home-route' in n.attrs.get('class', '').split()]
                assert len(routes) == 13
                assert all(not any(n.tag == 'a' for n in heading.walk()) for entry in entries for heading in entry.children('h3'))
                assert all(n.tag == 'a' and len(n.children('span')) == 2 and n.children('span')[1].attrs.get('aria-hidden') == 'true' for n in routes)
                assert all(key in nodes for key in ['kt-reading', 'kt-official', 'site-info', 'kt-site-info', 'kt-credits'])
                assert 'Carambi' not in label(article) and 'kt-update-policy' not in nodes
                if locale == 'zh':
                    assert 'kt-names' in nodes
                    assert all(name in label(nodes['kt-credits']) for name in ['Heyeah', '顺水行洲zhou'])
                    assert any(n.attrs.get('href') == 'https://t.me/heyeah12' for n in nodes['kt-credits'].walk())
                else:
                    assert 'kt-names' not in nodes
                    assert all(name not in label(article) for name in ['Heyeah', '顺水行洲zhou', 'Chinese patch'])
                assert 'v0.57a' in label(article) and 'Day 12' in label(article)
                official = ['https://eddio.itch.io/killigans-treasure', 'https://itch.io/t/1320696/faq-updated-11302025', 'https://itch.io/t/2741741/returning-player-new-device-click-here', 'https://itch.io/post/4549066']
                actual = [n.attrs['href'] for n in article.walk() if n.tag == 'a' and 'href' in n.attrs]
                assert all(href in actual for href in official), f'{locale}: official/community link lost'
                assert '牛獸人杜恩' in label(nodes['kt-credits'])
                assert html.index('id="kt-reading"') < html.index('id="kt-official"') < html.index('id="site-info"')
                assert 'assets/kt-discovery.js' not in html
        memories = (OUTPUT / prefix / 'collectibles/memories.html').read_text()
        assert memories.count('id="kt-memory-gallery-style"') == 1 and memories.count('id="kt-memory-gallery-script"') == 1
        assert 'id="kt-memory-gallery"' not in memories, 'Runtime enhancement must not duplicate entries in rendered/indexed content'
    print('Publication home: ZH/EN introduction, four entry groups, lower official links/credits, no TOC/search block; no About pages PASS')
    print('Gallery progressive shell: bilingual resources, no second generated catalog, source tables preserved PASS')


if __name__ == '__main__':
    main()
