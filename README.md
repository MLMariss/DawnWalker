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
- **Point spending with real rules** — a perk level only becomes learnable when every
  prerequisite has at least one level, and refunding is blocked while a downstream
  perk still depends on it.
- **Gates enforced.** Vampiric levels respect their Corruption requirement (slider in
  the header, 0–15). Levels that need a Manual found in the world are gated behind the
  "Manuals found" toggle. The two padlocked story nodes — *Font of Life* and
  *Mandrake Ward* — are click-to-toggle and cost nothing.
- **Ultimates.** Three per tree, one selectable, unlocked at 35 points spent in that
  tree (Witchcraft, Swordmastery) or Corruption 15 (Vampirism).
- **Running totals** for skill points, time segments and manuals across all trees.
- **Shareable builds.** The URL hash carries the whole build; "Copy build link" puts
  it on the clipboard. Lowering Corruption or switching Manuals off peels back any
  level that is no longer legal rather than leaving an impossible build on screen.

Controls: **click** a node to learn its next level, **right-click** to refund,
**Backspace** refunds the focused node, and the side panel has explicit Learn/Refund
buttons for touch.

## Layout

```
index.html            markup and page chrome
assets/styles.css     the dark skin
assets/app.js         planner logic — reads the JSON, renders everything from it
assets/icons.js       original inline SVG glyphs (no game assets) + node mapping
data/perks.json       the perk registry — single source of truth
tools/verify_perks.py cross-checks the registry against a published perk list
VERIFICATION.md       what was checked, and where the sources disagreed
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
- An ultimate may carry an `alias` when published lists disagree on its name; the
  planner shows it on the card.
- `requirement` on an ultimate may name more than one condition — Vampirism reads
  `"35 points in tree, Corruption 15"` — and all of them must hold.
- Top-level `source_overrides` records any field where the registry knowingly
  departs from the external source, with the reason.

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
