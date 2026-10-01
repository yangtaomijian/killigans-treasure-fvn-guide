#!/usr/bin/env python3
"""Validate projection contracts, live anchors, bilingual topology and content checksums."""
from pathlib import Path
import json,re,sys
from urllib.parse import urlsplit,unquote
from html.parser import HTMLParser
from generate_story_maps import CONTRACT,generate
from verify_render import SITE,OUTPUT,PAGES,source_contract
class IDs(HTMLParser):
    def __init__(self): super().__init__();self.ids=set()
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.add(a['id'])
for m in CONTRACT['maps']:
    nodes={n['id']:n for n in m['nodes']};assert len(nodes)==len(m['nodes'])
    for edge in m['edges']:assert edge['from'] in nodes and edge['to'] in nodes
    graphs=[]
    for locale,prefix in [('zh',''),('en','en/')]:
        generated=(SITE/'_includes'/f'{m["id"]}-{locale}.md').read_text()
        assert generated==generate(m,locale),'Generated include drift'
        graphs.append([(e['from'],e['to'],e['kind']) for e in m['edges']])
        page=OUTPUT/prefix/(m['page']+'.html')
        for n in m['nodes']:
            url=urlsplit(n['href'][locale]);assert url.fragment and not url.scheme
            target=(page.parent/url.path).resolve() if url.path else page
            assert target.is_file(),target
            ids=IDs();ids.feed(target.read_text());assert unquote(url.fragment) in ids.ids,(locale,n['id'],url.fragment)
        markup=page.read_text();assert f'data-map-id="{m["id"]}"' in markup
        assert markup.count('id="kt-story-map-style"')==1
        assert '../research/' not in generated
    assert graphs[0]==graphs[1]
from story_map_validation import validate_relationship
validate_relationship(CONTRACT['maps'][0])
P=CONTRACT['maps'][1];assert ('wLate','miss','exclusion') in [(e['from'],e['to'],e['kind']) for e in P['edges']]
assert not any(e['from']=='wLate' and e['to']=='talk' for e in P['edges'])
C=CONTRACT['maps'][2];edges={(e['from'],e['to']):e['kind'] for e in C['edges']}
assert edges['sure','noFree']=='exclusion' and edges['decline','free']=='continuation'
assert edges['invite','decline']=='continuation' # No invitation skips the answer/save branch.
assert not any(e['from']=='sure' and e['to'] in ('free','recover') for e in C['edges'])
J=CONTRACT['maps'][3];order=['redroot','wilds','aris','plains','unknown','vale','spice','grove','cutoff']
assert [n['id'] for n in J['nodes']]==order
assert [(e['from'],e['to']) for e in J['edges']]==list(zip(order,order[1:]))
# Verify public content checksums without external source snapshots.
import hashlib
checksums = dict((relative, digest) for digest, relative in (
    row.split('  ', 1) for row in (SITE/'scripts/public-content.sha256').read_text().splitlines()))
for prefix in ('','en/'):
    for route in ('reference/relationships.md','guide/spiceport.md'):
        relative = prefix + route
        path = SITE / relative
        assert hashlib.sha256(path.read_bytes()).hexdigest() == checksums[relative], ('Public source checksum changed', relative)
        new = path.read_text()
        # Stable anchors never enter a collapsed secondary explanation.
        for folded in re.findall(r'<details class="kt-read-more">(.*?)</details>',new,re.S):
            assert '<a id=' not in folded
    ids=[source_contract(SITE/prefix/(p+'.md'))[0] for p in PAGES]
    assert sum(map(len,ids))==125
print('PASS: four shared map contracts; current map links across locales; Relationship / Spiceport / Journey semantics; 125 anchors per locale; public source checksums unchanged')
