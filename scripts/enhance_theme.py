#!/usr/bin/env python3
"""Keep Quarto's native theme state; constrain its Safari scrollbar repaint."""
from verify_render import OUTPUT, PAGES

# Quarto's before-body initialization runs while parsing. Its Safari workaround
# must not reset the browser's initial fragment/history position after 40ms.
# Later theme changes still repaint the scrollbar, at the current reading position.
ORIGINAL = '''      if (navigator.userAgent.indexOf('Safari') > 0 && navigator.userAgent.indexOf('Chrome') == -1) {
        manageTransitions("body", false);
        window.scrollTo(0, 1);
        setTimeout(() => {
          window.scrollTo(0, 0);
          manageTransitions("body", true);
        }, 40);
      }'''
REPLACEMENT = '''      if (document.readyState !== "loading" && navigator.userAgent.indexOf('Safari') > 0 && navigator.userAgent.indexOf('Chrome') == -1) {
        const readingPosition = { x: window.scrollX, y: window.scrollY };
        manageTransitions("body", false);
        window.scrollTo(readingPosition.x, readingPosition.y + 1);
        setTimeout(() => {
          window.scrollTo(readingPosition.x, readingPosition.y);
          manageTransitions("body", true);
        }, 40);
      }'''


def main():
    changed = 0
    for prefix in ('', 'en/'):
        for route in PAGES:
            page = OUTPUT / prefix / f'{route}.html'
            text = page.read_text()
            if text.count(REPLACEMENT) == 1 and ORIGINAL not in text:
                continue
            if text.count(ORIGINAL) != 1:
                raise ValueError(f'{page}: native Safari repaint changed; inspect before patching')
            page.write_text(text.replace(ORIGINAL, REPLACEMENT, 1))
            changed += 1
    print(f'Native theme Safari scroll preservation: pages={2 * len(PAGES)} changed={changed}')


if __name__ == '__main__':
    main()
