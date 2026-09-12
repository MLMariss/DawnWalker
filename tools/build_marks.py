#!/usr/bin/env python3
"""Turn the game's perk icons in icons-src/ into tintable masks in assets/marks/.

    python3 tools/build_marks.py            # build every mark
    python3 tools/build_marks.py --check    # report coverage, write nothing

Rebel Wolves' community content guidelines permit using content from the game in
a non-commercial, clearly unofficial community site, which is what this planner
is. See the note in README.md.

The board tints a node seven different ways — avail, taken, maxed, gated,
locked, hover and selected each paint the mark a different colour — so the icon
cannot be an <img>. Each file is written as an 8-bit grey+alpha PNG whose alpha
is the artwork's own coverage, to be used as a CSS mask over
`background:currentColor`. That is the same trick styles.css already uses for the
meter icons, and it keeps every state working with one file per node.

Reads any image Pillow can open: the perk icons arrived as .webp textures, the
ability marks as .png cut out of the skill screen. Nothing the site serves needs
Pillow.
"""
import argparse
import json
import pathlib
import re
import sys

try:
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit('This needs Pillow to read .webp:  pip install pillow')

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'icons-src'
OUT = ROOT / 'assets' / 'marks'
SIZE = 128
# The game names its icon textures T_Icon_Perk_<name>; abilities and anything
# else follow the same shape, so strip whatever the middle word is rather than
# hard-coding one prefix.
PREFIX = re.compile(r'^T_Icon_[A-Za-z]+_')

# Filenames that use the game's internal spelling rather than the registry's.
ALIAS = {
    'universalblock': 'omniblock',
    'vigor':          'vigour',
    'parry':          'perfectblock',
    'fatesfavor':     'fatesfavour',
    'hexmastery':     'witchcraftmastery',
}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def registry():
    """normalised name -> node id, for every perk, ultimate and ability."""
    d = json.loads((ROOT / 'data' / 'perks.json').read_text())
    out = {}
    for t in json.loads((ROOT / 'data' / 'abilities.json').read_text())['trees'].values():
        for a in t['abilities']:
            out[norm(a['name'])] = a['node_id']
    for t in d['trees'].values():
        for p in t['perks']:
            out[norm(p['name'])] = p['node_id']
        for i, u in enumerate(t['ultimates'], 1):
            uid = 'U%s%d' % (t['key'], i)
            out[norm(u['name'])] = uid
            if u.get('alias'):
                out[norm(u['alias'])] = uid
    return out


def to_mask(path):
    """The icon's own coverage as alpha, over white ink, trimmed and centred."""
    im = Image.open(path).convert('RGBA')
    r, g, b, a = im.split()

    # Two conventions arrive here and they are opposites, so which one this is
    # has to be read off the file rather than assumed. The perk textures are
    # dark strokes on transparency: the ink is the darkness, inside the opaque
    # part. The ability marks were cut out of the skill screen and are a bright
    # glyph on flat black with no transparency at all: there the ink is the
    # brightness. Getting this backwards renders a solid plaque instead of a
    # mark, which is exactly what it looks like.
    lum = Image.merge('RGB', (r, g, b)).convert('L')
    if a.getextrema()[0] == 255:           # fully opaque: bright glyph on black
        alpha = lum
    else:                                  # dark strokes on transparency
        alpha = Image.composite(lum.point(lambda v: 255 - v),
                                Image.new('L', im.size, 0), a)

    # The artwork fills its shapes with a fine stipple. Averaged down to a 46px
    # node that dither reads as grey haze over the strokes rather than as
    # texture, so a small median pass drops the isolated dots and leaves the
    # linework, which is what carries the icon at that size.
    alpha = alpha.filter(ImageFilter.MedianFilter(3))

    box = alpha.getbbox()
    if box:
        alpha = alpha.crop(box)
    w, h = alpha.size
    scale = (SIZE - 12) / max(w, h)
    alpha = alpha.resize((max(1, round(w * scale)), max(1, round(h * scale))),
                         Image.LANCZOS)
    canvas = Image.new('L', (SIZE, SIZE), 0)
    canvas.paste(alpha, ((SIZE - alpha.width) // 2, (SIZE - alpha.height) // 2))

    out = Image.new('LA', (SIZE, SIZE))
    out.putband = None
    return Image.merge('LA', (Image.new('L', (SIZE, SIZE), 255), canvas))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()

    ids = registry()
    sources = sorted(f for f in SRC.iterdir()
                     if f.suffix.lower() in ('.webp', '.png', '.jpg', '.jpeg'))
    built, unmatched = {}, []
    for f in sources:
        key = norm(PREFIX.sub('', f.stem))
        key = ALIAS.get(key, key)
        node = ids.get(key)
        if not node:
            unmatched.append(f.name)
            continue
        built[node] = f
        if not args.check:
            OUT.mkdir(parents=True, exist_ok=True)
            to_mask(f).save(OUT / ('%s.png' % node), optimize=True)

    if not args.check:
        listing = ',\n    '.join("'%s'" % n for n in sorted(built))
        (ROOT / 'assets' / 'marks.js').write_text(
            '/* Generated by tools/build_marks.py — which nodes have a mask in\n'
            '   assets/marks/. Everything absent falls back to a drawn glyph. */\n'
            'window.MARKS = [\n    %s\n];\n' % listing)

    print('%d source icons -> %d marks%s'
          % (len(sources), len(built),
             '' if args.check else ' in %s' % OUT.relative_to(ROOT)))
    if unmatched:
        print('unmatched, no node for these files:')
        for u in unmatched:
            print('  ', u)
    missing = sorted(set(ids.values()) - set(built))
    if missing:
        print('%d nodes still on the drawn glyph fallback: %s'
              % (len(missing), ', '.join(missing)))
    return 1 if unmatched else 0


if __name__ == '__main__':
    sys.exit(main())
