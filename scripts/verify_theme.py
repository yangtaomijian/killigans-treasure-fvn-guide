#!/usr/bin/env python3
"""Native dual-theme structure, assets and utility semantics in both locales."""
from enhance_theme import REPLACEMENT
from html.parser import HTMLParser
from collections import Counter
from verify_render import OUTPUT, PAGES, SITE, is_native_theme_stylesheet


class ThemePage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sheets = []
        self.controls = []
        self.resources = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if is_native_theme_stylesheet(tag, values):
            self.sheets.append(values)
        if values.get('id') in {'kt-theme-controls', 'kt-theme-auto'} or 'quarto-color-scheme-toggle' in values.get('class', '').split():
            self.controls.append((tag, values))
        if tag in {'script', 'link'}:
            self.resources.append(values.get('src', values.get('href', '')))


def main():
    for prefix in ('', 'en/'):
        config = (SITE / prefix / '_quarto.yml').read_text()
        assert 'respect-user-color-scheme: true' in config
        assert 'light: [default]' in config and 'assets/kt-dark.scss]' in config
        for route in PAGES:
            page = OUTPUT / prefix / f'{route}.html'
            text = page.read_text()
            parsed = ThemePage(); parsed.feed(text)
            for key in ('quarto-bootstrap', 'quarto-text-highlighting-styles'):
                sheets = [v for v in parsed.sheets if v['id'] == key]
                assert len(sheets) == 3, (page, key, len(sheets))
                assert Counter(v['class'] for v in sheets) == Counter({
                    'quarto-color-scheme': 1,
                    'quarto-color-scheme quarto-color-alternate': 1,
                    'quarto-color-scheme-extra': 1}), (page, key)
                if key == 'quarto-bootstrap':
                    assert [v['data-mode'] for v in sheets] == ['light', 'dark', 'light']
            assert len(parsed.controls) == 3, page
            assert sum(v.get('id') == 'kt-theme-auto' and tag == 'button' and v.get('aria-pressed') == 'true' for tag,v in parsed.controls) == 1
            assert 'queryPrefersDark.addEventListener("change"' in text, page
            assert 'quarto-html-before-body' in text, page
            assert text.count(REPLACEMENT) == 1, page
            for asset in ('kt-theme.css', 'kt-theme.js'):
                assert sum(r.endswith('assets/' + asset) for r in parsed.resources) == 1, (page, asset)
    print(f'Native dual theme: PASS {2 * len(PAGES)} pages, primary/alternate/fallback sheets and one utility group each')


if __name__ == '__main__':
    main()
