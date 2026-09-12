#!/usr/bin/env python3
"""Ravenhold asset pipeline.

Turns the upstream CC0 source packs (KayKit) into a handful of small, runtime
ready .glb files in assets/models/:

  kit.glb        every static prop/building, merged into ONE file that shares a
                 single material and the single 1024px palette atlas
  <char>.glb     one skinned character per enemy species, with the 90+ source
                 animations trimmed down to the four the game actually plays

Run:  python3 tools/build_assets.py --src <packs-dir> --out assets/models
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gltf  # noqa: E402

# ---------------------------------------------------------------------------
# Which source model becomes which game object.
# ---------------------------------------------------------------------------
HEX = 'kaykit_medieval_hexagon_pack/Assets/gltf'
KIT = [
    # towers: three visual tiers per tower type
    ('tower_archer_1', HEX + '/buildings/blue/building_tower_A_blue.gltf'),
    ('tower_archer_2', HEX + '/buildings/blue/building_tower_B_blue.gltf'),
    ('tower_archer_3', HEX + '/buildings/blue/building_archeryrange_blue.gltf'),
    ('tower_ballista_1', HEX + '/buildings/red/building_tower_A_red.gltf'),
    ('tower_ballista_2', HEX + '/buildings/red/building_tower_B_red.gltf'),
    ('tower_ballista_3', HEX + '/buildings/red/building_barracks_red.gltf'),
    ('tower_mage_1', HEX + '/buildings/yellow/building_tower_A_yellow.gltf'),
    ('tower_mage_2', HEX + '/buildings/yellow/building_tower_B_yellow.gltf'),
    ('tower_mage_3', HEX + '/buildings/yellow/building_church_yellow.gltf'),
    # only one catapult emplacement exists, so its tiers are dressed with props
    ('tower_catapult_1', HEX + '/buildings/green/building_tower_catapult_green.gltf'),
    ('tower_catapult_2', HEX + '/buildings/green/building_tower_catapult_green.gltf'),
    ('tower_catapult_3', HEX + '/buildings/green/building_tower_catapult_green.gltf'),
    # plot, keep, walls, gate
    ('plot', HEX + '/buildings/neutral/building_dirt.gltf'),
    ('keep', HEX + '/buildings/blue/building_castle_blue.gltf'),
    ('wall', HEX + '/buildings/neutral/wall_straight.gltf'),
    ('wall_gate', HEX + '/buildings/neutral/wall_straight_gate.gltf'),
    ('wall_corner', HEX + '/buildings/neutral/wall_corner_A_outside.gltf'),
    ('bridge', HEX + '/buildings/neutral/building_bridge_A.gltf'),
    ('ruin', HEX + '/buildings/neutral/building_destroyed.gltf'),
    ('scaffold', HEX + '/buildings/neutral/building_scaffolding.gltf'),
    # nature
    ('tree_a', HEX + '/decoration/nature/tree_single_A.gltf'),
    ('tree_b', HEX + '/decoration/nature/tree_single_B.gltf'),
    ('trees_a_small', HEX + '/decoration/nature/trees_A_small.gltf'),
    ('trees_a_med', HEX + '/decoration/nature/trees_A_medium.gltf'),
    ('trees_a_large', HEX + '/decoration/nature/trees_A_large.gltf'),
    ('trees_b_small', HEX + '/decoration/nature/trees_B_small.gltf'),
    ('trees_b_med', HEX + '/decoration/nature/trees_B_medium.gltf'),
    ('trees_b_large', HEX + '/decoration/nature/trees_B_large.gltf'),
    ('stump_a', HEX + '/decoration/nature/tree_single_A_cut.gltf'),
    ('rock_a', HEX + '/decoration/nature/rock_single_A.gltf'),
    ('rock_b', HEX + '/decoration/nature/rock_single_B.gltf'),
    ('rock_c', HEX + '/decoration/nature/rock_single_C.gltf'),
    ('rock_d', HEX + '/decoration/nature/rock_single_D.gltf'),
    ('rock_e', HEX + '/decoration/nature/rock_single_E.gltf'),
    ('mountain_a', HEX + '/decoration/nature/mountain_A.gltf'),
    ('mountain_b', HEX + '/decoration/nature/mountain_B.gltf'),
    ('mountain_c', HEX + '/decoration/nature/mountain_C.gltf'),
    ('hill_a', HEX + '/decoration/nature/hill_single_A.gltf'),
    ('hill_b', HEX + '/decoration/nature/hill_single_B.gltf'),
    ('waterplant_a', HEX + '/decoration/nature/waterplant_A.gltf'),
    ('waterlily_a', HEX + '/decoration/nature/waterlily_A.gltf'),
    # props
    ('flag_blue', HEX + '/decoration/props/flag_blue.gltf'),
    ('flag_red', HEX + '/decoration/props/flag_red.gltf'),
    ('tent', HEX + '/decoration/props/tent.gltf'),
    ('barrel', HEX + '/decoration/props/barrel.gltf'),
    ('crate', HEX + '/decoration/props/crate_A_big.gltf'),
    ('weaponrack', HEX + '/decoration/props/weaponrack.gltf'),
    ('target', HEX + '/decoration/props/target.gltf'),
    ('fence', HEX + '/decoration/props/../../buildings/neutral/fence_wood_straight.gltf'),
    ('lumber', HEX + '/decoration/props/resource_lumber.gltf'),
    ('stone_pile', HEX + '/decoration/props/resource_stone.gltf'),
    ('ladder', HEX + '/decoration/props/ladder.gltf'),
    # projectiles
    ('projectile_stone', HEX + '/buildings/neutral/projectile_catapult.gltf'),
    ('arrow', 'kaykit_character_pack_skeletons/Assets/gltf/Skeleton_Arrow.gltf'),
    ('crossbow_bolt', 'kaykit_character_pack_skeletons/Assets/gltf/Skeleton_Arrow_Half.gltf'),
]

# Characters: (output name, source glb, animation map game-name -> source clip)
SKEL = 'kaykit_character_pack_skeletons/Characters/gltf/'
ADV = 'kaykit_character_pack_adventures/Characters/gltf/'
ANIMS = {
    'walk': 'Walking_C',
    'run': 'Running_A',
    'hit': 'Hit_A',
    'die': 'Death_A',
    'attack': '1H_Melee_Attack_Chop',
    'idle': 'Idle',
}
CHARACTERS = [
    ('skeleton', SKEL + 'Skeleton_Warrior.glb', ANIMS),
    ('skeleton_minion', SKEL + 'Skeleton_Minion.glb', ANIMS),
    ('skeleton_mage', SKEL + 'Skeleton_Mage.glb', ANIMS),
    ('goblin', ADV + 'Rogue_Hooded.glb', ANIMS),
    ('orc', ADV + 'Barbarian.glb', ANIMS),
    ('rider', ADV + 'Knight.glb', ANIMS),
    ('mage', ADV + 'Mage.glb', ANIMS),
]


def merge_kit(src_root, entries, out_path):
    """Merge many single-material glTF props into one GLB with named nodes."""
    b = gltf.Builder()
    meshes, nodes, roots, manifest = [], [], [], {}
    png = None

    for name, rel in entries:
        path = os.path.normpath(os.path.join(src_root, rel))
        if not os.path.exists(path):
            print('  MISSING %s (%s)' % (name, rel))
            continue
        j, binary = gltf.load(path)
        if png is None and j.get('images'):
            png = j['images'][0]['_bytes']

        child_ids = []
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for node in j.get('nodes', []):
            if 'mesh' not in node:
                continue
            src_mesh = j['meshes'][node['mesh']]
            prims = []
            for prim in src_mesh['primitives']:
                attrs = {}
                for key in ('POSITION', 'NORMAL', 'TEXCOORD_0'):
                    if key in prim['attributes']:
                        attrs[key] = b.copy_accessor(j, binary, prim['attributes'][key], 34962)
                np_ = {'attributes': attrs, 'material': 0}
                if 'indices' in prim:
                    np_['indices'] = b.copy_accessor(j, binary, prim['indices'], 34963)
                prims.append(np_)
                pos = j['accessors'][prim['attributes']['POSITION']]
                if 'min' in pos:
                    t = node.get('translation', [0, 0, 0])
                    s = node.get('scale', [1, 1, 1])
                    for k in range(3):
                        lo[k] = min(lo[k], pos['min'][k] * s[k] + t[k])
                        hi[k] = max(hi[k], pos['max'][k] * s[k] + t[k])
            meshes.append({'name': node.get('name', name), 'primitives': prims})
            child = {'mesh': len(meshes) - 1, 'name': node.get('name', name)}
            for key in ('translation', 'rotation', 'scale'):
                if key in node:
                    child[key] = node[key]
            nodes.append(child)
            child_ids.append(len(nodes) - 1)

        if not child_ids:
            print('  EMPTY %s' % name)
            continue
        nodes.append({'name': name, 'children': child_ids})
        roots.append(len(nodes) - 1)
        manifest[name] = {'min': [round(v, 4) for v in lo], 'max': [round(v, 4) for v in hi]}

    img_view = b.add_view(png)
    doc = {
        'asset': {'version': '2.0', 'generator': 'ravenhold-build_assets'},
        'scene': 0,
        'scenes': [{'nodes': roots}],
        'nodes': nodes,
        'meshes': meshes,
        'materials': [{'name': 'kit', 'pbrMetallicRoughness': {
            'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.75}}],
        'textures': [{'sampler': 0, 'source': 0}],
        'images': [{'mimeType': 'image/png', 'bufferView': img_view, 'name': 'atlas'}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'accessors': b.accessors,
        'bufferViews': b.bufferViews,
    }
    size = gltf.write_glb(doc, bytes(b.bin), out_path)
    print('kit.glb  %d models, %d meshes, %.1f KB' % (len(roots), len(meshes), size / 1024))
    return manifest


def trim_character(src_root, rel, out_path, anim_map):
    """Keep only the animations the game plays, then garbage-collect the rest."""
    j, binary = gltf.load(os.path.join(src_root, rel))
    by_name = {a.get('name'): a for a in j.get('animations', [])}
    kept = []
    for game_name, clip in anim_map.items():
        anim = by_name.get(clip)
        if anim is None:
            print('  no clip %s' % clip)
            continue
        anim = dict(anim)
        anim['name'] = game_name
        kept.append(anim)
    j['animations'] = kept
    j, binary = gltf.gc(j, binary)
    # single-channel palette textures: keep as-is, they are already tiny
    size = gltf.write_glb(j, binary, out_path)
    names = ','.join(a['name'] for a in kept)
    print('%-22s %6.1f KB  [%s]' % (os.path.basename(out_path), size / 1024, names))
    return size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='directory holding the extracted KayKit packs')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    manifest = {'kit': merge_kit(args.src, KIT, os.path.join(args.out, 'kit.glb')), 'characters': {}}
    for name, rel, anims in CHARACTERS:
        path = os.path.join(args.src, rel)
        if not os.path.exists(path):
            print('  MISSING character %s' % rel)
            continue
        trim_character(args.src, rel, os.path.join(args.out, name + '.glb'), anims)
        manifest['characters'][name] = sorted(anims)
    with open(os.path.join(args.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    total = sum(os.path.getsize(os.path.join(args.out, f)) for f in os.listdir(args.out))
    print('total %.1f MB' % (total / 1e6))


if __name__ == '__main__':
    main()
