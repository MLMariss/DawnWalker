# Data verification

`data/perks.json` was cross-checked against two independently published perk
lists. This note records what was checked, what agreed, and the three places the
sources disagreed with each other.

Re-run the check at any time:

```sh
python3 tools/verify_perks.py                    # internal consistency only
python3 tools/verify_perks.py path/to/game8.html # plus the external source
```

Save the Game8 page with Ctrl+S ("Web Page, complete") to produce that file. The
script exits non-zero on any undocumented difference.

## Sources

| Source | What it carries | Verdict |
| --- | --- | --- |
| Game8, *All Perks List* | Every perk, every level, with skill point, time segment, manual and corruption costs in structured tables | Primary external check — machine-readable and internally consistent |
| Fextralife, *Perks* | Perk names and one-line summaries; no costs | Useful for names only; its tree categorisation has errors (see below) |
| In-game skill screens | Node positions, prerequisite links, level counts | The only source for the tree graph |

The saved pages are not committed — they are third-party page dumps of some
size, and the script reads whatever copy you have locally.

## Result

All 54 perks and 9 ultimates agree with the Game8 tables on:

- level counts per perk,
- skill point cost per level,
- time segment cost per level,
- which levels are gated behind a Manual,
- which levels are gated behind a Corruption level, and which level,
- ultimate costs (4 skill points, 2 time segments) and the 35-point tree
  requirement,
- every number appearing in each level's effect text.

Internal checks also pass: every prerequisite resolves to a real node in the same
tree, `unlocks` is the exact inverse of `prerequisites` everywhere, and each
perk's `max_level` matches its number of level entries.

**Not verifiable from these sources:** node positions and the prerequisite graph.
Neither published list records tree topology, so those fields still rest on the
in-game skill screens alone.

## Where the sources disagreed

**1. Endless Effort, level 4 — resolved in favour of the game.**
Game8 lists 1 skill point. The in-game skill screen shows 2. Every other
four-level perk ends at 2, including Omniblock in the same Game8 table, so this
reads as a transcription slip. The registry carries 2, recorded in
`source_overrides` so the verify script reports it as a documented deviation
rather than an error.

**2. Stinging Blade, level 4 — left as the source has it.**
The only other four-level perk Game8 gives a 1-skill-point final level. It fits
the same suspicious pattern, but no screenshot covers it, so it stays at 1.
Worth re-checking against the game if you have the perk open.

**3. The Witchcraft ultimate has two names.**
Game8 calls it **Arcane Cascade**; Fextralife calls it **Aether Cascade**. The
effect text is identical in both. The registry uses Arcane Cascade with
`"alias": "Aether Cascade"`, and the planner shows the alias on the card.
Fextralife is the weaker source here: its Witchcraft section also files Fate's
Favour and Nourishing Blood under Witchcraft (they are Swordmastery and
Vampirism perks), and omits Herbal Remedies I and Witchcraft Mastery entirely.

## Correction: Vampirism ultimates are gated by Corruption alone

An earlier pass read "unlocking an ultimate takes 35 skill points spent in the
tree" as applying to all three trees, and made Vampirism require both that and
Corruption 15. **That was wrong.** The in-game Vampirism skill screen shows no
"Spend to unlock: N/35" counter at all, where Swordmastery and Witchcraft both
do (7/35 and 0/35 in the screens checked). A guide search agrees: the Vampirism
ultimates unlock at Corruption 15, full stop.

The registry and the planner now gate Vampirism ultimates on Corruption 15 only.
The multi-condition `requirement` format stays — it costs nothing and the parser
is more honest about what a requirement string can say — but no tree uses two
conditions today.

## Patch currency

Checked on 11 September 2026 against the game's patch history: Hotfix 1.0.2
(3 Sep), 1.0.3 and 1.0.4 (9 Sep) are quest, stability, save and input fixes.
None of them touches perks, skill trees, skill point costs or corruption, so
the values here are current as of the latest build.

Two caveats on that check. The sandbox this ran in cannot reach `game8.co` or
`bloodofdawnwalker.wiki.fextralife.com` directly — its egress proxy blocks both
— so the per-perk pages could not be re-fetched live; the structured comparison
still runs against the saved copy of the Game8 page. And no source found
publishes a second independent per-level cost table, so Endless Effort and
Stinging Blade (below) rest where they are.

## Day and night

The skill screens label each perk with when it works. Swordmastery reads
ANYTIME throughout and Vampirism NIGHT ONLY throughout, so those are recorded
per tree. Witchcraft is mixed — Unholy Fervour reads DAY ONLY, and one published
description calls the tree "a mix of perks that can only be used during the day
and at both time periods" — so only the perk actually seen on a screen carries a
value, and the rest show nothing rather than a guess.

## Abilities

`data/abilities.json` is generated from two saved pages rather than hand-written:
Game8's *All Abilities List* for the upgrade levels and their costs, and the
Fextralife *Abilities* table for what each ability costs to use. Re-run
`tools/extract_abilities.py` against fresh saves to rebuild it.

27 abilities, 107 levels. **The two sources agree on every tree assignment**,
which is worth noting given that the same wiki misfiled two perks on its perk
page — its ability table is the better half of that site. Every ability has an
activation cost recorded.

Two typos in the Game8 ability text are corrected during extraction, listed by
the script each time it runs so the change is never silent:

| Ability | Source text | Corrected to | Why |
| --- | --- | --- | --- |
| Charge | `…everyone on your way. "` | `…everyone on your way.` | stray quote mark in the blurb |
| Shapeshift | `2 Gain Haste` | `Gain Haste` | stray leading digit in the level 1 text |

Abilities introduce one gate the perks do not have: `vrakhir blood`, a Phial of
Vrakhir Blood spent to learn certain Vampirism ability levels. The planner
treats it as a consumable to count rather than a lock to satisfy — it is an item
you can go and get, not a threshold you have to reach — and totals it beside the
manuals in the build overview.

**Not verifiable:** whether ability points count toward the 35-point ultimate
threshold. The planner assumes they do, and the README says so. Nothing found
states it either way.
