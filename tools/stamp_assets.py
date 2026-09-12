#!/usr/bin/env python3
"""Stamp index.html's asset URLs with a version token, for cache busting.

    python3 tools/stamp_assets.py <token>     # rewrite index.html in place
    python3 tools/stamp_assets.py --check     # verify nothing is left unstamped

GitHub Pages serves assets/app.js and assets/styles.css with a cache lifetime,
and index.html asks for them by a name that never changes. So a browser that has
been to the site keeps running the old planner after a deploy — silently, and
indistinguishably from the deploy having failed. This bit a real user, twice:
they merged a change, reloaded, and saw the previous build.

Appending ?v=<commit sha> to each reference makes the URL change whenever the
build does, so a normal reload fetches the new file. The deploy workflow runs
this on a checkout before publishing; the committed index.html stays clean, and
`python3 -m http.server` locally is unaffected.

The mark PNGs are deliberately NOT stamped. They are named by content (S1.png),
they change only when the icons are rebuilt, and stamping them would re-download
all 90 on every visit after every deploy to catch a change that almost never
happens. The JSON registries are not stamped either: app.js already fetches
those with `cache: 'no-cache'`, which revalidates them on every load.
"""
import re
import sys

PAGE = 'index.html'

# Every same-origin asset index.html names, and the attribute that carries it.
# Anything under assets/ that the page loads directly belongs here; add to this
# list rather than loosening the pattern, so a typo fails --check instead of
# silently going unstamped.
ASSETS = [
    ('href', 'assets/styles.css'),
    ('src',  'assets/marks.js'),
    ('src',  'assets/icons.js'),
    ('src',  'assets/app.js'),
]


def ref(attr, path):
    """Match the reference with or without a token already on it, so the script
       is idempotent — running it twice replaces the stamp rather than doubling
       it."""
    return re.compile(r'(%s=")(%s)(\?v=[^"]*)?(")' % (attr, re.escape(path)))


def stamp(html, token):
    missing = []
    for attr, path in ASSETS:
        html, n = ref(attr, path).subn(r'\1\2?v=%s\4' % token, html)
        if not n:
            missing.append(path)
    return html, missing


def main(argv):
    html = open(PAGE, encoding='utf-8').read()

    if argv and argv[0] == '--check':
        bare = [p for a, p in ASSETS
                if re.search(r'%s="%s"' % (a, re.escape(p)), html)]
        unknown = set(re.findall(r'(?:src|href)="(assets/[^"?]+)', html)) \
            - {p for _, p in ASSETS}
        for p in bare:
            print('unstamped: %s' % p)
        for p in sorted(unknown):
            print('not in ASSETS, so never stamped: %s' % p)
        if bare or unknown:
            return 1
        print('%s: all %d assets carry a token' % (PAGE, len(ASSETS)))
        return 0

    if len(argv) != 1:
        print(__doc__)
        return 2

    token = argv[0]
    if not re.fullmatch(r'[A-Za-z0-9._-]+', token):
        print('token must be URL-safe, got %r' % token)
        return 2

    out, missing = stamp(html, token)
    if missing:
        # A reference that moved or was renamed must fail the build, not ship
        # half-stamped — half-stamped is the bug this script exists to prevent.
        for p in missing:
            print('ERROR: %s references no %s' % (PAGE, p))
        return 1

    open(PAGE, 'w', encoding='utf-8').write(out)
    print('stamped %d assets in %s with ?v=%s' % (len(ASSETS), PAGE, token))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
