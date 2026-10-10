"""Check the publishable bilingual Ask the Guide integration, not QA snapshots."""
from pathlib import Path
import re
from verify_render import OUTPUT, PAGES

ASSETS = {'panel.mjs', 'panel.css', 'strings.mjs', 'question-limits.mjs', 'google-gis.mjs',
          'google-g.png', 'beta-application.mjs', 'adapter.mjs', 'transport.mjs', 'feedback.mjs'}

def main():
    directory = OUTPUT / 'assets/ai-beta'
    assert {p.name for p in directory.iterdir()} == ASSETS, 'Unexpected Ask the Guide asset'
    for locale in ('', 'en/'):
        for page in PAGES:
            path = OUTPUT / (locale + page + '.html')
            html = path.read_text()
            for asset in ('panel.css', 'google-gis.mjs', 'beta-application.mjs'):
                urls = re.findall(r'(?:href|src)="([^"<>]*assets/ai-beta/' + re.escape(asset) + r')"', html)
                assert len(urls) == 1, (locale, page, asset)
                assert (path.parent / urls[0]).resolve() == (directory / asset).resolve(), (locale, page, asset)
    forbidden = ('local ui candidate', 'candidate only', 'provider off', 'provider disabled', 'provider 已关闭')
    for path in directory.iterdir():
        if path.suffix in {'.mjs', '.css'}:
            text = path.read_text().lower()
            assert not any(word in text for word in forbidden), path
    for path in OUTPUT.rglob('*'):
        if path.is_file():
            relative = path.relative_to(OUTPUT)
            assert not {'audit', 'mock', 'test-results', 'browser-overlay'}.intersection(relative.parts), relative
            assert not path.name.startswith('preview-'), relative
    assert not list(OUTPUT.rglob('*.cjs')), 'Test scripts must not be published'
    print(f'PASS: {len(PAGES)*2} bilingual Ask the Guide includes; {len(ASSETS)} production assets; no review/test artifacts')

if __name__ == '__main__':
    main()
