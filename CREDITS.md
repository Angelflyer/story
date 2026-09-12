# Credits

Ravenhold is built entirely from free, openly licensed assets. Nothing here is
original artwork by the game's authors — the 3D models, music and sound effects
all come from the packs listed below, processed into runtime formats by
`tools/build_assets.py`.

## 3D models — KayKit by Kay Lousberg (CC0 1.0 Universal)

Source: <https://www.kaylousberg.com> · GitHub mirrors under
<https://github.com/KayKit-Game-Assets>. CC0: free for personal and commercial
use, no attribution required — credited here anyway.

| Pack | Used for |
| --- | --- |
| [KayKit Medieval Hexagon Pack 1.0](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | Every tower tier, the keep, curtain walls and gatehouse, the bridge, the ruined Blackgate, trees, rocks, mountains, reeds, banners, tents, crates, and the catapult projectile |
| [KayKit Character Pack: Skeletons 1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0) | Skeleton, Bone Sentinel and The Bonelord; also the arrow and crossbow-bolt props |
| [KayKit Character Pack: Adventurers 1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | Goblin Runner, Goblin Scout, Orc Warrior, Cave Troll, Orc Warlord, Black Rider and Dark Warlock |

Enemy variants are the same meshes at different scales with a material colour
multiply; all of them share one skeleton rig and one animation set, so the
`walk`, `run`, `hit`, `die`, `attack` and `idle` clips are identical across
species.

Processing applied by the pipeline: the ~55 hexagon-pack props are merged into a
single `kit.glb` sharing one material and the pack's 1024px palette atlas, and
each character is stripped from 94 source animation clips down to the six the
game plays (about 4.8 MB → 0.55 MB per character).

## Music — The Battle for Wesnoth (GNU GPL v2 or later)

Source: <https://github.com/wesnoth/wesnoth> (`data/core/music`). Converted from
Ogg Vorbis to MP3 for iOS playback; otherwise unmodified.

| File | Title | Composer |
| --- | --- | --- |
| audio/music/title.mp3 | Legends of the North | Mattias Westlund |
| audio/music/battle1.mp3 | The City Falls | Doug Kaufman |
| audio/music/battle2.mp3 | Siege of Laurelmor | Doug Kaufman |
| audio/music/battle3.mp3 | Frantic | Stephen Rozanc |
| audio/music/victory.mp3 | Victory | Ryan Reilly |
| audio/music/defeat.mp3 | Defeat | Ryan Reilly |

## Sound effects

- Combat, creature, horn and ambient sounds: The Battle for Wesnoth project
  (`data/core/sounds`), GNU GPL v2+. Authors include Lari Nieminen (zookeeper),
  Richard Kettering (Jetrel), Scott Klempner, J.W. Bjerk (Eleazar) and chessmaty.
  Trimmed, peak-normalised and converted to MP3.
- Interface clicks (`ui_tap`, `ui_tap2`, `ui_open`, `ui_close`): Kenney UI Audio
  pack, CC0 — <https://kenney.nl> (mirror:
  <https://github.com/Calinou/kenney-ui-audio>).

A per-file mapping to the original source paths is in `audio/credits.json`;
the model mapping is in `tools/build_assets.py` and `assets/models/manifest.json`.

## Rendering

three.js (MIT) — <https://github.com/mrdoob/three.js>, vendored under
`js/vendor/` with its licence.

## Fonts

Cinzel and Crimson Pro (SIL Open Font License) via Google Fonts, with system
serif fallbacks.

## Terrain

The ground texture (grass, dirt road, river bed, plot foundations) is generated
procedurally in `js/ground.js`, using colours sampled from the KayKit palette
atlas so it matches the models.

## Licensing summary

| Part | Licence |
| --- | --- |
| Game code (`js/`, `tools/`, `css/`, `index.html`) | MIT, see `LICENSE` |
| `assets/models/` | CC0 1.0 (KayKit) |
| `audio/music/`, most of `audio/sfx/` | GNU GPL v2 or later (Wesnoth) |
| `audio/sfx/ui_*.mp3` | CC0 1.0 (Kenney) |
| `js/vendor/` | MIT (three.js) |

The GPL audio is the most restrictive piece: it is fine for a free game
distributed with source, but would need replacing before shipping anything
closed-source or paid.
