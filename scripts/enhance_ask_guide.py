"""Resolve the shared Ask the Guide assets from both Quarto language projects."""
import os
import re
from verify_render import OUTPUT, PAGES, SITE
from ai_release import assemble, include_enabled

def main():
    enabled=include_enabled(SITE)
    release=assemble(SITE, OUTPUT, os.environ.get('KT_AI_PREVIOUS_OUTPUT'))
    for locale in ('', 'en/'):
        for page in PAGES:
            path = OUTPUT / (locale + page + '.html')
            html = path.read_text()
            if not enabled:
                assert 'assets/ai-beta/' not in html and 'kt-ai-release' not in html, (path, 'Stale AI injection in closed publication')
                continue
            for name in ('panel.css', 'google-gis.mjs', 'beta-application.mjs'):
                target = os.path.relpath(OUTPUT / 'assets/ai-beta/releases' / release / name, path.parent)
                pattern = r'((?:href|src)=")([^"<>]*assets/ai-beta/(?:releases/[a-f0-9]{24}/)?' + re.escape(name) + r')(")'
                html, count = re.subn(pattern, lambda match: match[1] + target + match[3], html)
                assert count == 1, (path, name, count)
            html=re.sub(r'<meta name="kt-ai-release" content="[a-f0-9]{24}">','',html)
            html=html.replace("</head>", f'<meta name="kt-ai-release" content="{release}"></head>')
            path.write_text(html)
    print(f'Ask the Guide: shared asset paths resolved on {len(PAGES)*2} bilingual pages')

if __name__ == '__main__':
    main()
