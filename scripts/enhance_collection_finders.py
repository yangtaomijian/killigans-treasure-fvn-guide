"""Progressively enhance two existing collection tables without changing their source."""
from pathlib import Path
import shutil
site = Path(__file__).resolve().parents[1]
for asset in ['kt-collection-finder.css','kt-equipment-finder.js','kt-codex-finder.js']:
    shutil.copyfile(site/'assets'/asset,site/'_site/assets'/asset)
for locale in ['', 'en/']:
    for page in ['equipment','codex']:
        path=site/'_site'/locale/'collectibles'/f'{page}.html'
        html=path.read_text();prefix='../../' if locale else '../'
        if 'data-kt-collection-finder' in html: continue
        html=html.replace('</head>',f'<link data-kt-collection-finder="style" rel="stylesheet" href="{prefix}assets/kt-collection-finder.css">\n</head>')
        html=html.replace('</body>',f'<script data-kt-collection-finder="{page}" src="{prefix}assets/kt-{page}-finder.js"></script>\n</body>')
        path.write_text(html)
