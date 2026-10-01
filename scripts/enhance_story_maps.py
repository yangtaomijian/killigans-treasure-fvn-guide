#!/usr/bin/env python3
"""Attach map assets to projection pages and reading layers to Combat."""
from pathlib import Path
import os
import shutil
from verify_render import OUTPUT, SITE
(OUTPUT/'assets/vendor').mkdir(exist_ok=True)
shutil.copyfile(SITE/'assets/vendor/mermaid.min.js',OUTPUT/'assets/vendor/mermaid.min.js')
for name in ('kt-story-map.css', 'kt-story-map.js', 'kt-read-layers.js'):
    shutil.copyfile(SITE/'assets'/name, OUTPUT/'assets'/name)
for prefix in ('','en/'):
    for route in ('index','reference/relationships','guide/spiceport'):
        p=OUTPUT/prefix/(route+'.html');t=p.read_text()
        if 'id="kt-story-map-style"' in t:continue
        rel=Path(os.path.relpath(OUTPUT/'assets',p.parent)).as_posix()
        t=t.replace('</head>',f'<link id="kt-story-map-style" rel="stylesheet" href="{rel}/kt-story-map.css">\n</head>',1)
        scripts=f'<script src="{rel}/vendor/mermaid.min.js"></script>\n'
        scripts+=f'<script src="{rel}/kt-story-map.js"></script>\n'
        if route!='index':scripts+=f'<script src="{rel}/kt-read-layers.js"></script>\n'
        p.write_text(t.replace('</body>',scripts+'</body>',1))
    # Combat uses the same searchable native disclosure without a Mermaid map.
    p=OUTPUT/prefix/'reference/combat.html';t=p.read_text()
    rel=Path(os.path.relpath(OUTPUT/'assets',p.parent)).as_posix()
    script=f'<script src="{rel}/kt-read-layers.js"></script>'
    if script not in t:p.write_text(t.replace('</body>',script+'\n</body>',1))
print('KT maps: six page resources; Combat: two reading-layer resources')
