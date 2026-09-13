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
| In-game skill screens | Titles, every line of effect text, per-level costs and gates, cooldowns, activation charge and health costs, the ANYTIME/DAY ONLY/NIGHT ONLY banner, node positions, prerequisite links and level counts | **Primary.** The game is the authority; the registry is transcribed from it |
| Game8, *All Perks List* | Every perk, every level, with skill point, time segment, manual and corruption costs in structured tables | Cross-check, and the fallback for a cost the game hides |
| Fextralife, *Perks* | Perk names and one-line summaries; no costs | Useful for names only; its tree categorisation has errors (see below) |

### The screenshot sweep

Captures of the skill screens are what the registry is transcribed from, and it
took **two passes**. The first covered every one of the 54 perks, 27 abilities
and 9 ultimates — but *screen* is not *row*: the ability panel's level list
scrolls, so 25 ability rows and 1 perk row were never reached and kept the Game8
table's text. An earlier draft of this note called that first pass "complete",
and the overclaim is what let those rows pass for the game's own text. A second
pass, scrolled to the bottom of every affected panel, closed the gap; what it
turned up is in *The second sweep* below.

Three things the screenshots settled that no published source carries:

- **Cooldowns.** Every active ability shows one. The registry had none.
- **`active_time`.** Per entity, not per tree: Witchcraft mixes ANYTIME and
  DAY ONLY, so it cannot be a tree-level field.
- **Per-level gates.** The book icon sits on individual level rows, so
  Witchcraft Mastery needs a manual for levels 3 and 4 only. This also turned
  up `road shrine`, a gate neither published source lists — it gates the
  entry perk of each branch, 15 perks in all.

Effect text is verbatim — `text_source` is `game` on every level row in both
registries — including the game's own typos (`Craft 2 Items items at once.`,
`Active Abilites`). They are kept as the game prints them.

Two limits worth knowing when reading the data:

- A level the capture's save had already bought shows **no cost** in game.
  Those costs are kept from the Game8 cross-check rather than guessed, and are
  listed in the transcription flags. Ownership itself is never recorded — it
  belongs to a save, not to the registry.
- Long level lists **scroll** in the panel, so a fourth level was often cut off
  on the first pass, and a row's last line sometimes clipped even when the row
  was captured. Both are closed — see *The second sweep* below for what the
  first pass got wrong and how the verify script now catches each shape.

The saved pages are not committed — they are third-party page dumps of some
size, and the script reads whatever copy you have locally.

## Result

Thirteen level costs disagree with the Game8 tables. Every one is recorded in
`source_overrides` in `data/perks.json` with the field and the reason; the
game wins. The largest is **Shapeshift**, which the game prices at one skill
point and no time segments per level against the table's 1/1/2/3 skill points
and 1/1/1/2 time segments. `time_segments` can now be 0, which the published
tables never show.

Three names were the source's rather than the game's, and are corrected with
the old name kept as an alias: **Arcane Cascade → Aether Cascade**,
**Broadswing → Broad Swing**, **Shadow Storm → Shadowstorm**.

Setting those aside, all 54 perks and 9 ultimates agree with the Game8 tables
on:

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

**Not cross-checkable — which is not the same as unverified.** Node positions and
the prerequisite graph come from the in-game skill screens, and no published list
records tree topology at all. So `verify_perks.py` has nothing to compare them
against; that is a limit on the script's reach, not a doubt about the data. The
screens are the game itself, read directly, and each node's identity was pinned
by matching its in-game icon against the named perk icon set. Where a published
list and a screen disagree, the screen wins — see Endless Effort below.

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

27 abilities, 108 levels. **The two sources agree on every tree assignment**,
which is worth noting given that the same wiki misfiled two perks on its perk
page — its ability table is the better half of that site. Every ability has an
activation cost recorded.

Three faults in the Game8 ability text are corrected during extraction, listed
by the script each time it runs so the change is never silent:

| Ability | Source text | Corrected to | Why |
| --- | --- | --- | --- |
| Charge | `…everyone on your way. "` | `…everyone on your way.` | stray quote mark in the blurb |
| Shapeshift | `2 Gain Haste` | `Gain Haste` | stray leading digit in the level 1 text |
| Scarlet Shield, level 4 | `Up to +40% Active Ability Damage` | the Perfect Block text the game prints | the source repeats Crimson Rush's level 4 line here |

The Scarlet Shield row is the one place a source line was not merely mistyped
but belonged to another ability altogether, so it is worth stating what the game
shows: *Restore 30% of Health Segment after Perfect Block. 30% chance to also
trigger after Directional Block and 25% chance after Omniblock. Attack after
Perfect Block heals you for 10% of dealt Damage. 25% chance for any Block to
become Perfect Block.* That last clause is the only source of Perfect Blocks
outside Omniblock, which is why the mechanics graph has Scarlet Shield providing
`perfect_block` as well as being paid by it. Scanning every ability for level
text duplicated across two different abilities turns up no other case.

Of the 27, **14 are active and 13 passive**. The split is read from `use_cost`
rather than from the blurb: anything that pays an activation charge or health is
active, and nothing else does. That agrees with the wiki's own wording wherever
it states it — Swordmastery's three passives come out as Adrenaline Rush,
Swiftness and Walking Fortress, which are exactly the three whose text says "this
Ability works passively once equipped". `verify_perks.py` re-derives `kind` on
every run, so the field cannot drift from the cost it was read from.

Worth knowing: passive does not mean free of slots. The same text says they work
"once equipped in the Active Ability panel", so passives compete with actives for
the slots that Forbidden Sigils, Master Fencer and Vrakhiri Might hand out.

### The second sweep: closing the Game8 gap

The first sweep captured the skill screens, but the ability panel's level list
**scrolls**, so on a four-level ability only the top rows fit. 25 ability rows
across 21 abilities and 1 perk row were never re-read and kept the Game8 table's
text. A second capture, scrolled to the bottom of every affected panel, closed
that gap. **Every level row in both registries now comes from the game** — 108
ability rows and 155 perk rows, with the two padlocked story nodes the only
non-transcribed entries.

Game8 was not merely incomplete. Across those 26 rows it dropped clauses, added
one that does not exist, got numbers wrong, and missed a level outright:

| | What Game8 had | What the game shows |
| --- | --- | --- |
| **Piercing Shriek** | 3 levels | **4** — a Corruption 13 level at 3 pts / 2 segs |
| **Piercing Shriek** Lv2 | +20 Damage, −15%, Block 10%, 25s | +20**%**, −**20%**, Block **15%**, **35s** |
| **Dirty Trick** Lv3–4 | "Stun ends after N hits" | "**Stuns in Area.** Ends after N hits" |
| **Soul Stigma** Lv4 | "**Area** +50% Critical Hit chance" | "+50% Critical Hit chance" — no area at all |
| **Charge** Lv4 | bleed-duration line absent | "+66% Bleed Duration." |
| **Walking Fortress** Lv4 | Restores **50%** of Activation Charge | Restores **25%** |
| **Swiftness** Lv4 | +**15%** Critical Hit chance | +**5%** |
| **Adrenaline Rush** Lv4 | "+150% Passive Activation Charge" | "+150% passive Activation Charge **Regeneration**" |
| **Unholy Vitality** Lv4 | "Regenerates 25% of Health over 10 seconds" | "Regenerates 25% Health." |
| **Voracious Bite** Lv4 | +25 Claw Damage | +25**%** Claw Damage |
| **Scarlet Shield** Lv4 | Corruption 14 | Corruption **13** |
| **Death From Above** Lv4 | 3 pts / 2 segs | **2 pts / 1 seg** |
| **Mesmerise** | no note | "Can't be used on Bosses." |

Soul Stigma is the one worth dwelling on: Game8 does not only drop clauses, it
**adds** them. Its Lv4 "Area" prefix has no counterpart in the game, so the
table had been promising an area effect that the ability never gains.

Death From Above's Lv4 is the only four-level ability in the game that does not
end at 3 points and 2 segments. That is read from the panel, not a typo.

#### One row the first sweep clipped

**Soul Stigma Lv3** was marked as read from the game and was still wrong: the
capture cut "Duration 30s." off the bottom of the row. Being transcribed is not
the same as being transcribed *whole*. `verify_perks.py` now flags a level that
states no Duration or Cooldown while the levels **both above and below** it do —
a first level lacking what later ones gain is ordinary progression, but a gap in
the middle is a clipped capture.

#### Damage figures, the level they belong to, and the growth model

Damage scales with the character. Splice a figure read at one level beside a
figure read at another and an upgrade reads as a *downgrade* — which is how this
was found, with Blood Surge running 320 → 400 → 480 → **311**.

The registry is anchored at **character level 20**, and a second capture at
**level 9** turns that anchor into a model. The ratio between the two levels is
measured on rows captured at both:

| Tree | Level 9 → 20 | Measured on | Growth per level |
| --- | --- | --- | --- |
| Vampirism | **131/62 = 2.112903** — exact | Blood Surge Lv1–4 (both figures) and Death From Above Lv3 — seven pairs, every one reducing to 131/62 | 10.1% of the level 9 figure |
| Witchcraft | 2.1227 | Burning Blood Lv2–4 | 10.2% |
| Swordmastery | 2.0000 | Dirty Trick Lv2 | 9.1% |

Vampirism is not an estimate. All seven pairs — 655/310, 786/372, 917/434,
2227/1054, 2620/1240, 3013/1426, 1834/868 — reduce to the same fraction, so the
underlying stat is an integer: **62 at level 9, 131 at level 20**.

To restate a figure at level L, with `hi` = 20 and `lo` = 9:

```
figure x (1 + (1/ratio - 1) x (hi - L) / (hi - lo))
```

Exact at both anchors, interpolation between them, extrapolation outside — and
the planner's card says which, with a **Level N** badge that turns red beyond
9–20. A slider in the header restates every figure live.

**Why linear rather than compounding.** Both models fit the two anchors exactly
and diverge by up to 6.7% midway, so the anchors alone cannot separate them. The
tie-breaker is the *first* capture, whose level was never recorded: solving for it
under each model gives

| Model | Witchcraft | Swordmastery | Vampirism | Spread |
| --- | --- | --- | --- | --- |
| **Linear** | 12.3 | **12.0** | 11.9 | 0.4 |
| Geometric | 13.2 | 12.8 | 12.7 | 0.5 |

Linear lands on an integer level in all three trees and Swordmastery to within
0.01. `scaling.model` records the choice, so a capture at a third known level can
overturn it by changing one field.

**That first capture was never one character level.** Its three trees imply 11.9,
12.0 and 12.3 — it straddled a level-up mid-session. That is why its ratios never
agreed with each other, and why the anchor moved to level 20.

#### The game truncates, and figures are a unit value times a character stat

Vampirism's ratios are exact because the underlying quantity is an integer. The
character's power reads **62 at level 9, 80 at the first capture, 131 at level
20**, and every displayed figure is a per-level unit value times that power:

| Ability | Unit values | At 62 | At 80 | At 131 |
| --- | --- | --- | --- | --- |
| Blood Surge, area | 4, 5, 6, 7 | 248, 310, 372, 434 | 320, 400, 480, 560 | 524, 655, 786, 917 |
| Blood Surge, bosses | 14, 17, 20, 23 | 868, 1054, 1240, 1426 | 1120, 1360, 1600, 1840 | 1834, 2227, 2620, 3013 |
| Death From Above | 13, 15, 17, 19 | 806, 930, 1054, 1178 | 1040, 1200, 1360, 1520 | 1703, 1965, 2227, 2489 |
| Voracious Bite | 2.8, 3.4, 4.0, 4.6 | 173, 210, 248, 285 | 224, 272, 320, 368 | 366, 445, 524, 602 |
| Shred Lv4 | 2 | 124 | 160 | 262 |

Every bolded value in those rows was read off a panel, and the model reproduces
all of them.

Voracious Bite settles the rounding question: 4.6 × 131 = 602.6 and the panel
reads **602**, not 603. **The game truncates.** So a stored figure `d` stands
for a true value in `[d, d+1)`, and restating it means carrying `d + 0.5` across
and truncating. That reproduces all 24 captured figures; rounding `d` instead
misses one (Voracious Bite Lv2 comes out 211 against the panel's 210).

#### The model has to keep fitting

`scaling.observations` stores what the level 9 panels showed, figure by figure.
`verify_perks.py` restates every `scales` entry down to level 9 and fails if it
does not come back to the captured number. **All 24 round-trip**, including
every figure the model derived rather than read — Dirty Trick Lv1 restates to
exactly 121, Death From Above to 806 and 930, Blood Surge Lv1 to 248, which is
what the clipped `2??` in that capture reads. Break a ratio and the check
reports it.

Three figures had no level 9 capture and were carrying ±1 from the first one.
All three now have one, and one of them was not ±1 at all:

| | Was | Now | |
| --- | --- | --- | --- |
| **Shred** Lv4 | 262 ± 1 | **262** | confirmed exact — 124/62 = 2, and 2 × 131 = 262 |
| **Voracious Bite** Lv1 | 367 | **366** | truncation, not rounding, of 2.8 × 131 = 366.8 |
| **Witchcraft Mastery** Lv2, Lv4 | 244 | **257** | was 13 low |

Witchcraft Mastery is the instructive one. Its old figure of 154 implies a ratio
of 154/121 against the level 9 panel, where Burning Blood in the *same* capture
implies 96/72 — so that perk was shot at a lower character level than the
abilities beside it. It is the sharpest evidence that the first capture was never
one character level, and the only figure in the registry the re-anchor moved by
more than two.

#### Re-reading a row

Capture an ability's **whole** level list from a **single save**, and **note the
character level** — scroll to the bottom, and check the last line of each row is
not cut off. A figure read at one level beside a figure read at another is the
fault above, not a fix; a figure whose level is unrecorded cannot be placed at
all, which is what went wrong the first time.

To sharpen the growth model, capture any ability with flat damage at a **third**
known character level and add it to `scaling.observations`. That settles linear
against geometric, which the two current anchors cannot.

### Story grants

Five abilities are given by the story rather than bought, and the planner charges
nothing for their first level: **Astral Communion**, **Burning Blood** and
**Compel Soul** (Witchcraft), **Dirty Trick** (Swordmastery) and **Voracious
Bite** (Vampirism). Together with *Font of Life* and *Mandrake Ward* — the two
padlocked perks — that is the whole set of things the planner treats as free.

Three of those five were identified from a screenshot of the in-game Abilities
panel rather than by reading names off it, because the icons are the game's and
the registry's are not. The panel showed four abilities: two with a filled first
pip and no Manual books, one with a filled first pip and books, and one with
books and nothing filled. The registry makes that unambiguous — **Astral
Communion and Compel Soul are the only two Witchcraft abilities with no Manual
gate on any level**, and **Burning Blood is the only one whose level 1 is ungated
while its upgrades are not**. The fourth, gated at level 1 and unlearned, is one
of the remaining seven and is not marked.

**Not verifiable.** Neither source table records which abilities the story hands
out, so there is nothing to cross-check the list against and no way to tell from
the data whether more exist. `verify_perks.py` checks only that `story_granted`
is a real boolean on an ability that has levels; the list itself rests on play.
If an ability turns out to be granted and is not flagged, it is one line in
`data/abilities.json`.

Abilities introduce one gate the perks do not have: `vrakhir blood`, a Phial of
Vrakhir Blood spent to learn certain Vampirism ability levels. The planner
treats it as a consumable to count rather than a lock to satisfy — it is an item
you can go and get, not a threshold you have to reach — and totals it beside the
manuals in the build overview.

## Ability points and the ultimate threshold

**Resolved: they do not count.** An earlier pass assumed ability points fed the
same "35 skill points in a tree" counter as perks, on the grounds that abilities
sit on the same tree screen. They do not. The counter reads perk spend alone, so
a tree full of learned abilities and no perks never unlocks its ultimate.

The planner keeps the two totals apart: `spent()` is what a tree actually costs
you, perks and abilities together, and is what the tab badges and the build
overview show; `perkSpent()` is what the ultimate gate reads. Refunding an
ability can therefore never cost you a selected ultimate, and the ability drawer
says so on its header rather than leaving it to be discovered.

## The mechanics graph

`data/mechanics.json` is a different kind of file from the other two, and it is
worth being blunt about that. The perk and ability registries are transcriptions
— every number in them was read off a screen or a published table and can be
checked against one. The mechanics graph is an **interpretation**: a reading of
what the effect text in those registries implies about how the systems drive
each other.

What *is* checked, by `tools/verify_perks.py` on every run:

- every node it maps is a real perk, ability or ultimate, and carries that
  node's registry name (so a rename in the registry cannot silently orphan it),
- every one of the 90 nodes has an entry — no perk is quietly left out,
- every system named in a `provides`, a `scales_with` or an edge is declared,
- no edge is a self-loop, a duplicate, or missing its `why`,
- no system is declared and then never used,
- no node both provides and scales with the same system, which would make it
  its own synergy partner — unless it names that system in `feedback` and says
  why in `note`. One node does: Scarlet Shield is paid by Perfect Block and, at
  level 4, makes them. The planner never scores a node against itself, so the
  declaration changes nothing it draws; it only separates a real loop from a
  modelling slip, and a `feedback` entry that is not actually an overlap is
  itself an error.

Also checked: every edge carries a `strength` of strong/moderate/weak, the
`scoring` block's transmission values fall strong > moderate > weak and its
bands fall green > yellow > red, and each system's derived `breadth` still
matches what the graph makes it — a stale hub declaration is an error, not a
silent drift.

What is **not** checked, because nothing published could check it: whether an
edge is true. `crit_events -> cooldown_reduction` is as solid as this file gets
— Aether Flow, Restless Blade and Endless Ferocity each say "on critical hit" in
their own level text. `consumables -> damage_output` is a judgement call. Each
edge carries a `why` naming the perk or mechanic behind it, so a reader can
disagree with a specific link rather than the whole idea.

One edge was written and then deliberately removed: `survivability ->
attacks_landed` ("a fight you are still standing in is a fight you are still
swinging in"). It is true, and it is useless — it links every defensive perk to
every offensive one and takes the median node from 26 partners to 33, which is
most of the board. Generality is the failure mode for this file, not error.

### Grading

Impact is a multiplier, not a distance. Each link passes on part of what went in
(strong 0.9, moderate 0.75, weak 0.5) and a chain multiplies; meeting at a hub
system multiplies by a further 0.6. 100% is green, 75% and up amber, 50% and up
red, and anything under 50% is not drawn at all. Green is therefore reserved for
a direct meeting on a non-hub system.

Two decisions in that scheme are worth defending:

**An edge that only one perk justifies is `moderate`, not `strong`.** Adrenaline
Rush plainly says it raises attack damage after an ability, which makes
`ability_uptime -> weapon_damage` real — but only for a build carrying Adrenaline
Rush. Grading it strong put Sustained Focus and Artery Strike at 81% on a chain
that most builds do not have. `strong` now means the mechanic itself, or a rule
several separate perks attest to independently — as `crit_events ->
cooldown_reduction` is, with Aether Flow, Restless Blade and Endless Ferocity
each saying it in their own text.

**Hub systems are measured, not chosen.** `meeting_pairs` counts how many node
pairs can meet at each system, and 150 is the hub line. Ability uptime scores
783 — 27 nodes can drive it and 29 read it, so "this feeds that through uptime"
describes hundreds of pairs and recommends nothing. Activation charges (180) and
attacks landed (216) are the others. The count is recomputed on every verify
run, so adding perks re-decides it rather than leaving a stale label.

The resulting spread over all 8,010 ordered pairs: 17% green, 37% amber, 46%
red, and 71% of pairs below the 50% line and never shown.

The graph is regenerated from `tools/build_mechanics.py`, so the data is
reviewable as code and a change to it shows up as a diff in one place.
