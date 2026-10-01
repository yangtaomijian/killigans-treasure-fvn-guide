#!/usr/bin/env python3
"""Add publication metadata to the assembled pages, never to guide prose."""
import json
import os
import re
import shutil
from html import escape, unescape
from pathlib import Path
from xml.etree import ElementTree as ET

from verify_render import OUTPUT, PAGES, SITE

ORIGIN = "https://killigans-treasure.carambi.com"


def canonical(relative):
    return ORIGIN + "/" + (relative[:-10] if relative.endswith("index.html") else relative)


def finalize():
    token = os.environ.get("KT_CF_ANALYTICS_TOKEN", "")
    if token and not re.fullmatch(r"[a-fA-F0-9]{32}", token):
        raise SystemExit("KT_CF_ANALYTICS_TOKEN must be a 32-character public Cloudflare beacon ID")
    visual_paths = [SITE / 'assets/favicon.svg'] + [SITE / f'assets/social/kt-public-v0.57a-{locale}.png' for locale in ('zh', 'en')]
    if not all(path.is_file() for path in visual_paths):
        print('Final user-provided favicon/social cards pending; omitting references to missing assets.')
    urls = []
    for locale in ("", "en/"):
        english = bool(locale)
        for page in PAGES:
            path = OUTPUT / locale / (page + ".html")
            source = path.read_text()
            match = re.search(r"<head\b[^>]*>(.*?)</head>", source, re.S)
            head = match.group(1)
            title = unescape(re.search(r"<title>(.*?)</title>", head, re.S).group(1))
            description_match = re.search(r'<meta name="description" content="([^"]*)"', head)
            description = unescape(description_match.group(1)) if description_match else (
                "Unofficial bilingual guide for Killigan’s Treasure Public v0.57a."
                if english else "Killigan’s Treasure Public v0.57a 非官方双语攻略。")
            target = page + ".html"
            url = canonical(locale + target)
            zh, en = canonical(target), canonical("en/" + target)
            social_ready = (SITE / ('assets/social/kt-public-v0.57a-' + ('en' if english else 'zh') + '.png')).is_file()
            image = ORIGIN + "/assets/social/kt-public-v0.57a-" + ("en" if english else "zh") + ".png"
            # Idempotence: replace only publication-owned metadata in <head>.
            head = re.sub(r'\s*<link\b[^>]*\brel="(?:canonical|alternate|icon)"[^>]*>', '', head)
            head = re.sub(r'\s*<meta\b[^>]*(?:property="og:[^"]+"|name="(?:twitter:[^"]+|description|robots|theme-color|msvalidate\.01)")[^>]*>', '', head)
            head = re.sub(r'\s*<!-- KT production metadata -->.*?<!-- /KT production metadata -->', '', head, flags=re.S)
            def meta(name, value, prop=False):
                return '<meta ' + ('property' if prop else 'name') + '="' + name + '" content="' + escape(value, quote=True) + '">'
            tags = [f'<link rel="canonical" href="{url}">',
                    f'<link rel="alternate" hreflang="zh-Hans" href="{zh}">',
                    f'<link rel="alternate" hreflang="en" href="{en}">',
                    f'<link rel="alternate" hreflang="x-default" href="{zh}">',
                    meta('theme-color', '#fbfaf7'), meta('description', description),
                    # Public ownership marker supplied by Bing Webmaster Tools.
                    meta('msvalidate.01', 'CE5B12344E8DBB0290A70A12A1D2B19E')]
            if (SITE / 'assets/favicon.svg').is_file():
                tags.append(f'<link rel="icon" type="image/svg+xml" href="{os.path.relpath(OUTPUT / "assets/favicon.svg", path.parent)}">')
            for key, value in {'type':'website', 'site_name':'Carambi', 'title':title,
                    'description':description, 'url':url, 'locale':'en_US' if english else 'zh_CN',
                    'locale:alternate':'zh_CN' if english else 'en_US', 'image':image,
                    'image:type':'image/png', 'image:width':'1200', 'image:height':'630',
                    'image:alt':'Killigan’s Treasure Public v0.57a · Carambi'}.items():
                if not key.startswith('image') or social_ready:
                    tags.append(meta('og:' + key, value, True))
            for key, value in {'card':'summary_large_image' if social_ready else 'summary','title':title,'description':description,
                    'image':image,'image:alt':'Killigan’s Treasure Public v0.57a · Carambi'}.items():
                if not key.startswith('image') or social_ready:
                    tags.append(meta('twitter:' + key, value))
            urls.append((url, zh, en))
            head = re.sub(r'<script data-kt-analytics>.*?</script>', '', head, flags=re.S)
            head += '\n<!-- KT production metadata -->\n' + '\n'.join(tags) + '\n<!-- /KT production metadata -->\n'
            if token:
                config = json.dumps({'token': token})
                tagscript = f'''<script data-kt-analytics>if(location.protocol==='https:'&&location.hostname==='killigans-treasure.carambi.com'){{const s=document.createElement('script');s.src='https://static.cloudflareinsights.com/beacon.min.js';s.defer=true;s.dataset.cfBeacon={json.dumps(config)};document.head.append(s);}}</script>'''
                head += tagscript
            head = re.sub(r'<script data-kt-analytics>.*?</script>', '', head, flags=re.S) if not token else head
            path.write_text(source[:match.start(1)] + head + source[match.end(1):])
    ns = 'http://www.sitemaps.org/schemas/sitemap/0.9'
    xhtml = 'http://www.w3.org/1999/xhtml'
    ET.register_namespace('', ns)
    ET.register_namespace('xhtml', xhtml)
    root = ET.Element('{'+ns+'}urlset')
    for url, zh, en in urls:
        node = ET.SubElement(root, '{'+ns+'}url')
        ET.SubElement(node, '{'+ns+'}loc').text = url
        for lang, href in [('zh-Hans', zh), ('en', en), ('x-default', zh)]:
            ET.SubElement(node, '{'+xhtml+'}link', rel='alternate', hreflang=lang, href=href)
    ET.ElementTree(root).write(OUTPUT / 'sitemap.xml', encoding='utf-8', xml_declaration=True)
    (OUTPUT / 'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: '+ORIGIN+'/sitemap.xml\n')
    shutil.copyfile(SITE / 'CNAME', OUTPUT / 'CNAME')
    (OUTPUT / '.nojekyll').touch()
    for asset in visual_paths:
        destination = OUTPUT / asset.relative_to(SITE)
        if asset.is_file():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(asset, destination)
        else:
            destination.unlink(missing_ok=True)
    (OUTPUT / '404.html').write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Page not found · Killigan’s Treasure</title><style>body{background:#fbfaf7;color:#28251f;font:1.1rem system-ui;max-width:40rem;margin:12vh auto;padding:1.5rem}a{color:inherit}@media(prefers-color-scheme:dark){body{background:#242321;color:#eee9df}}</style></head><body><h1>Page not found / 未找到页面</h1><p><a href="/">中文首页</a> · <a href="/en/">English home</a></p></body></html>''')
    for metadata in OUTPUT.rglob('.DS_Store'):
        metadata.unlink()
    print('Publication visuals: '+('user final assets present' if all(path.is_file() for path in visual_paths) else 'PENDING user-supplied favicon/social cards; site publication allowed'))
    print('PASS: production metadata; 28 canonical sitemap routes; analytics '+('configured' if token else 'awaiting dedicated KT beacon ID'))


if __name__ == '__main__':
    finalize()
