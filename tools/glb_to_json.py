#!/usr/bin/env python3
"""Wrap .glb files in a JSON envelope for hosts that refuse model/gltf-binary.

Writes <name>.glb.json next to each input: {"b64": "<base64 of the glb>"}.
The runtime loader falls back to these automatically.
"""
import base64
import glob
import os
import sys

for path in sorted(glob.glob(os.path.join(sys.argv[1], '*.glb'))):
    with open(path, 'rb') as f:
        data = f.read()
    out = path + '.json'
    with open(out, 'w') as f:
        f.write('{"b64":"%s"}' % base64.b64encode(data).decode('ascii'))
    print('%-34s %7.1f KB -> %7.1f KB' % (os.path.basename(out), len(data) / 1024, os.path.getsize(out) / 1024))
