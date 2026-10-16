"""download reference app icons via the public iTunes Search API (internal reference only)"""
import json, urllib.request, urllib.parse, sys, os
OUT = '/workspace/cunmu-shots/compare/r13/refs'
APPS = [  # (search term, country, short name)
 ('Things 3 Cultured Code', 'us', 'Things 3'), ('Bear Markdown Notes', 'us', 'Bear'), ('Craft Docs and Notes', 'us', 'Craft'),
 ('Reeder Silvio Rizzi', 'us', 'Reeder'), ('Mela Recipe Manager', 'us', 'Mela'), ('Tot Iconfactory', 'us', 'Tot'),
 ('Halide Mark II', 'us', 'Halide'), ('Flighty Live Flight Tracker', 'us', 'Flighty'), ('Day One Journal', 'us', 'Day One'),
 ('Sequel media tracker', 'us', 'Sequel'), ('Letterboxd', 'us', 'Letterboxd'), ('Notion', 'us', 'Notion'),
 ('Obsidian Connected Notes', 'us', 'Obsidian'), ('Crouton Recipe Manager', 'us', 'Crouton'), ('Gentler Streak', 'us', 'Gentler Streak'),
 ('NYT Games Wordle', 'us', 'NYT Games'), ('Overcast podcast', 'us', 'Overcast'), ('iA Writer', 'us', 'iA Writer'),
 ('Ivory for Mastodon Tapbots', 'us', 'Ivory'), ('Fantastical Calendar', 'us', 'Fantastical'), ('Arc Search', 'us', 'Arc Search'),
 ('Linear mobile', 'us', 'Linear'), ('Darkroom photo editor', 'us', 'Darkroom'), ('Bears Gratitude', 'us', 'Bears Gratitude'),
 ('即刻', 'cn', '即刻'), ('少数派', 'cn', '少数派'), ('flomo 浮墨笔记', 'cn', 'flomo'), ('微信读书', 'cn', '微信读书'),
 ('豆瓣', 'cn', '豆瓣'), ('一木记账', 'cn', '一木记账'), ('流光卡片', 'cn', '流光卡片'), ('CapWords', 'us', 'CapWords'),
]
log = []
for term, cc, short in APPS:
    q = urllib.parse.urlencode({'term': term, 'country': cc, 'entity': 'software', 'limit': 1})
    try:
        r = json.load(urllib.request.urlopen(f'https://itunes.apple.com/search?{q}', timeout=20))
        if not r['results']: log.append((short, 'NOT FOUND', '', '')); continue
        it = r['results'][0]
        url = it['artworkUrl512'].replace('512x512bb', '1024x1024bb')
        fn = os.path.join(OUT, short.replace(' ', '_') + '.png')
        url = url.rsplit('.', 1)[0] + '.png' if url.endswith('.jpg') else url
        urllib.request.urlretrieve(url, fn)
        log.append((short, it['trackName'], it.get('sellerName', ''), it['trackViewUrl'].split('?')[0]))
    except Exception as e:
        log.append((short, 'ERR ' + str(e)[:60], '', ''))
json.dump(log, open(os.path.join(OUT, 'refs.json'), 'w'), ensure_ascii=False, indent=1)
for l in log: print(' | '.join(l))
