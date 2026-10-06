#!/usr/bin/env python3
"""Write the planner's plain-text perk reference into index.html, and sitemap.xml.

    python3 tools/build_seo.py           # rewrite both in place
    python3 tools/build_seo.py --check   # fail if either is out of date

Everything the planner shows is drawn by app.js from data/*.json after the page
loads, so the HTML a search engine fetches is a header, some empty containers and
the legal note. Google renders script eventually and at low priority; Bing, link
previews and most other crawlers never do. To them the site is about forty words
long and mentions no perk by name, so it cannot be found by searching for one.

This puts the registries into the page itself: a folded "Perk & Ability
Reference" drawer under the board, listing every perk, ultimate and ability with
every level's effect, cost and gate. It is real, visible content (open the drawer and read it),
not text hidden for crawlers, and it is generated rather than written by hand so
it cannot drift from the data the planner uses. The block sits between the
`seo:index` markers in index.html; edit this script, not the markers' contents.

The output is committed, so the repo stays buildless and `python3 -m http.server`
serves the same page the site does. The deploy workflow runs --check, so a data
change that forgot to rerun this fails the deploy instead of shipping a stale
reference.
"""
import html
import json
import re
import sys

PAGE = 'index.html'
SITEMAP = 'sitemap.xml'
SITE = 'https://mlmariss.github.io/DawnWalker/'
TREES = ('Witchcraft', 'Swordmastery', 'Vampirism')
REPO = 'https://github.com/MLMariss/DawnWalker'
VERIFY = REPO + '/blob/main/VERIFICATION.md'

BEGIN = '<!-- seo:index -->'
END = '<!-- /seo:index -->'
BLOCK = re.compile(r'([ \t]*)%s.*?%s' % (re.escape(BEGIN), re.escape(END)), re.S)

TIMES = {'ANYTIME': 'any time', 'DAY ONLY': 'day only', 'NIGHT ONLY': 'night only'}


def e(s):
    return html.escape(str(s), quote=False)


def levels(n):
    return '1 level' if n == 1 else '%d levels' % n


def plural(n, word):
    return '%d %s%s' % (n, word, '' if n == 1 else 's')


def gate(g):
    """The level's gate as a reader would say it, or None when there is none."""
    if g == 'none':
        return None
    if g == 'manual':
        return 'needs a manual'
    if g == 'road shrine':
        return 'at a road shrine'
    if g == 'vrakhir blood':
        return 'needs Vrakhir blood'
    if g == 'quest':
        return 'story unlock'
    return g  # "corruption 7" reads as it is


def levels_ol(rows, indent):
    """One line per level: the effect, then what it costs and what gates it.
       This is the part no other site carries in full, so it is the part worth
       putting in front of a crawler."""
    out = [indent + '<ol class="ref-lv">']
    for r in rows:
        cost = [plural(r['skill_points'], 'skill point'),
                plural(r['time_segments'], 'time segment')]
        if gate(r['gate']):
            cost.append(gate(r['gate']))
        effect = e(r['effect']) + ' ' if r['effect'] else ''
        out.append(indent + '  <li>%s<i>%s</i></li>' % (effect, ', '.join(cost)))
    out.append(indent + '</ol>')
    return out


def perk_li(p, indent):
    bits = []
    if p.get('active_time') in TIMES:
        bits.append(TIMES[p['active_time']])
    if p.get('quest_unlock'):
        bits.append('story unlock')
    note = ' <i>(%s)</i>' % ', '.join(bits) if bits else ''
    return ([indent + '<li><b>%s</b>%s %s' % (e(p['name']), note, e(p['effect']))]
            + levels_ol(p['levels'], indent + '  ') + [indent + '</li>'])


def ult_li(u, indent):
    alias = ' <i>(also listed as %s)</i>' % e(u['alias']) if u.get('alias') else ''
    c = u['cost']
    return [indent + '<li><b>%s</b>%s %s <i>Requires %s; %s, %s.</i></li>' % (
        e(u['name']), alias, e(u['effect']), e(u['requirement']),
        plural(c['skill_points'], 'skill point'), plural(c['time_segments'], 'time segment'))]


def abil_li(a, indent):
    bits = [a['kind']]
    if a.get('story_granted'):
        bits.append('story granted')
    if a['use_cost']['charges'] or a['use_cost']['health_percent']:
        bits.append('costs ' + e(a['use_cost']['text']).lower())
    return ([indent + '<li><b>%s</b> <i>(%s)</i> %s' % (e(a['name']), ', '.join(bits), e(a['effect']))]
            + levels_ol(a['levels'], indent + '  ') + [indent + '</li>'])


def render(perks, abils, indent):
    n_perks = sum(len(perks['trees'][t]['perks']) for t in TREES)
    n_ults = sum(len(perks['trees'][t]['ultimates']) for t in TREES)
    n_abils = sum(len(abils['trees'][t]['abilities']) for t in TREES)

    out = [
        BEGIN,
        '<details class="drawer" id="refdrawer">',
        '  <summary>',
        '    <span class="drawer-title">Perk &amp; Ability Reference</span>',
        '    <span class="drawer-note">every perk, ultimate and ability in one list</span>',
        '  </summary>',
        '  <div class="ref">',
        '    <p class="ref-intro">Every perk, ultimate perk and ability in <em>The Blood of '
        'Dawnwalker</em>&rsquo;s three skill trees &mdash; %d perks, %d ultimates and %d '
        'abilities &mdash; with each level&rsquo;s effect, its skill point and time segment '
        'cost, and what gates it: a manual, a road shrine, a corruption level or a story '
        'quest.</p>' % (n_perks, n_ults, n_abils),
        '    <p class="ref-src">Costs, gates and effect text were transcribed from the '
        'game&rsquo;s own skill screens and cross-checked against Game8 and Fextralife; '
        '<a href="%s">VERIFICATION.md</a> lists every check and where the sources disagree. '
        'Damage figures are shown at character level %d. Made by MLMariss; the data and code '
        'are on <a href="%s">GitHub</a>.</p>' % (VERIFY, perks['scaling']['anchor_level'], REPO),
    ]
    for t in TREES:
        tree = perks['trees'][t]
        out += [
            '    <section class="ref-tree">',
            '      <h2>%s skill tree</h2>' % t,
            '      <h3>%s perks</h3>' % t,
            '      <ul>',
        ]
        for p in tree['perks']:
            out += perk_li(p, '        ')
        out += [
            '      </ul>',
            '      <h3>%s ultimate perks</h3>' % t,
            '      <p>%s</p>' % e(tree['ultimate_rule']),
            '      <ul>',
        ]
        for u in tree['ultimates']:
            out += ult_li(u, '        ')
        out += [
            '      </ul>',
            '      <h3>%s abilities</h3>' % t,
            '      <ul>',
        ]
        for a in abils['trees'][t]['abilities']:
            out += abil_li(a, '        ')
        out += ['      </ul>', '    </section>']
    out += ['  </div>', '</details>', END]
    return '\n'.join(indent + line if line else line for line in out)


def sitemap():
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            '  <url>\n'
            '    <loc>%s</loc>\n'
            '  </url>\n'
            '</urlset>\n' % SITE)


def main(argv):
    perks = json.load(open('data/perks.json', encoding='utf-8'))
    abils = json.load(open('data/abilities.json', encoding='utf-8'))
    page = open(PAGE, encoding='utf-8').read()

    m = BLOCK.search(page)
    if not m:
        print('%s: no %s ... %s block to fill' % (PAGE, BEGIN, END))
        return 1
    new_page = page[:m.start()] + render(perks, abils, m.group(1)) + page[m.end():]

    try:
        old_map = open(SITEMAP, encoding='utf-8').read()
    except FileNotFoundError:
        old_map = None
    new_map = sitemap()

    if argv and argv[0] == '--check':
        stale = [f for f, old, new in ((PAGE, page, new_page), (SITEMAP, old_map, new_map))
                 if old != new]
        for f in stale:
            print('out of date: %s (run python3 tools/build_seo.py)' % f)
        if stale:
            return 1
        print('%s and %s match data/' % (PAGE, SITEMAP))
        return 0

    if argv:
        print(__doc__)
        return 2

    open(PAGE, 'w', encoding='utf-8').write(new_page)
    open(SITEMAP, 'w', encoding='utf-8').write(new_map)
    print('wrote %s and %s' % (PAGE, SITEMAP))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
