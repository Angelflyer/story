# Grove

A tiny, mobile-friendly meditation toy that does one thing: grows a tree.

Answer four quick questions and a unique, painterly tree grows as you answer: each choice unlocks the next phase, so you watch it form during setup. Afterwards it sways in the wind while leaves fall, petals drift, snow settles or glowing motes wander. Every tree is different.

## The four questions

| Step      | Choices                                         | What it grows                    |
|-----------|-------------------------------------------------|----------------------------------|
| Season    | spring, summer, autumn, winter                  | the world, and the seedling      |
| Character | sapling, grown, ancient                         | the full skeleton at that size   |
| Leaves    | round, oval, maple, needle, heart, willow       | the foliage blooms               |
| Extra     | none, blossom, fruit                            | blossom or fruit pops            |

Each answer collapses into a small pill above the question. Tap a pill to reopen that question; changing the answer replays just that phase on the same tree. **Surprise me** picks everything at random, **Grow another** regrows a new tree with the same choices, and tapping the sky does the same. The download button in the corner saves the current frame as a PNG.

## Running it

It is a single `index.html` with no dependencies and no build step. Open the file in a browser, or serve the folder with any static host (GitHub Pages works as-is).

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How the picture is made

Everything is drawn on one `<canvas>`, lit from the upper left.

- **Skeleton.** A seeded random generator builds the branches breadth-first, with a budget so ancient trees stay smooth on phones. Each branch gets a start time and duration, normalised so the whole tree finishes together. Roots flare out at the base.
- **Foliage.** Leaves are painted as clumps rather than one by one. Each clump is a small pre-painted sprite: a dark mass underneath, then dozens of leaf strokes shaded by their position on an imagined sphere, so tops go yellow-green and undersides go deep teal. Clumps sit at three depths: back ones are darker and cooler, front ones warmer, and each casts a soft shadow on what is behind it. Branches are drawn between the back and front layers.
- **Wood.** Every branch is a tapered, slightly curved polygon with a highlight strip on the lit edge, a shadow strip on the far edge, and bark lines on the trunk.
- **Atmosphere.** The sky, colour washes, sun glow, horizon mist, mossy mound, grass, paper grain and vignette are painted once per tree into an offscreen canvas. Light rays from the sun shimmer slowly in front of it.

Because the tree is rebuilt from the same seed on resize, rotating the phone simply rescales the same tree.
