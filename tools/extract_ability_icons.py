#!/usr/bin/env python3
"""Cut the 27 ability marks out of screenshots of the in-game ability panels.

    python3 tools/extract_ability_icons.py <dir of 3 screenshots>

Writes icons-src/T_Icon_Ability_<name>.png, which tools/build_marks.py then
turns into board masks. Unlike the perks, the abilities were never available as
texture files, so they are read off the skill screen instead: one screenshot per
tree, each a 2-column grid of ability frames in the order listed below.

The reading order is hard-coded because the screenshots carry no machine-readable
names. It is checked against data/abilities.json, so a wrong order or a renamed
ability fails here rather than silently mislabelling an icon.

Requires Pillow and numpy. Nothing the site serves needs either.
"""
import json
import pathlib
import re
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons-src'

# Reading order within each screenshot: left to right, top to bottom.
SHEETS = [
    ['Voracious Bite', 'Shadowstorm', 'Piercing Shriek', 'Blood Surge', 'Mesmerise',
     'Death From Above', 'Scarlet Shield', 'Crimson Rush', 'Shred', 'Shapeshift'],
    ['Dirty Trick', 'Broad Swing', 'Charge', 'Artery Strike', 'Adrenaline Rush',
     'Swiftness', 'Walking Fortress'],
    ['Compel Soul', 'Astral Communion', 'Burning Blood', 'Life Lock', 'Soul Reaping',
     'Ravenous Flock', 'Soul Stigma', 'Unholy Vitality', 'Cycle of Ruin',
     'Mercurial Fervour'],
]


def runs(vals, floor, minlen):
    out, on = [], False
    for i, v in enumerate(vals > floor):
        if v and not on: s, on = i, True
        elif not v and on:
            if i - s >= minlen: out.append((s, i))
            on = False
    if on and len(vals) - s >= minlen: out.append((s, len(vals)))
    return out


def cells(path):
    """Bounding box per ability frame, in reading order.

    The frames come in two states — a dim purple one and a gold-lit one for an
    ability you have levels in — so they are found as "not the green page
    ground" rather than by colour. Two frames whose glow bridges them come back
    as one tall run, which is split on the median frame height rather than
    tuning the threshold until they happen to separate.
    """
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    mx = a.max(2)
    notbg = ~((a[:, :, 1] >= mx - 2) & (mx < 70))

    boxes = []
    for x0, x1 in runs(notbg.sum(0), 200, 100):
        boxes.append([(x0, y0, x1, y1)
                      for y0, y1 in runs(notbg[:, x0:x1].sum(1), (x1 - x0) * 0.4, 90)])

    flat = [b for col in boxes for b in col]
    if not flat: return a, []
    med = sorted(b[3] - b[1] for b in flat)[len(flat) // 2]

    split = []
    for x0, y0, x1, y1 in flat:
        n = max(1, round((y1 - y0) / med))
        step = (y1 - y0) / n
        for k in range(n):
            split.append((x0, int(y0 + k * step), x1, int(y0 + (k + 1) * step)))

    split.sort(key=lambda b: (round((b[1] + b[3]) / 2 / (med * 0.8)), b[0]))
    return a, split


def glyph(a, box):
    """The mark alone, lifted out of one ability frame.

    Two things make this harder than the perk textures were. The heptagon
    outline is bright, so it cannot be excluded by brightness — it is cut
    geometrically instead, by keeping only a disc well inside the frame, which
    also drops the level badge across the bottom. And a frame comes either dim
    purple or gold-lit depending on whether you have levels in the ability, so
    the threshold is taken from each cell's own histogram rather than fixed:
    the mark is the neutral, bright content relative to whatever that cell's
    own ground happens to be.
    """
    x0, y0, x1, y1 = box
    cell = a[y0:y1, x0:x1]
    h, w = cell.shape[:2]

    yy, xx = np.mgrid[0:h, 0:w]
    cy, cx = h * 0.44, w * 0.5           # the mark sits above the badge
    inside = ((yy - cy) / (h * 0.34)) ** 2 + ((xx - cx) / (w * 0.36)) ** 2 <= 1.0

    mx, mn = cell.max(2).astype(float), cell.min(2).astype(float)
    neutral = mx - mn < 55               # the frame and its glow are saturated
    lum = cell.mean(2)

    sel = inside & neutral
    if sel.sum() < 50:
        return np.zeros((h, w), np.uint8)

    vals = lum[sel]
    ground = np.percentile(vals, 55)      # most of the disc is background
    peak = np.percentile(vals, 99.5)
    if peak - ground < 12:
        return np.zeros((h, w), np.uint8)

    ink = np.clip((lum - ground) / (peak - ground), 0, 1) * sel
    # A gold-lit frame leaves its ground faintly above the threshold, which
    # shows up as a halo along the mask edge. Anything this faint is not mark.
    ink[ink < 0.22] = 0
    ink = np.clip((ink - 0.22) / 0.78, 0, 1)
    return (ink ** 0.85 * 255).astype(np.uint8)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    shots = sorted(p for p in pathlib.Path(sys.argv[1]).rglob('*.png'))
    if len(shots) != len(SHEETS):
        sys.exit('expected %d screenshots, found %d' % (len(SHEETS), len(shots)))

    known = {a['name'] for t in json.loads((ROOT / 'data' / 'abilities.json').read_text())
             ['trees'].values() for a in t['abilities']}
    listed = [n for sheet in SHEETS for n in sheet]
    unknown = [n for n in listed if n not in known]
    if unknown:
        sys.exit('not in data/abilities.json: %s' % ', '.join(unknown))
    if len(listed) != len(known):
        sys.exit('%d names listed here, %d abilities in the registry'
                 % (len(listed), len(known)))

    OUT.mkdir(exist_ok=True)
    done = 0
    for shot, labels in zip(shots, SHEETS):
        a, boxes = cells(shot)
        if len(boxes) != len(labels):
            sys.exit('%s: found %d frames for %d abilities — the grid was not read '
                     'correctly, check the screenshot is the whole panel'
                     % (shot.name, len(boxes), len(labels)))
        for label, box in zip(labels, boxes):
            g = Image.fromarray(glyph(a, box), 'L')
            bb = g.getbbox()
            if bb:
                g = g.crop(bb)
            g.save(OUT / ('T_Icon_Ability_%s.png' % label.replace(' ', '_')))
            done += 1
    print('wrote %d ability icons to %s' % (done, OUT.relative_to(ROOT)))
    print('now run: python3 tools/build_marks.py')


if __name__ == '__main__':
    main()
