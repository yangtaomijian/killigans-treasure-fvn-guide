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
FAVICON_ASSETS = ('favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png')
SOCIAL_IMAGES = {locale: f'assets/social/killigans-treasure-camp-{locale}.png' for locale in ('zh', 'en')}


# Page-specific summaries describe existing public content; guide prose stays untouched.
PAGE_DESCRIPTIONS = {'collectibles/codex': ('按人物、种族、魔法、历史与地区查 Codex 条目，核对更新、附页与可选页面的取得条件。',
                        'Look up Codex entries by People, Species, Magic, History and World, including '
                        'updates, extra pages and optional-page unlocks.'),
 'collectibles/dressing-room': ('使用 Dressing Room 定位器查人物服装、表情与解锁，区分装备持有、实际穿着与换装外观。',
                                'Use the Dressing Room locator to check outfits, expressions and unlocks, '
                                'with guidance on equipment, worn clothing and gallery appearances.'),
 'collectibles/equipment': ('按地区查装备、服装与补给的取得方式，包括 Prime Attire 准备、穿着选择与可选收集。',
                            'Find equipment, clothing and supplies by region, including Prime Attire '
                            'preparation, outfit choices and optional items.'),
 'collectibles/memories': ('按游戏内地区分类和条目位置反查 Memories / CG，辨认同名画面、关键选择与补收集所需的存档。',
                           'Find Memories and CGs by in-game region and entry position, distinguish repeated '
                           'titles, and check choices and saves for missing scenes.'),
 'discussions': ('浏览 Killigan’s Treasure 攻略各页的玩家讨论，查阅攻略问题、补充与反馈。',
                 'Browse player discussions across the Killigan’s Treasure guide, including questions, '
                 'additions and feedback.'),
 'guide/aris': ('按阿瑞斯当地日期查自由行动、竞技场准备、Prime Attire、Athlima Summit，以及宴会与离城前的关系选择。',
                'Plan Aris by local day: free time, Coliseum preparation, Prime Attire, the Athlima Summit, '
                'banquet choices and departure.'),
 'guide/blueleaf-grove': ('查阅蓝叶森林的抵达准备、夜间交谈、赠礼路线、Zhokhar 切磋与最后一晚，衔接 Public v0.57a 当前终点。',
                          'Check Blueleaf Grove arrivals, evening conversations, gift routes, Zhokhar '
                          'sparring and the final night through the Public v0.57a endpoint.'),
 'guide/crystal-plains-shieldfall': ('查阅水晶平原、途中夜宿与盾落谷的旅程提醒、可选 Memories，以及前往斯派斯港的衔接。',
                                     'Follow Crystal Plains, the overnight stop and Shieldfall Vale, with '
                                     'optional Memories and the onward journey to Spiceport.'),
 'guide/redroot': ('从红根镇到红根镇荒野，按旅程查衣物、采集、Cabotte 事件与可选 Memories，准备前往阿瑞斯。',
                   'Follow Redroot and Redroot Wilds, including clothing, gathering, Cabotte events and '
                   'optional Memories before travelling to Aris.'),
 'guide/spiceport': ('按斯派斯港日期查同伴远足、回访、自由行动、海滩事件与关系决定，核对离城前的安排。',
                     'Plan Spiceport by day: companion outings, return visits, free time, beach events, '
                     'relationship decisions and departure.'),
 'help': ('查 Gallery / Memories 入口、缺失解锁、装备、存档与版本更新问题，帮助回归玩家接续旅程。',
          'Get help with Gallery and Memories access, missing unlocks, equipment, saves and game updates '
          'when returning to the journey.'),
 'reference/combat': ('按地区查战斗准备与 QTE 操作，快速定位旅途中的对手和需要留意的战斗环节。',
                      'Look up combat preparation and QTE controls by region, with quick references for '
                      'encounters along the journey.'),
 'reference/personality': ('了解 Noble、Neutral 与 Barbaric 性格倾向，按地区查选项、着装与剧情差分。',
                           'Understand Noble, Neutral and Barbaric personality tendencies, then find '
                           'regional differences in choices, clothing and scenes.'),
 'reference/relationships': ('查关系发展阶段、Macsen、Zhokhar、Ray 与 Cabotte 的事件准备，以及 Memories 标记与关键关系选择。',
                             'Check relationship stages, event preparation for Macsen, Zhokhar, Ray and '
                             'Cabotte, Memories markers and key relationship choices.')}

def canonical(relative):
    return ORIGIN + "/" + (relative[:-10] if relative.endswith("index.html") else relative)


def favicon_links(path, asset_root, root_relative=False):
    links = []
    for name, attributes in (
        ('favicon-32x32.png', 'rel="icon" type="image/png" sizes="32x32"'),
        ('favicon.svg', 'rel="icon" type="image/svg+xml"'),
        ('apple-touch-icon.png', 'rel="apple-touch-icon" sizes="180x180"'),
    ):
        href = ('/' + (asset_root / name).relative_to(OUTPUT).as_posix()
                if root_relative else os.path.relpath(asset_root / name, path.parent))
        links.append(f'<link {attributes} href="{href}">')
    return links


def finalize():
    token = os.environ.get("KT_CF_ANALYTICS_TOKEN", "")
    if token and not re.fullmatch(r"[a-fA-F0-9]{32}", token):
        raise SystemExit("KT_CF_ANALYTICS_TOKEN must be a 32-character public Cloudflare beacon ID")
    visual_paths = [SITE / 'assets' / name for name in FAVICON_ASSETS] + [SITE / image for image in SOCIAL_IMAGES.values()]
    for path in visual_paths:
        if not path.is_file():
            raise SystemExit(f'Missing publication asset: {path.relative_to(SITE)}')
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
            if page != "index":
                h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", source, re.S)
                if not h1:
                    raise SystemExit(f"Missing page heading: {locale}{page}")
                heading = unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip()
                title = heading + (" · Killigan’s Treasure Guide" if english else " · Killigan’s Treasure 攻略")
                description = PAGE_DESCRIPTIONS[page][int(english)]
                head = re.sub(r"<title>.*?</title>", "<title>" + escape(title) + "</title>", head, flags=re.S)
            target = page + ".html"
            url = canonical(locale + target)
            zh, en = canonical(target), canonical("en/" + target)
            image = ORIGIN + '/' + SOCIAL_IMAGES['en' if english else 'zh']
            # Idempotence: replace only publication-owned metadata in <head>.
            head = re.sub(r'\s*<link\b[^>]*\brel="(?:canonical|alternate|icon|apple-touch-icon)"[^>]*>', '', head)
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
            tags.extend(favicon_links(path, OUTPUT / locale / 'assets'))
            for key, value in {'type':'website', 'site_name':'Carambi', 'title':title,
                    'description':description, 'url':url, 'locale':'en_US' if english else 'zh_CN',
                    'locale:alternate':'zh_CN' if english else 'en_US', 'image':image,
                    'image:type':'image/png', 'image:width':'1200', 'image:height':'630',
                    'image:alt':'Killigan’s Treasure Public v0.57a · Carambi'}.items():
                tags.append(meta('og:' + key, value, True))
            for key, value in {'card':'summary_large_image','title':title,'description':description,
                    'image':image,'image:alt':'Killigan’s Treasure Public v0.57a · Carambi'}.items():
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
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(asset, destination)
    (OUTPUT / '404.html').write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Page not found · Killigan’s Treasure</title><style>body{background:#fbfaf7;color:#28251f;font:1.1rem system-ui;max-width:40rem;margin:12vh auto;padding:1.5rem}a{color:inherit}@media(prefers-color-scheme:dark){body{background:#242321;color:#eee9df}}</style></head><body><h1>Page not found / 未找到页面</h1><p><a href="/">中文首页</a> · <a href="/en/">English home</a></p></body></html>''')
    not_found = OUTPUT / '404.html'
    not_found.write_text(not_found.read_text().replace('</head>', '\n'.join(favicon_links(not_found, OUTPUT / 'assets', root_relative=True)) + '</head>'))
    for metadata in OUTPUT.rglob('.DS_Store'):
        metadata.unlink()
    print('Publication visuals: SVG/PNG favicons and bilingual social cards present')
    print('PASS: production metadata; 28 canonical sitemap routes; analytics '+('configured' if token else 'awaiting dedicated KT beacon ID'))


if __name__ == '__main__':
    finalize()
