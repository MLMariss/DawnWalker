#!/usr/bin/env python3
"""Generate docs/gemini-icon-prompts.md — the prompt pack for redrawing every
node icon with Gemini's image model from screenshots of the in-game skill trees.

The pack is generated rather than written by hand so the 90 node names, grid
positions and effect lines cannot drift from the registries:

    python3 tools/build_icon_prompts.py          # writes docs/gemini-icon-prompts.md
    python3 tools/build_icon_prompts.py --check   # fails if the file is stale

Ninety icons do not survive one generation call, so the pack splits them into
ten sheets of nine in a fixed 3x3 reading order. That split is what
tools/slice_icon_sheet.py expects, so change it in one place only.
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'gemini-icon-prompts.md'
PER_SHEET = 9
COLS = 3

TREE_KEY = {'Witchcraft': 'wc', 'Swordmastery': 'sm', 'Vampirism': 'vp'}


def load_nodes():
    """Every perk, ability and ultimate in the order the sheets are cut from."""
    perks = json.loads((ROOT / 'data' / 'perks.json').read_text())
    abil = json.loads((ROOT / 'data' / 'abilities.json').read_text())
    nodes = []

    for tree, t in perks['trees'].items():
        rows = {}
        for p in t['perks']:
            rows.setdefault(p['row'], []).append(p)
        for r in sorted(rows):
            ordered = sorted(rows[r], key=lambda p: p['x'])
            for i, p in enumerate(ordered, 1):
                nodes.append({
                    'id': p['node_id'],
                    'name': p['name'],
                    'tree': tree,
                    'kind': 'perk',
                    'where': 'perk tree screenshot, row %d, %d%s of %d from the left'
                             % (r, i, ordinal(i), len(ordered)),
                    'effect': oneline(p.get('effect', '')),
                })

    for tree, t in abil['trees'].items():
        for i, a in enumerate(t['abilities'], 1):
            nodes.append({
                'id': a['node_id'],
                'name': a['name'],
                'tree': tree,
                'kind': 'ability',
                'where': '%s ability screen, the card named "%s"' % (tree, a['name']),
                'effect': oneline(a.get('effect', '')),
            })

    for tree, t in perks['trees'].items():
        for i, u in enumerate(t['ultimates'], 1):
            nodes.append({
                'id': 'U%s%d' % (TREE_KEY[tree], i),
                'name': u['name'],
                'tree': tree,
                'kind': 'ultimate',
                'where': '%s ultimate row, the card named "%s"' % (tree, u['name']),
                'effect': oneline(u.get('effect', '')),
            })
    return nodes


def ordinal(i):
    return {1: 'st', 2: 'nd', 3: 'rd'}.get(i if i < 20 else i % 10, 'th')


def oneline(s):
    return ' '.join(s.split())


def sheets(nodes):
    out = []
    for n in range(0, len(nodes), PER_SHEET):
        chunk = nodes[n:n + PER_SHEET]
        out.append({
            'id': 'sheet-%02d' % (n // PER_SHEET + 1),
            'nodes': chunk,
            'span': '%s–%s' % (chunk[0]['id'], chunk[-1]['id']),
        })
    return out


STYLE = """\
You are drawing icons for a fan-made web planner for the game *The Blood of
Dawnwalker*. I am attaching screenshots of the game's skill screens.

USE OF THE SCREENSHOTS — read this first. The screenshots are there so you can
see WHAT each icon depicts: its subject and its composition. They are not a
style reference. Do not reproduce the game's artwork, its colours, its gold or
metal rendering, its embossing, its frames, or its background texture. For each
node, work out the subject from the screenshot, then draw that subject again
from scratch in the style below. The result must be original line art that
suggests the perk, not a copy of the game's asset.

If you cannot make out a node's icon in the screenshot, ignore the screenshot
for that one and invent a mark from the perk's name and effect, which I give you
below.

OUTPUT
- One single square image per request. Largest resolution you can produce
  (2048x2048 or better; 1024x1024 is the floor).
- Nine icons in a 3x3 grid, filled left to right, top to bottom. Cell 1 is top
  left, cell 3 is top right, cell 9 is bottom right.
- Equal cells, even spacing, art centred in its cell with roughly 12% clear
  margin inside the cell. Nothing crosses a cell boundary.
- No grid lines, no cell numbers, no captions, no labels, no signature, no
  watermark. There must be no text anywhere in the image.

RENDERING — this part is not negotiable, the planner tints these at runtime
- Pure white (#FFFFFF) line art on a pure black (#000000) flat background.
  Exactly two tones. No grey, no anti-aliased mid-tones beyond what a clean
  stroke needs.
- Stroke only. No fills, no solid masses, no gradients, no glow, no bloom, no
  drop shadow, no shading, no hatching, no texture, no perspective, no colour.
- One uniform stroke weight across the whole sheet, about 3% of a cell's width,
  with round caps and round joins.
- Flat, front-on, symmetrical where the subject is symmetrical.

LEGIBILITY — each icon is displayed at 46 pixels and sometimes 30
- At most four major shape elements per icon. Fewer is better.
- No detail smaller than 2% of the cell. If a feature would vanish at 30px,
  leave it out.
- Silhouette carries the meaning. Two icons on the same sheet must not share a
  silhouette.

DO NOT DRAW
- Frames, borders, plaques, circles or shields *around* the icon, banners,
  ribbons, scrolls, badges, corner ornaments, sparkles, or a base/ground line.
  The planner draws its own diamond frame and level pips around every icon;
  anything you add there collides with it.

IDIOM
Dark-fantasy woodcut: medieval Central European, occult, hand-cut rather than
geometrically perfect, the look of an etched grimoire plate reduced to its
outline. The nine icons must look drawn by one hand in one sitting.
"""

INTRO = """\
# Redrawing the node icons with Gemini

`assets/icons.js` currently holds a vocabulary of 40 hand-written SVG glyphs
that are *reused* across nodes — one `heart` path serves Font of Life, Vigour
and Closing Wounds alike. This pack replaces that with **one mark per node**:
90 icons, redrawn from screenshots of the in-game skill screens, keyed by node
id.

Generated by `tools/build_icon_prompts.py` from `data/perks.json` and
`data/abilities.json` — edit the script, not this file.

## What you need

- Screenshots of all three perk trees, all three ability screens and the
  ultimate cards. The same sweep recorded in VERIFICATION.md.
- Gemini's image model (Nano Banana / Nano Banana Pro — in AI Studio pick the
  image-capable Gemini and ask for the largest output it offers). The Gemini app
  works too; AI Studio gives you the resolution control.

## How to run it

Ten sheets, nine icons each, `3x3` reading order. Do them in this order:

1. **Pass 1 — audit, no image.** Paste §Pass 1 with the screenshots attached.
   You get back a text list of what Gemini thinks each node's icon depicts.
   Read it. Fixing a misread here costs one message; fixing it after generation
   costs a sheet. Correct anything wrong in your reply, then move on.
2. **Pass 2 — generate.** For each sheet, paste the §Style block followed by
   that sheet's cell list. Save the result as `sheets/<sheet-id>.png`.
3. **Anchor the style.** Once sheet 1 looks right, attach it to every later
   request and add: *"Match the stroke weight, density and drawing hand of the
   attached sheet exactly."* This is what keeps 90 icons looking like one set.
4. **Repair single cells** with §Repair rather than regenerating a whole sheet.
5. **Slice** each sheet into per-node files:
   `python3 tools/slice_icon_sheet.py sheets/sheet-01.png`

## Pass 1 — audit the screenshots before generating anything

> Attached are screenshots of the skill screens from *The Blood of Dawnwalker*.
> Do not generate any image yet. For each node id below, find its icon in the
> screenshot at the position I give, and reply with one line:
>
> `<id> | <what the icon depicts, in at most 8 words> | <confident|unsure|cannot see it>`
>
> Do not describe colour, framing or material — only the subject. Mark `unsure`
> freely; I would rather correct you now than after you have drawn it.
>
> [then paste the id / name / where / effect lines for as many sheets as you
> want to audit at once — they are listed per sheet below]

## Pass 2 — §Style block

Paste this verbatim at the top of **every** generation request, then the sheet's
cell list.

```text
%s```
""" % STYLE

OUTRO = """\
## Repair one cell

> Using the same style rules as before, draw **one** icon as a single square
> image: white line art on pure black, stroke only, no frame, no text, readable
> at 30 pixels, matching the stroke weight of the attached sheet.
>
> `<id> <name>` — it should depict: `<your correction>`.
>
> Nothing else in the image.

Save it as `sheets/<id>.png` and slice it on its own:

```sh
python3 tools/slice_icon_sheet.py sheets/W7.png --grid 1x1 --ids W7
```

It overwrites just that one mark and leaves the rest of the sheet's output alone.

## After slicing: wiring raster icons into the planner

The current glyphs are SVG *strokes*, and the board tints them seven different
ways — `.node.avail`, `.taken`, `.maxed`, `.gated`, `.locked`, `:hover`,
`.selected` each set a different `stroke`. A `<img>` tag cannot follow that. Use
the trick already in `assets/styles.css` for the meter icons (`--m-sp`, `--m-ts`
and friends): an alpha mask over `background:currentColor`.

`tools/slice_icon_sheet.py` writes exactly that — white-on-black art becomes
transparent-on-opaque alpha, so the PNG is a mask, not a picture:

```css
.node .mark{
  width:var(--icon); height:var(--icon);
  background:currentColor;
  -webkit-mask:var(--mark) center/contain no-repeat;
          mask:var(--mark) center/contain no-repeat;
}
```

with `color` set by the state rules that today set `stroke`, and `--mark` set
per node to `url("../assets/marks/W1.png")`. Keep `Icons.svg()` as the fallback
for any node whose mark has not been drawn yet, so a half-finished sweep still
renders a board.

Two notes worth keeping in mind:

- Ship the masks at 2x the largest display size. `--icon` is 46px and the side
  panel hero is 52px, so 128px squares are enough and stay small.
- A mask is monochrome by definition, which is why the sheets must be two-tone.
  Any grey Gemini leaves in the art becomes a half-transparent smudge.

## Licensing note

The game's icons are Rebel Wolves' artwork. This pack deliberately asks for the
*subject* of each icon redrawn in an unrelated line style, which is what lets
README keep saying the icons here are original line art rather than ripped
assets. If a returned mark looks like a trace of the game's asset rather than a
fresh drawing of the same thing, throw it out and use §Repair with your own
description of the subject.
"""


def render(nodes):
    parts = [INTRO]
    for sh in sheets(nodes):
        parts.append('## %s — %s\n' % (sh['id'], sh['span']))
        trees = []
        for n in sh['nodes']:
            if n['tree'] not in trees:
                trees.append(n['tree'])
        parts.append('Attach: %s. Save as `sheets/%s.png`.\n'
                     % (', '.join(trees), sh['id']))
        parts.append('```text')
        parts.append('Draw these nine, in this order:\n')
        for i, n in enumerate(sh['nodes'], 1):
            parts.append('CELL %d — %s — %s (%s, %s)' % (i, n['id'], n['name'],
                                                         n['tree'], n['kind']))
            parts.append('  find it: %s' % n['where'])
            parts.append('  it does: %s' % (n['effect'] or '—'))
            parts.append('')
        parts.append('```\n')
    parts.append(OUTRO)
    return '\n'.join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='exit non-zero if the committed file is stale')
    args = ap.parse_args()

    nodes = load_nodes()
    if len(nodes) % PER_SHEET:
        sys.exit('%d nodes do not divide into sheets of %d — adjust PER_SHEET '
                 'and tools/slice_icon_sheet.py together' % (len(nodes), PER_SHEET))
    text = render(nodes)

    if args.check:
        if not OUT.exists() or OUT.read_text() != text:
            sys.exit('%s is stale — run tools/build_icon_prompts.py' % OUT)
        print('%s is up to date (%d nodes, %d sheets)'
              % (OUT, len(nodes), len(nodes) // PER_SHEET))
        return
    OUT.write_text(text)
    print('wrote %s — %d nodes, %d sheets of %d'
          % (OUT, len(nodes), len(nodes) // PER_SHEET, PER_SHEET))


if __name__ == '__main__':
    main()
