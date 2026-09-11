# Ravenhold — a classic tower defense for the phone

A single-level, no-nonsense tower defense in the spirit of the original Flash-era games,
with a medieval / dark-fantasy look. Built as a plain web app (HTML, CSS, vanilla JS,
Canvas 2D) that runs well on iPhone Safari and as a home-screen web app.

**No timers, no build queues, no daily rewards, no currency tricks.** You get gold for
kills, you raise towers on fixed plots, you upgrade them twice, you have two spells.
That's the whole game.

## Play

Open `index.html` from any static web server (audio needs `http(s)://`, not `file://`),
or host the repository with GitHub Pages. On iPhone, use *Share → Add to Home Screen*
for a fullscreen experience.

Controls:

- **Drag** to pan, **pinch** to zoom (mouse wheel on desktop). *Menu → Show whole map* fits the level on screen.
- **Tap a stone plot** to raise a tower. **Tap a tower** to upgrade or sell it.
- **Sound the horn** to start the next wave. You may call the next wave early while one is still on the road.
- **Dragon's Breath**: tap the spell, then tap the road to burn a spot.
- **Winter's Grasp**: freezes every enemy for a few seconds.

## Level 1 — The Old Road

- 15 waves, 20 lives. Goblins, wargs, orcs, bone sentinels, black riders, cave trolls, a troll chieftain (wave 10) and the Ogre Warlord (wave 15).
- 13 build plots, one river crossing, the Blackgate in the north and Ravenhold keep in the south.

Towers:

| Tower | Cost | Role |
| --- | --- | --- |
| Archer Tower | 70 | Fast, cheap, physical damage |
| Ballista | 120 | Slow heavy bolts that pierce several enemies |
| Mage Tower | 125 | Magic damage that ignores armor; the undead are weak to it; level 3 chills targets |
| Catapult | 150 | Splash damage, cannot hit enemies that are too close |

Each tower has two upgrades. Selling refunds 70% of what was invested.

## Project layout

```
index.html          markup + HUD
css/style.css       UI styles (safe-area aware, touch-sized)
js/data.js          level geometry, towers, enemies, waves, spells
js/render.js        procedural map pre-render and all in-game drawing
js/game.js          simulation, camera, input, frame rendering
js/audio.js         Web Audio SFX + music routed through Web Audio (works on iOS)
js/ui.js            HUD, build/upgrade sheets, menus
audio/              music and SFX (see CREDITS.md and audio/credits.json)
icons/              app icons
```

No build step and no dependencies. All artwork is drawn procedurally at runtime.

## Credits and licenses

Code is MIT licensed (see `LICENSE`). Music and sound effects come from
The Battle for Wesnoth (GNU GPL v2+) and Kenney (CC0); see `CREDITS.md`.
