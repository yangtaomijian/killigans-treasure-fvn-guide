"""Assert bilingual identities and multi-source equipment filter classifications."""
from pathlib import Path
import json,re
site=Path(__file__).resolve().parents[1]
s=(site/'assets/kt-equipment-finder.js').read_text();meta=json.loads(s.split('/* ITEM_META_START */')[1].split('/* ITEM_META_END */')[0])
assert len(meta)==35
for locale in ['', 'en/']:
    # Source section heading text may vary; the first 35 identities are the optional catalog.
    all_ids=re.findall(r'id="(equipment-item-[^"]+)"',(site/locale/'collectibles/equipment.md').read_text())
    assert len(all_ids)==46 and set(all_ids[:35])==set(meta)
    for page in ['equipment','codex']:
        html=(site/'_site'/locale/'collectibles'/f'{page}.html').read_text()
        assert f'data-kt-collection-finder="{page}"' in html
        if page=='codex': assert len(re.findall('class="kt-codex-entry"',html))==56
backroom={id for id,m in meta.items() if 'backroom' in m['ways']}
assert len(backroom)==5 and 'equipment-item-custom-made-sandals' in backroom
assert set(meta['equipment-item-hand-me-down-loincloth']['ways'])=={'gift','branch','shop'}
assert set(meta['equipment-item-marchanide-langou']['ways'])=={'branch','story'}
assert meta['equipment-item-prime-attire']['ways']==['reward']
assert sum('shop' in m['ways'] and m['region']=='spiceport' for m in meta.values())==9
assert all(m['region'] in {'redroot','wilds','aris','spiceport','blueleaf'} for m in meta.values())
print('PASS: collection finder bilingual 35 optional/11 automatic/56 Codex identities and acquisition mapping')
