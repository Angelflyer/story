# Grove

A tiny, mobile-friendly meditation toy that does one thing: grows a tree.

Pick a few options, and a unique tree sprouts and grows over about four seconds, then sways in the wind while leaves fall, snow drifts, petals drop or fireflies wander, depending on what you chose. Every tree is different.

## Options

| Option   | Choices                                      |
|----------|----------------------------------------------|
| Leaves   | round, oval, maple, needle, heart, willow    |
| Season   | spring, summer, autumn, winter               |
| Density  | sparse, medium, lush                         |
| Branches | thin, medium, thick                          |
| Size     | small, medium, tall                          |
| Flowers  | none, pink, white, purple, yellow            |
| Fruit    | none, apple, orange, lemon, plum             |
| Wind     | calm, breeze, gusty                          |

Tapping any option grows a new tree right away. **Grow another** regrows with the same settings, **Surprise** randomises everything, and tapping the sky grows a fresh tree too. The download button in the corner saves the current frame as a PNG.

## Running it

It is a single `index.html` with no dependencies and no build step. Open the file in a browser, or serve the folder with any static host (GitHub Pages works as-is).

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How it works

Everything is drawn on one `<canvas>`. A seeded random generator builds a branching skeleton (breadth-first, with a branch budget so lush trees stay smooth on phones). Each branch gets a start time and duration, normalised so the whole tree finishes at the same moment. Leaves, flowers and fruit attach to outer branches and pop in with a small overshoot once their branch has grown past them. After growth, branches sway with a shared gust curve plus a per-branch flutter, scaled by depth so tips move more than the trunk.

Because the tree is rebuilt from the same seed on resize, rotating the phone or collapsing the options panel simply rescales the same tree.
