#!/usr/bin/env python3
"""Local-only adapter: user-selected Yandex Smart Home devices -> native Shortcut config."""
import argparse
import json
import os
import re
from pathlib import Path

SAFE_ID = re.compile(r'[A-Za-z0-9_.:-]{1,200}\Z')
SAFE_ALIAS = re.compile(r'[а-яё0-9 -]{4,50}\Z')
DANGEROUS = re.compile(r'ворот|замок|двер|гараж|котел|обогрев|сирен|газ|кран|шлагбаум|плит|насос', re.I)

def convert(source, ids):
    if not isinstance(source, dict) or source.get('status') not in (None, 'ok'):
        raise ValueError('Invalid inventory')
    if not isinstance(ids, list) or not ids or len(ids) != len(set(ids)) or len(ids)>8:
        raise ValueError('Specify 1..8 unique IDs explicitly')
    rows = []
    for key, kind in (('devices','device'), ('scenarios','scenario')):
        for item in source.get(key, []):
            if isinstance(item,dict): rows.append((kind,item))
    found = {str(x.get('id')):(kind,x) for kind,x in rows}
    result=[]
    for device_id in ids:
        if not SAFE_ID.fullmatch(device_id) or device_id not in found:
            raise ValueError('Unknown or unsafe ID')
        kind, item=found[device_id]
        name=item.get('name','')
        if not isinstance(name,str):
            raise ValueError('Invalid device name')
        alias=name.strip().lower().replace('ё','е')
        if not SAFE_ALIAS.fullmatch(alias):
            raise ValueError('Name requires an unambiguous Russian alias')
        if DANGEROUS.search(name) or DANGEROUS.search(alias):
            raise ValueError('Safety-critical target excluded')
        row={'kind':kind,'id':device_id,'name':name,'alias':alias}
        if kind=='scenario':
            if item.get('is_active') is not True: raise ValueError('Inactive scenario')
        else:
            caps=item.get('capabilities',[])
            if not isinstance(caps,list): raise ValueError('Invalid capabilities')
            row['on_off']=any(c.get('type')=='devices.capabilities.on_off' for c in caps if isinstance(c,dict))
            for c in caps:
                if not isinstance(c,dict) or c.get('type')!='devices.capabilities.range':continue
                p=c.get('parameters') or {}
                bounds=p.get('range') or {}
                if p.get('instance')=='brightness' and p.get('random_access',False) and all(type(bounds.get(k))==int for k in ('min','max')):
                    row['brightness']={'min':bounds['min'],'max':bounds['max']}
            row['status']=True
        result.append(row)
    aliases=[x['alias'] for x in result]
    if len(set(aliases))!=len(aliases) or any(a in b for a in aliases for b in aliases if a!=b):
        raise ValueError('Ambiguous device names; use distinct aliases')
    return result

if __name__ == '__main__':
    cli=argparse.ArgumentParser()
    cli.add_argument('--input', required=True)
    cli.add_argument('--id', dest='ids', required=True, action='append')
    cli.add_argument('--output',required=True)
    opts=cli.parse_args()
    source=json.loads(Path(opts.input).read_text(encoding='utf8'))
    result=convert(source, opts.ids)
    output=Path(opts.output)
    if output.exists():raise SystemExit('Output already exists; refusing to overwrite')
    fd=os.open(output,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w',encoding='utf8') as f: json.dump(result,f,ensure_ascii=False,indent=2)
    print('PASS: local config generated; contains names/IDs, never publish:',output)
