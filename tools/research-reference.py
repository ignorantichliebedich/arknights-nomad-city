"""Inspect an independently archived public localization for original component references."""
import json,runpy,urllib.parse
from pathlib import Path
from research import fetch

source=Path('.data/sources')
details=json.loads(fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',urllib.parse.urlencode({'itemcount':1,'publishedfileids[0]':'3334529179'}).encode()))
raw=fetch(details['response']['publishedfiledetails'][0]['file_url'])
try:obj=json.loads(raw.decode('utf-8-sig'))
except UnicodeError:obj=runpy.run_path('tools/extract-tabletop.py')['document'](raw)[0]
(source/'reference-localization.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
def walk(o,parent=''):
    label=o.get('Nickname','')
    if '莱茵' in label or '科室' in label or 'Rhine' in label:
        print('LAB OBJECT',label, o.get('CustomImage'))
        for c in o.get('ContainedObjects',[]):
            print('CHILD',c.get('Nickname'),c.get('CustomImage'),c.get('Description','')[:500])
    for c in o.get('ContainedObjects',[]):walk(c,label)
for o in obj.get('ObjectStates',[]):walk(o)
