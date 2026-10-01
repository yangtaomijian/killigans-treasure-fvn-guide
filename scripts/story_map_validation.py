"""Validate public Relationship map semantics."""
import re

def validate_relationship(m):
    nodes = {n['id']: n for n in m['nodes']}
    edges = {(e['from'], e['to']): e for e in m['edges']}
    assert len(nodes) == 13 and len(edges) == 12
    assert m['direction'] == 'LR' and len(m['lanes']) == 2
    membership = {id: lane['id'] for lane in m['lanes'] for id in lane['nodes']}
    assert set(membership) == set(nodes) and sum(len(l['nodes']) for l in m['lanes']) == len(nodes)
    assert all(membership[e['from']] == membership[e['to']] for e in m['edges']), 'Cross-lane implication'
    assert edges['intention', 'balcony']['kind'] == 'optional', 'Romantic is not a balcony prerequisite'
    assert edges['friendly', 'balcony']['kind'] == 'continuation', 'Friendly reaches balcony'
    assert edges['intention', 'massage']['kind'] == 'optional' and nodes['massage']['kind'] == 'local'
    assert [e['from'] for e in m['edges'] if e['to'] == 'massage'] == ['intention'], 'Romantic enables massage'
    assert edges['balcony', 'macYes']['kind'] == 'confirmation'
    assert edges['balcony', 'macNo']['label'] == {'zh': 'No', 'en': 'No'}
    assert '清除' in nodes['macNo']['label']['zh'] and 'cleared' in nodes['macNo']['label']['en']
    assert nodes['trial']['kind'] == 'trial' and all('Competition' in t for t in nodes['trial']['label'].values())
    assert edges['zTalk', 'trial']['kind'] == 'trial'
    assert edges['trial', 'zPark']['kind'] == 'required' and nodes['zPark']['kind'] == 'local'
    assert [e['from'] for e in m['edges'] if e['to'] == 'zPark'] == ['trial']
    assert edges['support', 'zFormal']['kind'] == 'continuation'
    assert '不建立试探' in nodes['support']['label']['zh'] and 'No trial' in nodes['support']['label']['en']
    assert not any(e['kind'] == 'required' and e['to'] == 'zFormal' for e in m['edges'])
    assert 'Competition 非必需' in nodes['zFormal']['annotation']['zh']
    assert '关系准备足够也可进入' in nodes['zFormal']['annotation']['zh']
    assert 'Competition is not required' in nodes['zFormal']['annotation']['en']
    assert 'sufficient closeness can also qualify' in nodes['zFormal']['annotation']['en']
    assert edges['zFormal', 'zYes']['kind'] == 'confirmation'
    assert '结束已有试探' in nodes['zNo']['label']['zh'] and 'trial ends' in nodes['zNo']['label']['en']
    assert {n['id'] for n in m['nodes'] if n['kind'] == 'confirmation'} == {'macYes', 'zYes'}
    assert not set(nodes) & {'early', 'save', 'warehouse', 'excluded', 'zEarly', 'ray', 'rayInvite', 'rayEvent', 'cab', 'cabEvent'}
    assert all(e['kind'] != 'exclusion' for e in m['edges'])
    assert all(name in m['rule']['zh'] and name in m['rule']['en'] for name in ['Macsen', 'Zhokhar', 'Ray'])
    assert '不再开放' in m['rule']['zh'] and 'closes' in m['rule']['en']
    assert '自身条件' in m['note']['zh'] and 'his own conditions' in m['note']['en']
    assert m['preparation_href'] == {'zh': '#prepare-zhokhar', 'en': '#prepare-zhokhar'}
    assert '并非必需' in m['preparation_note']['zh']
    assert [x['name'] for x in m['local_invitations']] == ['Ray', 'Cabotte']
    assert {l['href'] for x in m['local_invitations'] for l in x['links']} == {'#prepare-ray', '#question-mark-ray', '#cabotte-wilds'}
    for invitation in m['local_invitations']:
        assert '不会确认伴侣' in invitation['text']['zh']
        assert re.search(r'does not confirm|without confirming', invitation['text']['en'])
    assert 'confirmed Macsen' in m['local_invitations'][0]['text']['en']
    assert 'Sure' in m['local_invitations'][1]['text']['en']
    assert m['presentation']['inlineHeight'] <= 380
    assert m['presentation']['parallelLanes'] is True
