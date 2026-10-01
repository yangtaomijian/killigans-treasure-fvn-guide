#!/usr/bin/env python3
"""Opt into the reversible two-tier mobile header after the ordinary enhancers."""

import os
from pathlib import Path
from verify_render import OUTPUT, PAGES


def enhance(text, page):
    if 'assets/kt-mobile-header.js' in text:
        return text
    base = Path(os.path.relpath(OUTPUT / 'assets', page.parent)).as_posix()
    text = text.replace('</head>', f'<link rel="stylesheet" href="{base}/kt-mobile-header.css">\n</head>', 1)
    return text.replace('</body>', f'<script src="{base}/kt-mobile-header.js"></script>\n</body>', 1)


if __name__ == '__main__':
    for prefix in ('', 'en/'):
        for route in PAGES:
            page = OUTPUT / prefix / f'{route}.html'
            page.write_text(enhance(page.read_text(), page))
    print(f'Two-tier mobile header: enabled on {2 * len(PAGES)} pages')
