#!/usr/bin/env python3
"""Verify the production Discussion configuration and markup."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
pages = ['guide/redroot', 'guide/aris', 'guide/crystal-plains-shieldfall', 'guide/spiceport',
         'guide/blueleaf-grove', 'reference/relationships', 'reference/personality', 'reference/combat',
         'collectibles/memories', 'collectibles/equipment', 'collectibles/dressing-room', 'collectibles/codex']
expected = {f'/{prefix}{page}.html': page.replace('/', '.') for prefix in ('', 'en/') for page in pages}
runtime = (root / 'assets/kt-discussion-runtime.html').read_text()
assert dict(re.findall(r"'(/[^']+\.html)': '([^']+)'", runtime)) == expected
assert "site: 'killigans-treasure'" in runtime
assert "const guideVersion = 'Public v0.57a'" in runtime
config = (root / 'assets/kt-discussion-config.html').read_text()
assets = ['kt-discussion-remote.html', 'kt-discussion-runtime.html', 'kt-discussion-ui.html', 'kt-feedback-ui.html']
for prefix in ('', 'en/'):
    for route in ['index', 'help', *pages]:
        relative = f'{prefix}{route}.html'
        text = (root / '_site' / relative).read_text()
        for marker in re.findall(r'<meta[^>]+>', config):
            assert text.count(marker) == 1, (relative, marker)
        assert text.count("if (window.__ktDiscussionRuntime) return;") == 1, relative
        assert text.count("main.after(mount);") == 1, relative
        assert text.count('class="kt-feedback-slot"') == 1, relative
        assert 'kt-discussion.css' in text and 'kt-feedback.css' in text, relative
        assert 'discussion-staging.carambi.com' not in text, relative
        assert 'giscus.app/client.js' not in text, relative
        assert text.index('Host-selected remote transport') < text.index('Shared page context and transport boundary') < text.index('Discussion UI.'), relative
    assert not (root / '_site' / f'{prefix}about.html').exists()
for name in assets:
    source = (root / 'assets' / name).read_text()
    assert '__pw' not in source and 'pw-' not in source, name
for name in ['kt-discussion.css', 'kt-feedback.css']:
    css = (root / 'assets' / name).read_text()
    tokens = set(re.findall(r'var\((--kt-[a-z-]+)\)', css))
    foundation = (root / 'assets/kt-foundation.css').read_text()
    assert all(token + ':' in foundation for token in tokens), (name, tokens)
print('KT Discussion static QA: 24 exact content contexts, 28 production configs/feedback slots, no About pages, include order and native theme tokens PASS')
