#!/usr/bin/env python3
"""Verify the production Discussion configuration and markup."""
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit

root = Path(__file__).resolve().parents[1]
pages = ['help', 'guide/redroot', 'guide/aris', 'guide/crystal-plains-shieldfall', 'guide/spiceport',
         'guide/blueleaf-grove', 'reference/relationships', 'reference/personality', 'reference/combat',
         'collectibles/memories', 'collectibles/equipment', 'collectibles/dressing-room', 'collectibles/codex']
expected = {f'/{prefix}{page}.html': page.replace('/', '.') for prefix in ('', 'en/') for page in pages}
runtime = (root / 'assets/kt-discussion-runtime.html').read_text()
def page_contexts(text):
    return dict(re.findall(r"'(/[^']+\.html)': '([^']+)'", text))

def discussion_version(text):
    versions = re.findall(r"const guideVersion = '([^']+)'", text)
    assert len(versions) == 1, 'Exactly one Discussion guide version is required'
    return versions[0]

assert page_contexts(runtime) == expected
source_version = discussion_version(runtime)
assert "site: 'killigans-treasure'" in runtime
assert source_version == 'Public v0.57a'
config = (root / 'assets/kt-discussion-config.html').read_text()
assets = ['kt-discussion-remote.html', 'kt-discussion-runtime.html', 'kt-discussion-ui.html', 'kt-feedback-ui.html']
for prefix in ('', 'en/'):
    for route in ['index', *pages]:
        relative = f'{prefix}{route}.html'
        text = (root / '_site' / relative).read_text()
        assert discussion_version(text) == source_version, (relative, 'Discussion version mismatch')
        assert page_contexts(text) == expected, (relative, 'Discussion page identity mismatch')
        if route in pages:
            assert page_contexts(text)['/' + relative] == route.replace('/', '.'), relative
        for marker in re.findall(r'<meta[^>]+>', config):
            assert text.count(marker) == 1, (relative, marker)
        assert text.count("if (window.__ktDiscussionRuntime) return;") == 1, relative
        assert text.count("main.after(mount);") == 1, relative
        assert text.count('class="kt-feedback-slot"') == 1, relative
        assert 'kt-discussion.css' in text and 'kt-feedback.css' in text, relative
        assert 'discussion-staging.carambi.com' not in text, relative
        assert 'giscus.app/client.js' not in text, relative
        assert text.index('Host-selected remote transport') < text.index('Shared page context and transport boundary') < text.index('Discussion UI.'), relative
    hub = (root / '_site' / f'{prefix}discussions.html').read_text()
    assert '<div id="kt-discussion-hub"' in hub, (prefix, 'Missing summary mount')
    assert discussion_version(hub) == source_version, (prefix, 'Summary version mismatch')
    assert page_contexts(hub) == expected, (prefix, 'Summary page identity mismatch')
    assert 'id=\"language\"' not in hub and 'id=\\\"language\\\"' not in hub, 'Discussion must not filter by language'
    for route in ['index', 'discussions', *pages]:
        relative = f'{prefix}{route}.html'
        text = (root / '_site' / relative).read_text()
        styles = re.findall(r'<link[^>]+href="([^"]*kt-discussion\.css)"', text)
        assert styles, (relative, 'Missing Discussion CSS link')
        for style in styles:
            resource = urlsplit(urljoin('/' + relative, style)).path.lstrip('/')
            assert (root / '_site' / resource).is_file(), (relative, 'Missing Discussion CSS artifact')
    assert not (root / '_site' / f'{prefix}about.html').exists()
for name in assets:
    source = (root / 'assets' / name).read_text()
    assert '__pw' not in source and 'pw-' not in source, name
for name in ['kt-discussion.css', 'kt-feedback.css']:
    css = (root / 'assets' / name).read_text()
    tokens = set(re.findall(r'var\((--kt-[a-z-]+)\)', css))
    foundation = (root / 'assets/kt-foundation.css').read_text()
    assert all(token + ':' in foundation for token in tokens), (name, tokens)
print('KT Discussion static QA: 26 exact content contexts, 28 production configs/feedback slots, no About pages, paired page identities/versions, summary and CSS artifacts, include order and native theme tokens PASS')
