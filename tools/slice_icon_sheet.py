#!/usr/bin/env python3
"""Cut a generated 3x3 icon sheet into one alpha mask per node.

    python3 tools/slice_icon_sheet.py sheets/sheet-01.png
    python3 tools/slice_icon_sheet.py sheets/W7.png --ids W7      # a repaired single icon
    python3 tools/slice_icon_sheet.py sheets/sheet-03.png --size 192 --dry-run

Input is the white-line-art-on-black PNG that docs/gemini-icon-prompts.md asks
Gemini for. Output is assets/marks/<node id>.png: an 8-bit grey+alpha square
whose alpha is the art's luminance, so it works as a CSS mask over
`background:currentColor` and inherits every state colour the board already
uses. See the wiring section of that document.

Which node ids a sheet holds comes from tools/build_icon_prompts.py, so the
sheet split is defined in exactly one place. Each icon is cropped to its own ink
and rescaled to a common box, which is what makes 90 marks drawn across ten
generations sit at the same optical size.

Stdlib only — the repo carries no image dependency, so PNG reading and writing
are done here. 8-bit non-interlaced greyscale/RGB/RGBA input; 16-bit, palette
and interlaced files are rejected with a message rather than guessed at.
"""
import argparse
import pathlib
import struct
import sys
import zlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_icon_prompts import load_nodes, sheets  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARKS = ROOT / 'assets' / 'marks'

# Anything at or below this (0-255) is treated as background rather than ink.
# Gemini leaves a little noise in the black; a hard 0 threshold would find
# "content" in every cell corner.
FLOOR = 18


# ----------------------------------------------------------------- PNG reading

def read_png(path):
    """Return (width, height, [luminance rows]) for an 8-bit non-interlaced PNG."""
    raw = path.read_bytes()
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        sys.exit('%s is not a PNG. Save the sheet as PNG (a JPEG cannot be read '
                 'here, and its artefacts would smear the mask anyway).' % path)

    pos, idat, hdr = 8, [], None
    while pos < len(raw):
        (length,) = struct.unpack('>I', raw[pos:pos + 4])
        kind = raw[pos + 4:pos + 8]
        body = raw[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            hdr = struct.unpack('>IIBBBBB', body)
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break
        pos += 12 + length

    if hdr is None:
        sys.exit('%s has no IHDR chunk' % path)
    w, h, depth, color, comp, filt, interlace = hdr
    if depth != 8:
        sys.exit('%s is %d-bit; only 8-bit PNGs are read here. Re-export it as '
                 '8-bit.' % (path, depth))
    if interlace:
        sys.exit('%s is interlaced; re-export it without interlacing.' % path)
    if color not in (0, 2, 4, 6):
        sys.exit('%s uses PNG colour type %d (palette or unknown); re-export it '
                 'as greyscale or RGB.' % (path, color))

    channels = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    stride = w * channels
    data = zlib.decompress(b''.join(idat))
    if len(data) < (stride + 1) * h:
        sys.exit('%s is truncated: %d bytes of pixel data, expected %d'
                 % (path, len(data), (stride + 1) * h))

    rows, prev = [], bytearray(stride)
    for y in range(h):
        off = y * (stride + 1)
        line = bytearray(data[off + 1:off + 1 + stride])
        unfilter(data[off], line, prev, channels)
        rows.append(luminance(line, channels, w))
        prev = line
    return w, h, rows


def unfilter(ftype, line, prev, bpp):
    """Undo one PNG scanline filter in place (spec 9.2)."""
    if ftype == 0:
        return
    if ftype == 1:
        for i in range(bpp, len(line)):
            line[i] = (line[i] + line[i - bpp]) & 0xFF
    elif ftype == 2:
        for i in range(len(line)):
            line[i] = (line[i] + prev[i]) & 0xFF
    elif ftype == 3:
        for i in range(len(line)):
            left = line[i - bpp] if i >= bpp else 0
            line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
    elif ftype == 4:
        for i in range(len(line)):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            line[i] = (line[i] + pred) & 0xFF
    else:
        sys.exit('unknown PNG filter type %d' % ftype)


def luminance(line, channels, w):
    """One row as 0-255 ink values, premultiplied against a black background."""
    out = [0] * w
    for x in range(w):
        i = x * channels
        if channels == 1:
            out[x] = line[i]
        elif channels == 2:
            out[x] = line[i] * line[i + 1] // 255
        elif channels == 3:
            out[x] = (line[i] * 299 + line[i + 1] * 587 + line[i + 2] * 114) // 1000
        else:
            lum = (line[i] * 299 + line[i + 1] * 587 + line[i + 2] * 114) // 1000
            out[x] = lum * line[i + 3] // 255
    return out


# ----------------------------------------------------------------- PNG writing

def write_mask(path, size, alpha):
    """Write a grey+alpha PNG: white ink, `alpha` as the mask (row-major)."""
    raw = bytearray()
    for y in range(size):
        raw.append(0)                        # filter: none
        for x in range(size):
            raw += bytes((255, alpha[y][x]))  # grey=white, alpha=ink
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 4, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'
                     + chunk(b'IHDR', ihdr)
                     + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
                     + chunk(b'IEND', b''))


def rel(path):
    """Repo-relative when it can be, absolute otherwise — --out may point anywhere."""
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def chunk(kind, body):
    return (struct.pack('>I', len(body)) + kind + body
            + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF))


# -------------------------------------------------------------------- slicing

def bbox(rows, x0, y0, x1, y1):
    """Tightest box around ink inside the given cell, or None if the cell is blank."""
    top = bottom = left = right = None
    for y in range(y0, y1):
        row = rows[y]
        for x in range(x0, x1):
            if row[x] > FLOOR:
                if top is None:
                    top = y
                bottom = y
                left = x if left is None else min(left, x)
                right = x if right is None else max(right, x)
                break
        else:
            continue
        for x in range(x1 - 1, x0 - 1, -1):
            if row[x] > FLOOR:
                right = max(right, x)
                break
    if top is None:
        return None
    return left, top, right + 1, bottom + 1


def resample(rows, box, size, pad):
    """Box-filter the cropped ink into a `size` square, keeping aspect and padding."""
    x0, y0, x1, y1 = box
    inner = max(1, size - 2 * pad)
    src_w, src_h = x1 - x0, y1 - y0
    scale = min(inner / src_w, inner / src_h)
    dst_w, dst_h = max(1, round(src_w * scale)), max(1, round(src_h * scale))
    ox, oy = (size - dst_w) // 2, (size - dst_h) // 2

    out = [[0] * size for _ in range(size)]
    for dy in range(dst_h):
        sy0 = y0 + dy * src_h // dst_h
        sy1 = max(sy0 + 1, y0 + (dy + 1) * src_h // dst_h)
        for dx in range(dst_w):
            sx0 = x0 + dx * src_w // dst_w
            sx1 = max(sx0 + 1, x0 + (dx + 1) * src_w // dst_w)
            total = n = 0
            for sy in range(sy0, sy1):
                row = rows[sy]
                for sx in range(sx0, sx1):
                    total += row[sx]
                    n += 1
            out[oy + dy][ox + dx] = min(255, total // n)
    return out


def ids_for(path, override, grid):
    if override:
        return override
    stem = path.stem
    for sh in sheets(load_nodes()):
        if sh['id'] == stem:
            return [n['id'] for n in sh['nodes']]
    sys.exit('cannot tell which nodes are in %s. Name the file after its sheet '
             '(sheet-01.png … sheet-10.png) or pass --ids W1,W2,…' % path.name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet', type=pathlib.Path, help='the generated PNG')
    ap.add_argument('--ids', help='comma-separated node ids, in reading order; '
                                  'inferred from the filename when omitted')
    ap.add_argument('--grid', default='3x3', help='cells as COLSxROWS (default 3x3; '
                                                 'use 1x1 for a repaired single icon)')
    ap.add_argument('--size', type=int, default=128, help='output square (default 128)')
    ap.add_argument('--pad', type=int, default=8, help='clear pixels around the ink '
                                                       '(default 8)')
    ap.add_argument('--out', type=pathlib.Path, default=MARKS)
    ap.add_argument('--dry-run', action='store_true', help='report, write nothing')
    args = ap.parse_args()

    try:
        cols, rows_n = (int(v) for v in args.grid.lower().split('x'))
    except ValueError:
        sys.exit('--grid wants COLSxROWS, e.g. 3x3')

    ids = ids_for(args.sheet, [s.strip() for s in args.ids.split(',')] if args.ids
                  else None, args.grid)
    if len(ids) != cols * rows_n:
        sys.exit('%d node ids for a %dx%d grid' % (len(ids), cols, rows_n))

    w, h, px = read_png(args.sheet)
    cw, ch = w // cols, h // rows_n
    n_cells = cols * rows_n
    print('%s — %dx%d, %d cell%s of %dx%d'
          % (args.sheet.name, w, h, n_cells, '' if n_cells == 1 else 's', cw, ch))

    problems = []
    for i, node_id in enumerate(ids):
        cx, cy = i % cols, i // cols
        x0, y0 = cx * cw, cy * ch
        box = bbox(px, x0, y0, x0 + cw, y0 + ch)
        if box is None:
            problems.append('%s: cell %d is blank' % (node_id, i + 1))
            print('  cell %d  %-5s  EMPTY — regenerate this cell' % (i + 1, node_id))
            continue

        touching = [side for side, hit in
                    (('left', box[0] <= x0), ('top', box[1] <= y0),
                     ('right', box[2] >= x0 + cw), ('bottom', box[3] >= y0 + ch)) if hit]
        fill = (box[2] - box[0]) * (box[3] - box[1]) / float(cw * ch)
        note = ''
        if touching:
            note = '  bleeds into %s — grid may be off, check this one' % '/'.join(touching)
            problems.append('%s: ink touches the %s edge of its cell'
                            % (node_id, '/'.join(touching)))
        elif fill > 0.92:
            note = '  fills the cell — no margin, check this one'

        dest = args.out / ('%s.png' % node_id)
        print('  cell %d  %-5s  ink %dx%d (%d%% of cell) -> %s%s'
              % (i + 1, node_id, box[2] - box[0], box[3] - box[1], round(fill * 100),
                 rel(dest) if not args.dry_run else '(dry run)', note))
        if not args.dry_run:
            write_mask(dest, args.size, resample(px, box, args.size, args.pad))

    if problems:
        print('\n%d cell(s) need another look:' % len(problems))
        for p in problems:
            print('  - %s' % p)
        print('Redraw them with the §Repair prompt in docs/gemini-icon-prompts.md.')
        return 1
    print('\nall %d mark%s written to %s'
          % (len(ids), '' if len(ids) == 1 else 's', rel(args.out)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
