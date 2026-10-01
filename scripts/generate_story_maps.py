#!/usr/bin/env python3
"""Generate both Mermaid projections from ONE semantic topology.

Labels and hrefs are locale surfaces only. Conditions remain in linked prose.
Generated includes are build inputs, not a second gameplay database.
"""
from pathlib import Path
import json
from html import escape
ROOT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads((ROOT / 'scripts/story_map_contracts.json').read_text())
ARROWS = {'optional': '-.->', 'confirmation': '==>', 'exclusion': '--x'}
def generate(m, locale):
    mid=m['id'];title=m['title'][locale]
    hint=('点击节点查正文；拖动平移，Ctrl／捏合缩放。完整图支持滚轮与触控板；方向键平移，＋／－缩放，0／F 重置视图，Esc 关闭。' if locale=='zh' else 'Select a node for the guide. Drag to pan; Ctrl / pinch to zoom. The full map supports wheel and trackpad, arrow keys, + / −, 0 / F to reset the view, and Esc to close.')
    presentation=m.get('presentation',{})
    flowchart={'curve':'linear','nodeSpacing':22,'rankSpacing':28,'padding':10,**presentation.get('flowchart',{})}
    config={'flowchart':flowchart,'themeVariables':{'fontSize':'15px'}}
    graph=['%%{init: '+json.dumps(config)+'}%%',f'flowchart {m["direction"]}',f'    accTitle: {title}',f'    accDescr: {m["note"][locale]}']
    def node_line(n):
        label=n['label'][locale]
        if mid=='journey':
            # Visual line wrapping only; labels/links and route order stay shared.
            for phrase in ('Redroot Wilds','Crystal Plains','Shieldfall Vale','Blueleaf Grove','Local activities'):
                label=label.replace(phrase,phrase.replace(' ','<br/>'))
            label=label.replace('Town / exploration','Town /<br/>exploration').replace('Travel / camp','Travel /<br/>camp').replace('Camp / local activities','Camp /<br/>local activities')
            label=label.replace('Public v0.57a cutoff','Public v0.57a<br/>cutoff')
        if n.get('annotation'):
            label += f"<br/><span class='kt-map-annotation'>{n['annotation'][locale]}</span>"
        return f'    {n["id"]}["{label}"]'
    def edge_line(edge):
        label=edge['label'][locale]
        annotation=f'|{label}|' if label else ''
        return f'    {edge["from"]} {ARROWS.get(edge["kind"], "-->")}{annotation} {edge["to"]}'
    if m.get('lanes'):
        nodes={n['id']:n for n in m['nodes']}
        for lane in m['lanes']:
            graph.extend([f'    subgraph {lane["id"]}["{lane["title"][locale]}"]', '        direction TB'])
            graph.extend('    '+node_line(nodes[id]) for id in lane['nodes'])
            graph.extend('    '+edge_line(e) for e in m['edges'] if e['from'] in lane['nodes'])
            graph.append('    end')
        if presentation.get('parallelLanes'):
            # Invisible cluster ordering only: not a relationship transition,
            # no arrow, and no connection between any gameplay nodes.
            graph.extend(f'    {left["id"]} ~~~ {right["id"]}' for left,right in zip(m['lanes'],m['lanes'][1:]))
        for kind,style in [('local','ktMapLocal'),('confirmation','ktMapConfirmed'),('decision','ktMapDecision')]:
            ids=','.join(n['id'] for n in m['nodes'] if n['kind']==kind)
            if ids:graph.append(f'    class {ids} {style}')
    else:
        graph.extend(node_line(n) for n in m['nodes'])
        graph.extend(edge_line(e) for e in m['edges'])
    for n in m['nodes']:
        graph.append(f'    click {n["id"]} href "{n["href"][locale]}" "{n["label"][locale].replace("<br/>", " ")}" _self')
    # An explicit navigation fallback is useful without JS and for small screens.
    links=' · '.join(f'<a href="{escape(n["href"][locale], quote=True)}">{escape(n["label"][locale].replace("<br/>", " · "))}</a>' for n in m['nodes'])
    compact=''
    if mid=='journey':
        compact='<ol class="kt-map-compact-overview">'+''.join(f'<li><a href="{escape(n["href"][locale],quote=True)}">{escape(n["label"][locale].replace("<br/>"," · "))}</a></li>' for n in m['nodes'])+'</ol>'
    height=presentation.get('inlineHeight',440)
    mobile=presentation.get('mobileHeight',300)
    rule=f'<p class="kt-map-rule">{escape(m["rule"][locale])}</p>\n' if m.get('rule') else ''
    preparation=''
    if m.get('preparation_note'):
        preparation=f'<p class="kt-map-preparation"><a href="{escape(m["preparation_href"][locale],quote=True)}">Zhokhar</a> — {escape(m["preparation_note"][locale])}</p>\n'
    invitations=''
    if m.get('local_invitations'):
        cards=[]
        for item in m['local_invitations']:
            refs=' · '.join(f'<a href="{escape(link["href"],quote=True)}">{escape(link["label"][locale])}</a>' for link in item['links'])
            cards.append(f'<div class="kt-map-local-card" data-local-invitation="{item["id"]}"><p><strong>{escape(item["name"])}</strong> — {escape(item["text"][locale])}</p><p>{refs}</p></div>')
        local_title='其他局部邀请' if locale=='zh' else 'Local invitations'
        invitations=f'<div class="kt-map-local-invitations"><p class="kt-map-local-title"><strong>{local_title}</strong></p><div class="kt-map-local-grid">'+''.join(cards)+'</div></div>\n'
    return f'''<!-- Generated from story_map_contracts.json; edit its locale labels, not topology here. -->
<div class="kt-story-map" data-map-id="{mid}" style="--kt-map-inline-height:{height}px;--kt-map-mobile-height:{mobile}px">
<p class="kt-map-title"><strong>{escape(title)}</strong></p>
{rule}<p class="kt-map-hint" id="{mid}-hint">{hint}</p>
<div class="kt-story-map-scroll" role="region" aria-label="{escape(title,quote=True)}" aria-describedby="{mid}-hint" tabindex="0">

```mermaid
{chr(10).join(graph)}
```

</div>
{compact}
{preparation}<p class="kt-map-note">{m['note'][locale]}</p>
{invitations}<details class="kt-map-text-links"><summary>{'文字链接' if locale=='zh' else 'Text links'}</summary><p>{links}</p></details>
</div>
'''
if __name__=='__main__':
    for m in CONTRACT['maps']:
        for locale in ('zh','en'):
            out=ROOT / '_includes' / f'{m["id"]}-{locale}.md'
            out.parent.mkdir(exist_ok=True);out.write_text(generate(m,locale))
    print('Mermaid includes: four maps × two locales, one shared topology')
