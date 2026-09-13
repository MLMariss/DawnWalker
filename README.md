# The Blood of Dawnwalker — Skill Tree Planner

An interactive, dependency-free planner for all three skill trees in *The Blood of
Dawnwalker*: **Witchcraft**, **Swordmastery** and **Vampirism**. Click nodes to spend
skill points, watch prerequisites and corruption gates unlock, pick an ultimate, and
share the result as a link.

Open `index.html` through a web server (see below) or publish the repo with GitHub
Pages and it works as the site index.

## What it does

- **All 54 perks and 9 ultimates**, laid out at their in-game grid positions with
  connector lines drawn from the prerequisite graph.
- **All 27 abilities**, split into **active** (14 — they cost activation charges
  or health every time you fire them) and **passive** (13 — no activation cost;
  they simply run once equipped, and still occupy an ability slot). Each shows
  what it costs to use as well as to learn. They are learned independently of the
  perk graph and count toward what a tree costs you — but not toward the 35
  points an ultimate needs.
- **Point spending with real rules** — a perk level only becomes learnable when every
  prerequisite has at least one level, and refunding is blocked while a downstream
  perk still depends on it.
- **Gates enforced.** Vampiric levels respect their Corruption requirement (slider in
  the header, 0–15). Levels that need a Manual found in the world are gated behind the
  "Manuals found" toggle. The two padlocked story nodes — *Font of Life* and
  *Mandrake Ward* — are click-to-toggle and cost nothing.
- **Story grants start learned.** Five abilities are handed to you by the story
  rather than bought — *Astral Communion*, *Burning Blood*, *Compel Soul*,
  *Dirty Trick* and *Voracious Bite*. There is no build in which you do not have
  them, so the planner opens with all five at level 1: Reset puts them back,
  Refund will not take level 1 away, and their level-1 gate does not apply, so
  neither manual-gated one (*Dirty Trick*, *Burning Blood*) is a manual to go and
  find. Level 1 costs no skill points and no time segments, carries a green
  **Story** badge and appears in no total. Upgrades are paid for normally, and a
  build link records only the levels you bought on top.
- **Ultimates.** Three per tree, one selectable, unlocked at 35 points spent on
  *perks* in that tree (Witchcraft, Swordmastery) or Corruption 15 (Vampirism).
  They sit directly under the tree and are always on screen — the choice is
  permanent, so it is not hidden behind a disclosure triangle.
- **Totals carry the scope the perk gives them.** Three perks reduce
  "Cooldowns" and three more add "Slots available", each scoped by its own effect
  line to one tree's abilities. The level text drops the scope, so the overview
  reads it off the perk and keeps the rows apart — *Cooldowns (Swordmastery
  abilities)* is not the same number as Witchcraft's or Vampirism's, and summing
  them was wrong. A chance written with the number in the middle ("Weapon
  Critical Hit : 6% chance") is a total like any other; the three long lists
  under the totals fold away behind their count and scroll in place.
- **The tree is a fixed size, not a squeeze to fit.** `--node` and `--row` step
  down by viewport height in the stylesheet and the board scrolls for whatever is
  left over. It used to be sized from "the column minus what my siblings occupy",
  which measured the drawers empty on the first paint and full on every one
  after, so the board resized under the cursor on the first click — and made the
  tree's size depend on the length of the page below it.
- **Running totals** for skill points, time segments and manuals across all trees,
  plus a per-treepoint count and manual count on each tab — so you can see what a
  given tree actually costs you to find in the world.
- **Build overview.** Every bonus you have taken, added up and grouped. Within one
  perk a later level replaces the earlier one for the same stat (Endless Effort's
  +100% is not also +25% and +50%); across different perks the same stat adds up.
  Conditional effects and the manuals you still need are listed separately.
- **Synergy, graded, on the board.** Selecting a node scores every other perk,
  ability and ultimate by how much of this one's effect actually reaches it, and
  marks the partners in the tree with a coloured dot: **green** at 100%, **amber**
  from 75%, **red** from 50%. Below 50% is not marked at all. The key is one line
  under the board. Nothing about synergy goes in the side panel — that space
  belongs to the perk you selected. Toggleable.
- **Shareable builds.** The URL hash carries the whole build; "Copy link" puts it on
  the clipboard. Lowering Corruption or switching Manuals off peels back any level
  that is no longer legal rather than leaving an impossible build on screen.
- **Saved and published builds.** One string — the same one the address bar carries
  after `#b=` — *is* the build, so a link, a save and a published build are the same
  thing wearing different hats. **Save** keeps it in this browser under a name, or
  publishes it to the community list; **Builds** is that list plus everything saved
  here, each row showing what the build costs before you load it. Publishing and
  upvoting happen in the page — no account, no sign-in, nowhere else to go — and
  an upvote is a toggle, so a changed mind costs one more click rather than being
  stuck. The vote button only appears while the board still *is* the published
  build: edit one node and it steps aside for "Back to original", so an upvote always
  means the build it is attached to. See
  [Community builds](#community-builds) for where the list lives.

Controls: **click** a node to learn its next level, **right-click** to refund,
**Backspace** refunds the focused node, and the side panel has explicit Learn/Refund
buttons for touch.

## Layout

The board fits the window rather than scrolling. Columns are remapped into the
space available — keeping the game's relative spacing, with a floor *and a
ceiling* on the gap between neighbours — instead of zooming the whole board,
which would drag the labels below a readable size. Nothing on the page is set
under 12px.

The ceiling on the column gap is why the tree does not sprawl on a wide monitor,
and it is the only ceiling the board has. Capping the board's width outright was
tried and reverted: at 1000px, eleven Swordmastery columns could not hold a
full-size node, so the hexes shrank to fit and the whole board read cramped. A
squeezed tree is a worse trade than a narrower column of text, so the panel takes
`clamp(360px, 25vw, 520px)` and the board keeps the rest.

The node is still a ceiling rather than a fixed size, as a safety net at the
narrow end. `nodeThatFits` returns the largest node that leaves a gutter between
neighbours for a given width and column count, and the layout takes whichever is
smaller, that or the stylesheet's. On any desktop-width board that is never the
stylesheet's, so nothing shrinks. Below about 1100px it is: eleven columns in a
650px board used to overlap their hexes and run their names together, because
`distribute` relaxed its column floor to fit. A column may now never be narrower
than a node plus its gutter, the node shrinks instead — padding and label
allowance derive from it, so the whole row scales together — and below `NODE_MIN`
the board scrolls sideways. A board you scroll is legible; overlapping hexes are
not.

### The side column is an accordion

Two panes, the perk panel and the build overview, and exactly one is open at a
time. The open one takes the column and scrolls inside itself; the closed one is
its own header bar and nothing else. The overview starts closed, so by default
the perk panel has the column and the overview is a strip along the bottom;
opening it gives it the full height and folds the panel to its hero row, and
clicking that hero row is what brings the perk back and returns the overview to
the bottom.

The whole mechanism is the grid's row template — `1fr auto` one way, `auto 1fr`
the other — with both rows `minmax(0, …)` so the open pane shrinks to the column
and scrolls rather than growing to its content and pushing the other off. Each
pane's header is sticky, because a scrolled pane whose title has gone is one you
cannot tell from the other.

This replaced three nested scrollbars: the panel scrolled inside the column, the
overview inside its sibling, and each conditional-effects list inside that —
three bars a few pixels apart, each owning a different slice of the same text.
There is still only ever one, because only one pane is open.

The Ultimate Perks, Abilities and Build overview sections are all collapsible, so
a short screen can give the tree its height back. Ultimates start folded: the
choice is permanent, but it is also unavailable until the tree is most of the
way spent, so the summary carries the progress counter — `Perk points 12/35`,
or `Corruption 15/15` on Vampirism — and says `ready to choose` once the
requirement is met. Once one is taken the summary names it instead, which is the
only thing about a settled, permanent choice worth seeing without opening
anything.

Below 1000px the columns stack and the page itself scrolls, so nothing inside it
claims a slice of viewport height. Below 640px fitting the board to the window
would put the names on top of each other, so the floor on column spacing wins
instead and the board scrolls sideways — a name you can read beats a tree that
fits. Scrollbars are themed to the page rather than left as system chrome.

## Repository layout

```
index.html                     markup and page chrome
assets/styles.css              the dark skin
assets/app.js                  planner logic — reads the JSON, renders from it
assets/icons.js                drawn SVG glyphs — the fallback where no mark exists
assets/marks.js                generated — which nodes have a mask
assets/marks/                  the game's perk icons as tintable alpha masks
icons-src/                     the source icons the masks are built from
data/perks.json                the perk registry — single source of truth
data/abilities.json            the ability registry, generated from two saved pages
data/mechanics.json            the synergy graph — systems, causal edges, per-node mapping
data/community.json            where the shared build list lives — empty means no list
tools/verify_perks.py          checks all three registries, and perks against a source page
tools/extract_abilities.py     rebuilds data/abilities.json from saved ability pages
tools/build_mechanics.py       rebuilds data/mechanics.json
tools/build_marks.py           rebuilds assets/marks/ from icons-src/
api/src/index.js               the build list's backend — a Cloudflare Worker over D1
api/schema.sql                 its three tables
api/migrations/                one file per schema change, for a database already live
api/README.md                  how to deploy it, and how to moderate the list
tools/extract_ability_icons.py cuts ability marks out of skill-screen shots
VERIFICATION.md                what was checked, and where the sources disagreed
```

Nothing about the perks is hard-coded in `app.js` beyond the icon mapping. Adding,
removing or rebalancing a perk means editing `data/perks.json` only, and a balance
patch shows up as a clean diff.

## Running locally

`fetch()` is blocked on `file://` URLs, so double-clicking `index.html` will show a
load error. Serve the folder instead:

```sh
python3 -m http.server
# then open http://localhost:8000
```

For GitHub Pages: Settings → Pages → Source → **GitHub Actions**. There is still no
build step — `.github/workflows/pages.yml` only stamps the asset URLs before
publishing the folder as-is.

Served locally the community tab says there is no list, because `data/community.json`
points nowhere by default. Saving, loading, codes and links all work.

## Community builds

The planner is a static site, so it cannot hold a credential — anything in
`assets/app.js` is readable by everyone who loads the page. Writing to a shared
list therefore needs something else to own that access, and that something is a
Cloudflare Worker over a D1 database, in `api/`. Its address lives in
`data/community.json`; an empty one means this copy has no list, which is what a
fork or a folder served locally gets.

The point of it is that publishing and upvoting never leave the planner. No
account, no sign-in, no tab opening somewhere else — which was the whole problem
with keeping the list on the issue tracker, where a casual upvote cost a round
trip through GitHub and most people would simply not have bothered.

Whoever publishes a build can also take it down, which needs some proof of
authorship where there are no accounts. Publishing mints a random delete key,
hands it back exactly once and keeps only its hash, so the planner can show a
Delete button on your own builds and on nobody else's — and the database cannot
give that ability away, even to whoever reads a backup of it. The key lives in
one browser, so clearing your site data costs you the ability to remove your own
build; the admin token is the backstop. Deleting hides the row rather than
dropping it, so a mis-click is one command to undo.

What that buys in convenience it gives back in exposure: an anonymous write
endpoint is an invitation. Three things push back, and `api/README.md` is honest
about the limits of each — a salted, hashed fingerprint of address and user agent
that dedupes votes, a cap of five published builds a day per fingerprint, and
Turnstile if a secret is configured for it. None of them is unbeatable. The
backstop is `ADMIN_TOKEN` and a curl command that hides a row, reversibly, which
is the right amount of engineering for a fan planner's upvote count.

If the Worker is unreachable the planner says so and offers a retry. Nothing else
degrades, because nothing else goes through it.


A code that does not survive the planner's own rules — an ultimate its points no
longer pay for, a perk a patch removed — is not rejected; it loads as much of
itself as is legal. Builds are matched by what they decode to rather than by
string, so such a build still keeps its identity, and its upvote, after the rules
move under it.

## Data format

### `data/abilities.json`

Generated — run `tools/extract_abilities.py <game8.html> <fextralife.html>` to
rebuild it from saved copies of the two ability pages. Each tree holds an
`abilities` array:

```json
{
  "node_id": "AV10",
  "name": "Voracious Bite",
  "effect": "Restores Health by drinking target's blood.",
  "kind": "active",
  "max_level": 4,
  "use_cost": { "text": "1 Activation Charge", "charges": 1, "health_percent": 0 },
  "levels": [
    { "level": 1, "effect": "Restores 60% of Health Segment. 124 Damage to target",
      "skill_points": 1, "time_segments": 1, "gate": "none" }
  ]
}
```

- `use_cost` is what the ability costs to *fire*, not to learn; only the
  Fextralife table publishes it.
- `story_granted: true` means the story hands you level 1: it costs no skill
  points and no time segments, and the planner shows "Story — no points" in its
  place. Upgrades are unaffected. This is observed in game and appears in neither
  source table, so nothing can cross-check *which* abilities carry it — the
  verifier only checks the flag is a real boolean on an ability that has levels.
- `kind` is `active` or `passive`, decided by `use_cost`: anything that pays an
  activation charge or health is active. The drawer groups by it. Passives still
  take an ability slot — they work "once equipped in the Active Ability panel" —
  so both kinds compete for the same slots. The verifier re-derives it, so the
  field cannot drift from the cost it is read from.
- Ability gates add one value to the perk set: `vrakhir blood`, a Phial of
  Vrakhir Blood consumed to learn that level. It is counted in the build
  overview rather than treated as a lock, because it is an item, not a
  threshold.
- Abilities have no prerequisites in either source, so they are learned
  independently of the perk graph.
- Ability node ids are prefixed `A` and never collide with perk ids; the
  verifier checks this, because build state is keyed by id.

### `data/perks.json`

`data/perks.json` holds `game`, `subject`, `notes` and `trees`. Each tree has a short
`key` (`wc`/`sm`/`vp`), a `perks` array, three `ultimates` and an `ultimate_rule`
string. A perk looks like this:

```json
{
  "node_id": "S3",
  "name": "Endless Effort",
  "row": 1,
  "x": 765,
  "max_level": 4,
  "prerequisites": [],
  "unlocks": ["S8", "S9"],
  "quest_unlock": false,
  "effect": "More stamina.",
  "levels": [
    { "level": 1, "effect": "+25% max stamina", "skill_points": 1, "time_segments": 0, "gate": "none" }
  ]
}
```

- `row` (1–4) and `x` (in-game pixel column) drive the layout; the board is scaled to
  fit the viewport.
- `gate` is one of `none`, `manual`, `road shrine`, `vrakhir blood`, `quest`, or
  `corruption <n>`. The planner renders it as its own mark plus the word for it —
  never as a bare icon, and never twice on the same row.
- `unlocks` is the exact inverse of `prerequisites` across all three trees; the app
  builds its graph from `prerequisites` and treats `unlocks` as documentation.
- `active_time` (`ANYTIME`, `DAY ONLY`, `NIGHT ONLY`) may sit on a tree or on a
  single perk; a perk's own value wins. It is read on the tree's own tab, which
  carries whatever the tree is mostly (starred when the tree is not unanimous);
  a perk card shows it only where the perk disagrees with its tree, so the badge
  always means "this one is the exception". Swordmastery and Vampirism are
  unanimous, so it never appears on their cards at all.
- An ultimate may carry an `alias` when published lists disagree on its name; the
  planner shows it on the card.
- `requirement` on an ultimate may name more than one condition and all of them
  must hold. Witchcraft and Swordmastery read `"35 points in tree"`; Vampirism
  reads `"Corruption 15"` and has no point requirement.
- Top-level `source_overrides` records any field where the registry knowingly
  departs from the external source, with the reason.

**Ability points do not count toward the ultimate.** The "35 skill points in a
tree" threshold reads perk spend alone, so a tree full of abilities and no perks
never unlocks its ultimate. The planner keeps two totals: `spent()` — perks and
abilities together — is what a tree costs you and what the tab badges show;
`perkSpent()` is what the ultimate gate reads. Refunding an ability can never
cost you a selected ultimate.

### `data/mechanics.json`

Generated from `tools/build_mechanics.py`. This is the one file in the repo that
is an interpretation rather than a transcription, and it is written to be argued
with. It has three parts:

```json
{
  "systems": {
    "crit_events": { "name": "Critical hits landed",
                     "note": "Chance times hits, not chance alone." }
  },
  "edges": [
    { "from": "attacks_landed", "to": "crit_events",
      "why": "Critical chance is rolled per hit, so more hits mean more criticals." }
  ],
  "nodes": {
    "S18": { "name": "Restless Blade", "provides": ["cooldown_reduction"],
             "scales_with": ["crit_events"],
             "note": "Level 3 is -50% cooldowns on a critical hit." }
  }
}
```

- **`systems`** are the things a build can act on — attack speed, criticals
  landed, ability uptime, corruption, and so on.
- **`edges`** are directed: `from` A `to` B means more A produces more B. Every
  edge carries a `why` naming the perk or mechanic that makes it true and a
  `strength` of `strong`, `moderate` or `weak`, so a reader can disagree with one
  link rather than the whole file.
- **`nodes`** map all 90 perks, abilities and ultimates onto those systems.
  `provides` is what the node raises; `scales_with` is what makes it worth more.

Synergy is `provides` meeting `scales_with`, directly or along a chain, and it
is scored as a **multiplier** rather than a distance. Each link passes on part of
what went in — strong 0.9, moderate 0.75, weak 0.5 — and a chain multiplies, so
two strong links carry 81%. Meeting at a **hub** system multiplies by a further
0.6, because a claim true of hundreds of pairs is a generic one. The result is a
percentage:

| Score | Colour | Meaning |
| --- | --- | --- |
| 100% | green | Direct meeting on a non-hub system — this node provides exactly what the other is paid by |
| 75–99% | amber | One or two firm links away |
| 50–74% | red | Generic, conditional, or a stretch |
| under 50% | — | Not shown. A fifth of an effect is not a synergy |

The whole model lives in the file's `scoring` block, so changing it is a data
edit. The planner walks at most two edges: past that the graph is connected
enough that everything is a synergy. The score is rendered only as a coloured
dot on the board — the chain that produced it is in the data and in `why`, not on
screen.

`breadth` on each system is **derived, not hand-picked** — `meeting_pairs`
counts how many node pairs can actually meet there, and anything at or above 150
is a hub. Today that is ability uptime (783 pairs), attacks landed (216) and
activation charges (180). `tools/verify_perks.py` recomputes both and fails if
the committed values have gone stale.

Edge `strength` follows one rule worth knowing: an edge that exists only because
*one named perk* provides it is `moderate`, however plainly that perk states it.
"Ability uptime raises weapon damage" is true of anyone carrying Adrenaline Rush
and of nobody else, so a chain through it is conditional on a build choice.
`strong` is reserved for the mechanic itself, or a rule several separate perks
attest to independently.

Ultimates have no `node_id` in the perk registry, so they are keyed here as
`U<tree key><index from 1>` — `Usm2` is Sword Sage.

The graph has cycles on purpose. Criticals cut cooldowns, cooldowns raise
uptime, uptime raises damage, damage kills, and kills cut cooldowns again; that
loop is the game, so any reader has to bound its own traversal rather than
assume a DAG.

Integrity checks that hold for the committed data: every prerequisite and unlock
resolves to a real node, every perk's `max_level` matches its number of `levels`
entries, and every node in the mechanics graph is a real perk, ability or
ultimate naming declared systems. Run them yourself with:

```sh
python3 tools/verify_perks.py                        # internal consistency
python3 tools/verify_perks.py path/to/game8-page.html # plus an external source
```

Every level cost and gate in the registry has been cross-checked against a
published perk list — see [VERIFICATION.md](VERIFICATION.md) for the method, the
result, and the three places the sources contradicted each other.

## Notes and caveats

- Perk data was read from in-game skill screens; node names were resolved by matching
  each icon against the named perk icon set. Some sources label two rows "Lv. 3" — the
  second is Lv. 4, and the in-game pips confirm four slots on those perks.
- Node positions and the prerequisite graph are read from the in-game skill screens.
  No published list records tree topology, so `tools/verify_perks.py` has nothing to
  compare them against — a limit on the script, not on the data.
- Every node — all 54 perks, 9 ultimates and 27 abilities — uses the game's own
  icon. The drawn glyphs in `assets/icons.js` remain as the fallback for any node
  whose mark is missing. Rebel Wolves' community content
  guidelines permit using content from the game for a community website, on four
  conditions this project meets: nothing commercial, nothing carried into another
  product, labelled unofficial, and lawful. The label is in the page footer, not
  only here. The guidelines do not override the EULA, so if you repackage this,
  read that too; `legal@rebel-wolves.com` is the contact for anything unclear.
- `tools/build_marks.py` turns the sources in `icons-src/` into
  `assets/marks/<node id>.png`.
  Each is an alpha mask rather than a picture, painted with `currentColor`, because
  the board tints a node seven ways — avail, taken, maxed, gated, locked, hover and
  selected — and an `<img>` cannot follow that.
- The perk icons came from the game as texture files. The abilities never did, so
  `tools/extract_ability_icons.py` cuts them out of screenshots of the three
  ability panels: it finds each frame, masks the heptagon border and level badge
  away geometrically, and takes its threshold from each cell's own histogram,
  because a frame is dim purple or gold-lit depending on whether you have levels
  in it. Reading order is checked against `data/abilities.json`, so a misordered
  screenshot fails the run instead of mislabelling a mark.
- Individual level costs are the likeliest thing to drift between game patches. If you
  spot a mismatch, fix `data/perks.json` and the page follows.
- Stinging Blade's level 4 cost is the one number still worth a second look; see
  VERIFICATION.md.
- **Every level row is the game's own text**, across both registries. It took two
  capture passes: the ability panel's level list scrolls, so the first pass never
  reached the bottom rows of 21 abilities and they kept the Game8 table's text.
  That table turned out to drop clauses (Dirty Trick *stuns in Area* at levels 3
  and 4; Charge keeps *+66% Bleed Duration* at level 4), **invent** one (Soul
  Stigma never becomes an area effect, whatever the table says), get numbers
  wrong (Walking Fortress restores 25% at level 4, not 50%), and miss a level
  outright (Piercing Shriek has four, not three). VERIFICATION.md lists all of
  it.
- **Damage figures state the character level they belong to, and follow yours.**
  Damage scales with the character, so a figure is meaningless without a level —
  splice two levels together and an upgrade reads as a downgrade, which is how a
  whole class of errors was found. Every figure is what the game shows at
  **character level 20**, and a second capture at level 9 fixes the growth per
  level: exactly 131/62 for Vampirism, measured on seven pairs that all reduce to
  the same fraction. The header's **Char. level** slider restates every figure
  live, and the card marks each restated row.
- **The figures have a structure.** A displayed figure is a per-level unit value
  times the character's power, and that power is an integer — 62 at level 9, 131
  at level 20. Blood Surge's units are 4/5/6/7, Death From Above's 13/15/17/19.
  The game **truncates** rather than rounds (Voracious Bite reads 602 where
  rounding gives 603), so a stored figure stands for a value in `[d, d+1)` and is
  restated from its midpoint. Nine figures are computed rather than read and say
  so.
- `tools/verify_perks.py` replays the level 9 captures through the model and
  fails if a figure no longer comes back to what the panel showed. It also fails
  on any level whose figure drops below the one beneath it, and on any row
  missing a Duration that its neighbours both state.
- Fan-made and unofficial. Not affiliated with Rebel Wolves.
