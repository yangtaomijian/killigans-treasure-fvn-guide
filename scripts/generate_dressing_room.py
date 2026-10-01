#!/usr/bin/env python3
"""Render both locales from one shared player-visible inventory."""
from pathlib import Path
import json
from html import escape
S=Path(__file__).resolve().parents[1]
data=json.loads((S/'scripts/dressing_room_inventory.json').read_text())
characters={x['id']:x for x in data['characters']};categories={x['id']:x for x in data['categories']}
assert len(data['items'])==len({x['anchor'] for x in data['items']})
assert len({(x['character'],x['category'],x['visibleValue']) for x in data['items']})==len(data['items'])
route_names={
'default':('起始选项','Starting options'),'silvatto':('Silvatto 奖励','Silvatto rewards'),
'aris-shop':('Aris 商店','Aris shop'),'langou':('内衣 · 编号 4','Langou · value 4'),
'marchanide':('Marchanide Langou','Marchanide Langou'),'summit':('普通参赛服（Summit Attire）','Summit Attire'),
'prime':('特制参赛服（Prime Attire）','Prime Attire'),'post-summit':('赛后选项','After the Summit'),
'weapon':('武器 · 编号 0、1','Weapon · values 0, 1'),'spice-shop':('Spiceport 商店','Spiceport shop'),
'backroom':('Spiceport 后仓','Spiceport back room'),'crystal-return':('Birdigan / Ray','Birdigan / Ray'),
'shieldfall':('Zhokhar / Binini','Zhokhar / Binini')}
retrieval=[]
for i in data['items']:
 c=characters[i['character']];k=categories[i['category']];r=data['routes'][i['route']]
 retrieval.append({**i,'pageKey':'dressing-room','characterName':c['name'],'categoryName':k['nativeName'],'categoryLabel':k['label'],
 'kind':r['kind'],'publicUnlockText':r['unlock'],'earliest':c['available'] if i['route']=='default' else r['earliest'],'recovery':r['recovery'],'links':r['links']})
public={k:data[k] for k in ('version','groups','characters','categories')};public['items']=retrieval
(S/'assets/kt-dressing-room.json').write_text(json.dumps(public,ensure_ascii=False,indent=2)+'\n')
for loc in ('zh','en'):
 en=loc=='en';E=lambda v:escape(str(v),quote=True)
 lines=['<section class="kt-dressing-locator" data-kt-dressing-room>',
 '<div class="kt-dressing-controls" hidden></div>',
 '<div class="kt-dressing-detail" aria-live="polite" hidden></div>',
 '<details class="kt-dressing-catalog"><summary>'+('All outfit references (text view)' if en else '全部 Outfit 条目（文字视图）')+'</summary>']
 for i in retrieval:
  title=f"{i['characterName']} · {i['categoryName']} · {i['visibleValue']}"
  lines += [f'<section id="{i["anchor"]}" class="kt-dressing-entry" data-dress-character="{i["character"]}" data-dress-category="{i["category"]}" data-dress-value="{E(i["visibleValue"])}">',f'<h3 tabindex="-1">{E(title)}</h3>','<dl>']
  kind={'default':('默认','Default'),'automatic':('剧情自动','Story automatic'),'optional':('可选','Optional')}[i['kind']][en]
  fields=[('开放类型' if not en else 'Unlock type',kind),('开放方式' if not en else 'How to unlock',i['publicUnlockText'][loc]),('最早机会' if not en else 'Earliest opportunity',i['earliest'][loc]),('错过后 / 补收' if not en else 'Recovery',i['recovery'][loc])]
  if 'itemName' in i:
   garment=i['itemName'] if en else {'Prime Attire':'特制参赛服（Prime Attire）','Summit Attire':'普通参赛服（Summit Attire）'}.get(i['itemName'],i['itemName'])
   fields.insert(1,('对应衣物' if not en else 'Related garment',garment))
  if 'visualNote' in i:fields.append(('外观说明' if not en else 'Appearance note',i['visualNote'][loc]))
  if 'setting' in i:fields.append(('内容设置' if not en else 'Content setting',i['setting'][loc]))
  for label,value in fields:lines.append(f'<dt>{E(label)}</dt><dd>{E(value)}</dd>')
  lines+=['</dl>','<p>'+(' · '.join(f'<a href="{E(x["href"])}">{E(x["label"][loc])}</a>' for x in i['links']))+'</p>','</section>']
 lines+=['</details>','</section>']
 (S/f'_includes/dressing-room-{loc}.md').write_text('\n'.join(lines)+'\n')
 # Summary only points into the same generated route details; acquisition conditions live once.
 summary=['| '+('Unlock reference | Earliest opportunity | Details' if en else '开放索引 | 最早机会 | 具体条件')+' |','|---|---|---|']
 for key in data['routes']:
  target=next(x for x in retrieval if x['route']==key)
  summary.append(f'| {route_names[key][en]} | {target["earliest"][loc]} | [{"Open reference" if en else "查看条件"}](#{target["anchor"]}) |')
 (S/f'_includes/dressing-room-summary-{loc}.md').write_text('\n'.join(summary)+'\n')
print(f'Dressing Room: {len(retrieval)} outfit identities, two shared-data projections')
