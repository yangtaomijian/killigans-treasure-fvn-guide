#!/usr/bin/env python3
"""Attach the authored homepage scene and scoped assets to Quarto output."""
from pathlib import Path
import shutil
SITE=Path(__file__).resolve().parents[1];OUT=SITE/'_site'
CSS='experience codex leather worn approach tabs papertabs map-tones illustrated companion-outside light-join map-polish'.split()
for locale,prefix in [('zh',''),('en','en/')]:
 p=OUT/prefix/'index.html';t=p.read_text();depth='../'if prefix else''
 hero=(SITE/'_includes'/f'home-scene-{locale}.html').read_text()
 marker='<div id="quarto-content"'
 assert t.count(marker)==1
 t=t.replace(marker,hero+'\n'+marker,1)
 t=t.replace('<body ',f'<body data-home-locale="{locale}" ',1)
 # Load the map after first-screen assets; keep header and scene setup unblocked.
 for asset in ['vendor/mermaid.min.js', 'kt-story-map.js']:
  t=t.replace(f'<script src="{depth}assets/{asset}"></script>','')
 t=t.replace('</head>',f'<link rel="preload" as="image" href="{depth}assets/home/redroot-ai.webp" fetchpriority="high">\n</head>',1)
 t=t.replace('</head>','\n'.join(f'<link rel="stylesheet" href="{depth}assets/home/{x}.css">'for x in CSS)+'\n</head>',1)
 t=t.replace('</body>',''.join(f'<script src="{depth}assets/home/{x}.js"></script>'for x in ['experience','approach','tabs','map-loader'])+'\n</body>',1)
 t=t.replace('</body>',f'<script defer src="{depth}assets/portrait-blink/blink.js"></script>\n</body>',1)
 assert '私人原型'not in t and 'Private prototype'not in t
 p.write_text(t)
shutil.copytree(SITE/'assets/home',OUT/'assets/home',dirs_exist_ok=True)
print('Homepage scenes and scoped assets:2 locales')
