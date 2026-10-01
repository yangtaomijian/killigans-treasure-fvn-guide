#!/usr/bin/env python3
from pathlib import Path
import os,shutil,re
from verify_render import OUTPUT,SITE
for name in ('kt-dressing-room.css','kt-dressing-room.js','kt-dressing-room.json'):
 shutil.copyfile(SITE/'assets'/name,OUTPUT/'assets'/name)
for prefix in ('','en/'):
 p=OUTPUT/prefix/'collectibles/dressing-room.html';t=p.read_text();rel=Path(os.path.relpath(OUTPUT/'assets',p.parent)).as_posix()
 t=re.sub(r'<link id="kt-dressing-room-style"[^>]*>\s*','',t)
 t=re.sub(r'<script src="[^"]*/kt-dressing-room.js"></script>\s*','',t)
 t=re.sub(r' data-source="[^"]*/kt-dressing-room.json"','',t)
 t=re.sub(r'data-kt-dressing-room(?:="")?(?=\s|>)',f'data-kt-dressing-room data-source="{rel}/kt-dressing-room.json"',t,count=1)
 assert f'data-source="{rel}/kt-dressing-room.json"' in t
 t=t.replace('</head>',f'<link id="kt-dressing-room-style" rel="stylesheet" href="{rel}/kt-dressing-room.css">\n</head>',1)
 t=t.replace('</body>',f'<script src="{rel}/kt-dressing-room.js"></script>\n</body>',1);p.write_text(t)
print('Dressing Room progressive locator: ZH/EN')
