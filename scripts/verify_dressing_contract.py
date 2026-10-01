"""Current public Dressing identity, exceptions, bilingual projection and Search."""
import json,re
from pathlib import Path
S=Path(__file__).resolve().parents[1]
source=json.loads((S/'scripts/dressing_room_inventory.json').read_text())
public=json.loads((S/'assets/kt-dressing-room.json').read_text())
identity=lambda x:(x['character'],x['category'],x['visibleValue'],x['anchor'])
assert len(source['items'])==len(public['items'])==124
assert len({identity(x) for x in source['items']})==124
assert {identity(x) for x in source['items']}=={identity(x) for x in public['items']}
notes={x['anchor']:x for x in public['items'] if 'visualNote' in x}
assert set(notes)=={'dress-killigan-undies-3-r','dress-killigan-undies-3-h','dress-macsen-special-1'}
assert notes['dress-killigan-undies-3-r']['route']=='prime'
assert notes['dress-killigan-undies-3-h']['route']=='post-summit'
for key in ('dress-killigan-undies-3-r','dress-killigan-undies-3-h'):
 assert '不会显示对应衣物' in notes[key]['visualNote']['zh']
 assert 'garment' in notes[key]['visualNote']['en']
assert '图像读取错误' in notes['dress-macsen-special-1']['visualNote']['zh']
paired=[]
for locale,prefix in [('zh',''),('en','en/')]:
 projection=(S/f'_includes/dressing-room-{locale}.md').read_text()
 anchors=re.findall(r'id="(dress-[^"]+)"',projection)
 assert len(anchors)==len(set(anchors))==124
 paired.append(anchors)
 html=(S/'_site'/prefix/'collectibles/dressing-room.html').read_text()
 for item in public['items']:
  assert projection.count(f'id="{item["anchor"]}"')==1
  assert html.count(f'id="{item["anchor"]}"')==1
  assert item['publicUnlockText'][locale] in projection
  if 'visualNote' in item:assert item['visualNote'][locale] in projection
 assert not re.search(r'\.rpy|\.png|\.rpa|sfw_prefs|assets_kg|rarm_heart',projection)
 assert '原生值' not in projection and 'Prime 奖励' not in projection
 search=json.loads((S/'_site'/prefix/'kt-search.json').read_text())
 rows=[x for x in search if x['type']=='outfit']
 assert len(rows)==124 and {x['href'].split('#')[1] for x in rows}==set(anchors)
assert paired[0]==paired[1]
print('Current Dressing contract PASS: 124 paired identities / 3 existing visual notes / exact Search destinations / publication boundary')
