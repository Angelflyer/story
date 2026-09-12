"""Minimal glTF 2.0 read/merge/prune/write helpers used by the Ravenhold asset pipeline.

Only supports the subset of glTF the source packs actually use (single buffer,
non-sparse accessors, PNG textures), which keeps this readable and dependency free.
"""
import base64
import json
import os
import struct

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

COMPONENT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COUNT = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def load(path):
    """Load a .glb or .gltf (with external .bin/.png) into (json_dict, bin_bytes)."""
    if path.lower().endswith('.glb'):
        return _load_glb(path)
    return _load_gltf(path)


def _load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, _version, length = struct.unpack('<III', data[:12])
    if magic != GLB_MAGIC:
        raise ValueError('not a glb: %s' % path)
    off, js, binary = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == CHUNK_JSON:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == CHUNK_BIN:
            binary = chunk
    return js, binary


def _load_gltf(path):
    with open(path) as f:
        j = json.load(f)
    base = os.path.dirname(path)
    binary = b''
    for buf in j.get('buffers', []):
        uri = buf.get('uri', '')
        if uri.startswith('data:'):
            binary += base64.b64decode(uri.split(',', 1)[1])
        elif uri:
            with open(os.path.join(base, uri), 'rb') as f:
                binary += f.read()
    # inline external images so callers always get self-contained data
    for img in j.get('images', []):
        uri = img.get('uri')
        if uri and not uri.startswith('data:'):
            with open(os.path.join(base, uri), 'rb') as f:
                img['_bytes'] = f.read()
            img['mimeType'] = 'image/png' if uri.lower().endswith('.png') else img.get('mimeType', 'image/jpeg')
            del img['uri']
        elif uri:
            img['_bytes'] = base64.b64decode(uri.split(',', 1)[1])
            del img['uri']
    return j, binary


def accessor_bytes(j, binary, index):
    """Return the raw bytes for one accessor, de-interleaved if needed."""
    acc = j['accessors'][index]
    n = acc['count']
    elem = COMPONENT_SIZE[acc['componentType']] * TYPE_COUNT[acc['type']]
    if 'bufferView' not in acc:
        return b'\x00' * (elem * n)
    bv = j['bufferViews'][acc['bufferView']]
    start = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride')
    if not stride or stride == elem:
        return binary[start:start + elem * n]
    out = bytearray()
    for i in range(n):
        o = start + i * stride
        out += binary[o:o + elem]
    return bytes(out)


def pad4(b, fill=b'\x00'):
    return b + fill * ((4 - len(b) % 4) % 4)


def write_glb(j, binary, path):
    j = dict(j)
    j['buffers'] = [{'byteLength': len(binary)}] if binary else []
    for img in j.get('images', []):
        img.pop('_bytes', None)
    # per spec the JSON chunk is padded with spaces, the BIN chunk with zeroes
    js = pad4(json.dumps(j, separators=(',', ':')).encode('utf-8'), b'\x20')
    bn = pad4(binary)
    total = 12 + 8 + len(js) + (8 + len(bn) if bn else 0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', GLB_MAGIC, 2, total))
        f.write(struct.pack('<II', len(js), CHUNK_JSON))
        f.write(js)
        if bn:
            f.write(struct.pack('<II', len(bn), CHUNK_BIN))
            f.write(bn)
    return total


class Builder:
    """Accumulates bufferViews/accessors into a fresh glTF document."""

    def __init__(self):
        self.bin = bytearray()
        self.bufferViews = []
        self.accessors = []

    def add_view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            bv['target'] = target
        self.bufferViews.append(bv)
        return len(self.bufferViews) - 1

    def add_accessor(self, data, component_type, type_, count, target=None, minmax=None, normalized=False):
        bv = self.add_view(data, target)
        acc = {'bufferView': bv, 'componentType': component_type, 'count': count, 'type': type_}
        if normalized:
            acc['normalized'] = True
        if minmax:
            acc['min'], acc['max'] = minmax
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def copy_accessor(self, j, binary, index, target=None):
        """Copy an accessor (and its data) from another document."""
        src = j['accessors'][index]
        data = accessor_bytes(j, binary, index)
        mm = (src['min'], src['max']) if 'min' in src else None
        return self.add_accessor(data, src['componentType'], src['type'], src['count'], target,
                                 mm, src.get('normalized', False))


def gc(j, binary):
    """Drop unreferenced accessors/bufferViews and repack the binary chunk."""
    used_acc = set()

    def use(i):
        if i is not None:
            used_acc.add(i)

    for mesh in j.get('meshes', []):
        for prim in mesh['primitives']:
            for a in prim['attributes'].values():
                use(a)
            use(prim.get('indices'))
            for tgt in prim.get('targets', []):
                for a in tgt.values():
                    use(a)
    for skin in j.get('skins', []):
        use(skin.get('inverseBindMatrices'))
    for anim in j.get('animations', []):
        for s in anim['samplers']:
            use(s['input'])
            use(s['output'])

    acc_map, new_acc = {}, []
    for i, acc in enumerate(j.get('accessors', [])):
        if i in used_acc:
            acc_map[i] = len(new_acc)
            new_acc.append(dict(acc))

    used_bv = {a['bufferView'] for a in new_acc if 'bufferView' in a}
    for img in j.get('images', []):
        if 'bufferView' in img:
            used_bv.add(img['bufferView'])

    out = bytearray()
    bv_map, new_bv = {}, []
    for i, bv in enumerate(j.get('bufferViews', [])):
        if i not in used_bv:
            continue
        while len(out) % 4:
            out.append(0)
        off = len(out)
        start = bv.get('byteOffset', 0)
        out += binary[start:start + bv['byteLength']]
        nb = dict(bv)
        nb['byteOffset'] = off
        bv_map[i] = len(new_bv)
        new_bv.append(nb)

    for a in new_acc:
        if 'bufferView' in a:
            a['bufferView'] = bv_map[a['bufferView']]
    for img in j.get('images', []):
        if 'bufferView' in img:
            img['bufferView'] = bv_map[img['bufferView']]

    for mesh in j.get('meshes', []):
        for prim in mesh['primitives']:
            prim['attributes'] = {k: acc_map[v] for k, v in prim['attributes'].items()}
            if 'indices' in prim:
                prim['indices'] = acc_map[prim['indices']]
            if 'targets' in prim:
                prim['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in prim['targets']]
    for skin in j.get('skins', []):
        if 'inverseBindMatrices' in skin:
            skin['inverseBindMatrices'] = acc_map[skin['inverseBindMatrices']]
    for anim in j.get('animations', []):
        for s in anim['samplers']:
            s['input'] = acc_map[s['input']]
            s['output'] = acc_map[s['output']]

    j['accessors'] = new_acc
    j['bufferViews'] = new_bv
    return j, bytes(out)
