"""Resolve the shared Ask the Guide assets from both Quarto language projects."""
import os
import re
from verify_render import OUTPUT, PAGES

def main():
    for locale in ('', 'en/'):
        for page in PAGES:
            path = OUTPUT / (locale + page + '.html')
            html = path.read_text()
            for name in ('panel.css', 'google-gis.mjs', 'beta-application.mjs'):
                target = os.path.relpath(OUTPUT / 'assets/ai-beta' / name, path.parent)
                pattern = r'((?:href|src)=")([^"<>]*assets/ai-beta/' + re.escape(name) + r')(")'
                html, count = re.subn(pattern, lambda match: match[1] + target + match[3], html)
                assert count == 1, (path, name, count)
            path.write_text(html)
    print(f'Ask the Guide: shared asset paths resolved on {len(PAGES)*2} bilingual pages')

if __name__ == '__main__':
    main()
