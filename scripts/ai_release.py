"""Exact public allowlist and deterministic AI release assembly. No broad asset glob."""
from pathlib import Path
import hashlib
import json
import re
import shutil

LEGACY = frozenset(('panel.mjs panel.css strings.mjs question-limits.mjs question-language.mjs google-gis.mjs '
    'google-g.png beta-application.mjs adapter.mjs transport.mjs feedback.mjs followup-config.mjs '
    'followup-transport.mjs mode-transport.mjs').split())
ASSETS = LEGACY | {'release-guard.mjs'}
BACKEND = {'worker': '20f3d3a80e20dbc0af5f481c20f2f31f5056a935baf407bab951c625a38f000d',
           'gateway': '129d77d2b2208a3574577fc01f64510a63f32228b02399bed6521da82724fb69'}
def sha(data): return hashlib.sha256(data).hexdigest()
def encoded(value): return (json.dumps(value, sort_keys=True, separators=(',', ':'))+'\n').encode()
def compatibility(site):
    # Old entry URLs must not bootstrap the retired two-entry panel. A fully
    # loaded pre-upgrade tab keeps its original status/cancel APIs unchanged.
    stub='''if(typeof document!=="undefined"&&!document.getElementById("kt-ai-reload-required")){const p=document.createElement("p");p.id="kt-ai-reload-required";p.setAttribute("role","status");p.textContent=document.documentElement.lang.startsWith("en")?"The AI panel was updated. Refresh this page. Existing requests can still be checked or cancelled in their open tab.":"AI 面板已更新，请刷新页面。已有请求仍可在原标签页查询或取消。";document.body?document.body.append(p):document.addEventListener("DOMContentLoaded",()=>document.body.append(p),{once:true});}throw Error("KT_AI_RELOAD_REQUIRED");\n'''.encode()
    return {n:stub if n.endswith('.mjs') else (site/'assets/ai-beta'/n).read_bytes() for n in LEGACY}
def assemble(site, output, previous=None):
    source = site/'assets/ai-beta'
    assert {p.name for p in source.iterdir() if p.is_file()} == ASSETS
    inputs = {n:sha((source/n).read_bytes()) for n in sorted(ASSETS)}
    compat=compatibility(site); compat_hashes={n:sha(data) for n,data in compat.items()}
    release = sha(encoded({'assets':inputs, 'backend':BACKEND, 'compatibility':compat_hashes}))[:24]
    target = output/'assets/ai-beta'
    if previous:
        prior=Path(previous).resolve()
        assert prior!=output.resolve(), 'Previous release must be a separate reviewed artifact'
        verify(prior)
        registry=json.loads((prior/'assets/ai-beta/active-release.json').read_text())
        for version in registry['retainedReleases']:
            shutil.copytree(prior/'assets/ai-beta/releases'/version,target/'releases'/version,dirs_exist_ok=True)
        (target/'active-release.json').write_bytes(encoded(registry))
    folder = target/'releases'/release
    folder.mkdir(parents=True, exist_ok=True)
    for n in sorted(ASSETS):
        data=(source/n).read_bytes()
        if n.endswith('.mjs') and n!='release-guard.mjs':
            data=b"import {assertModule as assertReleaseModule} from './release-guard.mjs';assertReleaseModule(import.meta.url);\n"+data
        (folder/n).write_bytes(data)
    manifest={'release':release,'backend':BACKEND,'inputs':inputs,'compatibility':compat_hashes,'assets':{n:sha((folder/n).read_bytes()) for n in sorted(ASSETS)}}
    (folder/'manifest.json').write_bytes(encoded(manifest))
    previous=json.loads((target/'active-release.json').read_text()) if (target/'active-release.json').exists() else {}
    retained=sorted(set(previous.get('retainedReleases',[previous['release']] if previous else []))|{release})
    (target/'active-release.json').write_bytes(encoded({'release':release,'backend':BACKEND,'retainedReleases':retained}))
    for n,data in compat.items(): (target/n).write_bytes(data)
    for n in ASSETS-LEGACY:
        if (target/n).exists(): (target/n).unlink()
    return release
def public_paths(output):
    active=output/'assets/ai-beta/active-release.json'
    if not active.exists(): return set(),set()
    data=json.loads(active.read_text()); retained=data['retainedReleases']
    assert data['release'] in retained and retained==sorted(set(retained)), 'Invalid release registry'
    assert all(re.fullmatch('[a-f0-9]{24}',v) for v in retained), 'Invalid release id'
    folders=[Path('assets/ai-beta/releases')/v for v in retained]
    return {folder/n for folder in folders for n in ASSETS}, {folder/'manifest.json' for folder in folders}|{Path('assets/ai-beta/active-release.json')}
def verify(output):
    target=output/'assets/ai-beta'; active=json.loads((target/'active-release.json').read_text()); release=active['release']
    assets,metadata=public_paths(output)
    assert {p.relative_to(target) for p in target.rglob('*') if p.is_file()} == {Path(n) for n in LEGACY}|{p.relative_to('assets/ai-beta') for p in assets|metadata}, 'Unexpected AI release resource'
    for version in active['retainedReleases']:
        manifest=json.loads((target/'releases'/version/'manifest.json').read_text())
        assert active['backend']==manifest['backend']==BACKEND
        assert version==sha(encoded({'assets':manifest['inputs'],'backend':BACKEND,'compatibility':manifest['compatibility']}))[:24]
        assert set(manifest['assets'])==ASSETS
        for n,h in manifest['assets'].items(): assert sha((target/'releases'/version/n).read_bytes())==h, ('Asset hash mismatch',n)
        for n in ASSETS:
            if n.endswith('.mjs'):
                text=(target/'releases'/version/n).read_text()
                for ref in re.findall(r'(?:from\s*|import\s*)[\'"]([^\'"]+)[\'"]',text):
                    assert ref.startswith('./') and ref[2:] in ASSETS, ('Module outside release',n,ref)
    current=json.loads((target/'releases'/release/'manifest.json').read_text())
    for n,h in current['compatibility'].items(): assert sha((target/n).read_bytes())==h, ('Compatibility asset changed',n)
    assert set(current['compatibility'])==LEGACY
    for p in target.rglob('*.mjs'):
        assert 'Question mode' not in p.read_text() and 'kt-ai-mode-row' not in p.read_text(), ('Retired entry returned',p)
    return release
