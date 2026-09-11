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
- **All 27 active abilities**, in a collapsible drawer per tree, with what each
  costs to *use* (activation charges and health) as well as to learn. They are
  learned independently of the perk graph and count toward the same totals.
- **Point spending with real rules** — a perk level only becomes learnable when every
  prerequisite has at least one level, and refunding is blocked while a downstream
  perk still depends on it.
- **Gates enforced.** Vampiric levels respect their Corruption requirement (slider in
  the header, 0–15). Levels that need a Manual found in the world are gated behind the
  "Manuals found" toggle. The two padlocked story nodes — *Font of Life* and
  *Mandrake Ward* — are click-to-toggle and cost nothing.
- **Ultimates.** Three per tree, one selectable, unlocked at 35 points spent in that
  tree (Witchcraft, Swordmastery) or Corruption 15 (Vampirism).
- **Running totals** for skill points, time segments and manuals across all trees,
  plus a per-treepoint count and manual count on each tab — so you can see what a
  given tree actually costs you to find in the world.
- **Build overview.** Every bonus you have taken, added up and grouped. Within one
  perk a later level replaces the earlier one for the same stat (Endless Effort's
  +100% is not also +25% and +50%); across different perks the same stat adds up.
  Conditional effects and the manuals you still need are listed separately.
- **Synergy marks (experimental).** Selecting a perk puts a small bright point on
  every other perk in the tree that acts on the same system — stamina, critical
  hits, claws, cooldowns and so on — derived from the effect text. Toggleable.
- **Shareable builds.** The URL hash carries the whole build; "Copy build link" puts
  it on the clipboard. Lowering Corruption or switching Manuals off peels back any
  level that is no longer legal rather than leaving an impossible build on screen.

Controls: **click** a node to learn its next level, **right-click** to refund,
**Backspace** refunds the focused node, and the side panel has explicit Learn/Refund
buttons for touch.

## Layout

The board fits the window rather than scrolling. Columns are remapped into the
space available — keeping the game's relative spacing, with a floor on the gap
between neighbours — instead of zooming the whole board, which would drag the
labels below a readable size. Nothing on the page is set under 12px. The
Ultimate Perks and Build overview sections are collapsible, so a short screen can
give the tree its height back.

## Layout

```
index.html                 markup and page chrome
assets/styles.css          the dark skin
assets/app.js              planner logic — reads the JSON, renders from it
assets/icons.js            original inline SVG glyphs (no game assets) + mapping
data/perks.json            the perk registry — single source of truth
data/abilities.json        the ability registry, generated from two saved pages
tools/verify_perks.py      checks both registries, and perks against a source page
tools/extract_abilities.py rebuilds data/abilities.json from saved ability pages
VERIFICATION.md            what was checked, and where the sources disagreed
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

For GitHub Pages: Settings → Pages → deploy from branch, root folder. No build step.

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
- `gate` is one of `none`, `manual`, `quest`, or `corruption <n>`.
- `unlocks` is the exact inverse of `prerequisites` across all three trees; the app
  builds its graph from `prerequisites` and treats `unlocks` as documentation.
- `active_time` (`ANYTIME`, `DAY ONLY`, `NIGHT ONLY`) may sit on a tree or on a
  single perk; a perk's own value wins.
- An ultimate may carry an `alias` when published lists disagree on its name; the
  planner shows it on the card.
- `requirement` on an ultimate may name more than one condition and all of them
  must hold. Witchcraft and Swordmastery read `"35 points in tree"`; Vampirism
  reads `"Corruption 15"` and has no point requirement.
- Top-level `source_overrides` records any field where the registry knowingly
  departs from the external source, with the reason.

**Assumption worth knowing:** skill points spent on abilities count toward the
tree total, and therefore toward the 35-point ultimate threshold on Witchcraft
and Swordmastery. Abilities sit on the same tree screen and the published rule
says "35 skill points in a tree", so this is the natural reading — but no source
states it outright and no screenshot pins it down. It is one line in `app.js`
(`spent()`) if it turns out otherwise.

Integrity checks that hold for the committed data: every prerequisite and unlock
resolves to a real node, and every perk's `max_level` matches its number of `levels`
entries. Run them yourself with:

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
- Node positions and the prerequisite graph come from the skill screens alone — no
  published list records tree topology, so `tools/verify_perks.py` cannot check them.
- Icons here are original line art, not ripped assets, so they suggest each perk
  rather than reproduce it.
- Individual level costs are the likeliest thing to drift between game patches. If you
  spot a mismatch, fix `data/perks.json` and the page follows.
- Stinging Blade's level 4 cost is the one number still worth a second look; see
  VERIFICATION.md.
- Fan-made and unofficial. Not affiliated with Rebel Wolves.
