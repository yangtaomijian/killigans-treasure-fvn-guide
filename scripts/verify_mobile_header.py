#!/usr/bin/env python3
"""Verify the opt-in resources without adding routing or duplicate controls."""

import re
from pathlib import Path
from enhance_mobile_header import enhance
from verify_render import OUTPUT, PAGES, SITE


def main():
    script = (SITE / 'assets/kt-mobile-header.js').read_text()
    assert '(max-width: 991px)' in script
    assert '.kt-page-breadcrumb ol' in script
    assert not re.search(r'pushState|replaceState|location\s*\.|createElement\("(?:button|a)"\)', script)
    for prefix in ('', 'en/'):
        for route in PAGES:
            page = OUTPUT / prefix / f'{route}.html'
            text = page.read_text()
            for asset in ('kt-mobile-header.css', 'kt-mobile-header.js'):
                refs = re.findall(r'(?:href|src)="([^"]*assets/' + re.escape(asset) + ')"', text)
                assert len(refs) == 1, (page, asset)
                assert (page.parent / refs[0]).resolve().is_file(), (page, refs[0])
            assert enhance(text, page) == text, page
    print(f'Two-tier header static contract: PASS {2 * len(PAGES)}/{2 * len(PAGES)} resource pairs, idempotent enhancement, existing context and routing')


if __name__ == '__main__':
    main()
