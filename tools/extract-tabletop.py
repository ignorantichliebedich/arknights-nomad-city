"""Decode the public Tabletop Simulator BSON save into inspectable JSON."""
import json, struct
from pathlib import Path

def document(raw, start=0):
    end = start + struct.unpack_from('<i', raw, start)[0]
    index = start + 4
    result = {}
    while index < end - 1:
        kind = raw[index]; index += 1
        stop = raw.index(0, index)
        name = raw[index:stop].decode('utf-8'); index = stop + 1
        if kind == 1:
            value = struct.unpack_from('<d', raw, index)[0]; index += 8
        elif kind == 2:
            length = struct.unpack_from('<i', raw, index)[0]; index += 4
            value = raw[index:index+length-1].decode('utf-8'); index += length
        elif kind in (3, 4):
            value, index = document(raw, index)
            if kind == 4: value = list(value.values())
        elif kind == 5:
            length = struct.unpack_from('<i', raw, index)[0]; index += 5
            value = {'binary_bytes': length}; index += length
        elif kind == 8:
            value = bool(raw[index]); index += 1
        elif kind == 10: value = None
        elif kind == 16:
            value = struct.unpack_from('<i', raw, index)[0]; index += 4
        elif kind in (9, 18):
            value = struct.unpack_from('<q', raw, index)[0]; index += 8
        else: raise ValueError(f'Unsupported BSON field {kind}: {name}')
        result[name] = value
    return result, end

if __name__ == '__main__':
    source = Path('.data/sources/tabletop.json')
    obj, end = document(source.read_bytes())
    Path('.data/sources/tabletop-decoded.json').write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
    atlases = {}
    required = {'154','156','165','167','166','625','640'}
    def visit(o, level=0):
        for key, value in o.get('CustomDeck',{}).items():
            if key in required and key in atlases and atlases[key]['FaceURL'] != value['FaceURL']:
                raise ValueError(f'Conflicting atlas id {key}; inspect source before import')
            atlases.setdefault(key, value)
        for c in o.get('ContainedObjects',[]): visit(c,level+1)
    for o in obj.get('ObjectStates',[]): visit(o)
    Path('.data/sources/atlases.json').write_text(json.dumps(atlases,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Decoded {len(obj.get("ObjectStates",[]))} root objects and {len(atlases)} card atlases; no scripts executed.')
