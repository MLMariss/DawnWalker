# -*- coding: utf-8 -*-
"""Author data/mechanics.json: the systems each node acts on, and how those
systems feed each other. Run from the repo root."""
import json, collections

S = collections.OrderedDict()
def sys(id, name, note):
    S[id] = {"name": name, "note": note}

sys("attack_speed",   "Attack speed",        "How fast swings come out.")
sys("attacks_landed", "Attacks landed",      "Hits put on a target per fight. The hinge of the melee loop: almost everything that rolls a chance rolls it per hit.")
sys("weapon_damage",  "Weapon damage",       "Damage from sword attacks.")
sys("claw_damage",    "Claw damage",         "Damage from claw attacks.")
sys("witchcraft_damage", "Witchcraft damage","Damage from Witchcraft abilities.")
sys("ability_damage", "Ability damage",      "Damage from active abilities generally.")
sys("damage_over_time", "Damage over time",  "Bleed and lingering damage effects.")
sys("damage_output",  "Damage output",       "Total damage dealt — where every damage line ends up.")
sys("crit_chance",    "Critical chance",     "The odds a given hit crits.")
sys("crit_events",    "Critical hits landed","How many criticals actually happen. Chance times hits, not chance alone.")
sys("crit_damage",    "Critical damage",     "How hard a critical lands once it does.")
sys("stamina_pool",   "Stamina pool",        "Maximum stamina.")
sys("stamina_economy","Stamina economy",     "Stamina actually available to spend — costs cut and stamina returned.")
sys("charges",        "Activation charges",  "The pool and regeneration of activation charges abilities are paid for with.")
sys("cooldown_reduction", "Cooldown reduction", "How quickly abilities come back.")
sys("ability_uptime", "Ability uptime",      "How often an ability is actually available and cast.")
sys("ability_duration", "Ability duration",  "How long an active effect stays up.")
sys("ability_slots",  "Ability slots",       "How many abilities can be equipped at once. Passive abilities only work while slotted.")
sys("ability_health_cost", "Ability health cost", "The health price of casting — lower is better.")
sys("health_pool",    "Health pool",         "Maximum health and health segments.")
sys("health_regen",   "Health regeneration", "Health coming back.")
sys("health_percent", "Health percentage",   "How full the bar is. Two Vampirism abilities scale their damage off this directly.")
sys("blood_restore",  "Blood restoration",   "How much is gained from drinking blood.")
sys("armour",         "Armour",              "Damage reduction from armour.")
sys("perfect_block",  "Perfect block",       "Blocking on the beat. Swordmastery's whole economy hangs off it.")
sys("dodge",          "Dodging",             "Evasion, and the last-moment dodge window.")
sys("enemy_weakened", "Enemy weakened",      "Debuffs that make a target deal less and take more.")
sys("stun",           "Stun and control",    "Enemies stopped from acting.")
sys("kills",          "Kills",               "Enemies actually dying — several effects trigger only here.")
sys("survivability",  "Survivability",       "Staying alive. The precondition for every other system.")
sys("corruption_rate","Corruption rate",     "How fast Corruption fills.")
sys("corruption_level","Corruption level",   "The Corruption threshold reached. Gates Vampirism levels and all three Vampirism ultimates at 15.")
sys("consumables",    "Consumables",         "Potions, food and buffs in hand.")
sys("crafting",       "Crafting",            "Making and gathering what consumables are built from.")
sys("carry_weight",   "Carry weight",        "How much can be hauled.")
sys("economy",        "Trade and coin",      "Prices, stock and what loot is worth.")
sys("haste",          "Haste",               "Moving faster than the world around you.")
sys("exploration",    "Exploration",         "Reaching, reading and opening things in the world.")

E = []
def edge(a, b, strength, why):
    """strength grades how firmly the link holds, and it is what colours the
    planner's synergy rows:

      strong   — the mechanic itself ("critical chance is rolled per hit"), or
                 a rule several separate perks attest to independently.
      moderate — real and load-bearing, but conditional. In particular, an edge
                 that exists only because ONE named perk provides it is moderate,
                 however plainly that perk states it: the link holds only for a
                 build that actually took the perk. "Ability uptime raises weapon
                 damage" is true of anyone carrying Adrenaline Rush and of nobody
                 else.
      weak     — true in the abstract and nearly useless as advice. Generic,
                 or far enough downstream that calling it synergy oversells it.
    """
    assert strength in ("strong", "moderate", "weak"), strength
    E.append({"from": a, "to": b, "strength": strength, "why": why})

# --- the melee loop -------------------------------------------------------
edge("attack_speed", "attacks_landed", "strong",
     "Faster swings land more attacks in the same window.")
edge("stamina_pool", "stamina_economy", "strong",
     "A bigger pool is more actions before you run dry.")
edge("stamina_economy", "attacks_landed", "moderate",
     "Cheaper actions mean more swings per fight - but only while stamina is what is actually stopping you.")
edge("stun", "attacks_landed", "moderate",
     "A stunned enemy is a free window to swing into, for as long as the stun lasts.")
edge("attacks_landed", "crit_events", "strong",
     "Critical chance is rolled per hit, so more hits mean more criticals at the same chance.")
edge("crit_chance", "crit_events", "strong",
     "A better roll on every hit.")
edge("crit_events", "crit_damage", "strong",
     "Critical damage only ever applies on a critical.")

# --- criticals are the engine room ---------------------------------------
edge("crit_events", "cooldown_reduction", "strong",
     "Aether Flow, Restless Blade and Endless Ferocity each say 'on critical hit' in their own level text - criticals are cooldown.")
edge("crit_events", "damage_output", "strong",
     "A critical is the biggest single hit most builds land.")
edge("crit_damage", "damage_output", "strong",
     "Harder criticals, more damage.")

# --- damage collects, and killing pays out -------------------------------
edge("weapon_damage", "damage_output", "strong", "Sword damage is damage dealt.")
edge("claw_damage", "damage_output", "strong", "Claw damage is damage dealt.")
edge("witchcraft_damage", "damage_output", "strong", "Witchcraft damage is damage dealt.")
edge("ability_damage", "damage_output", "strong", "Ability damage is damage dealt.")
edge("damage_over_time", "damage_output", "moderate",
     "Lingering damage adds up, though it needs the target to live long enough to tick.")
edge("enemy_weakened", "damage_output", "strong",
     "A weakened target takes more from everything.")
edge("damage_output", "kills", "moderate",
     "Damage is how enemies die, but this is the broadest link in the graph - nearly every offensive perk runs through it.")
edge("kills", "cooldown_reduction", "moderate",
     "Sword Sage resets every active cooldown on a kill.")
edge("kills", "stamina_economy", "moderate",
     "Fleet of Foot regenerates stamina on a kill - its last level only.")
edge("kills", "claw_damage", "moderate",
     "Lethal Crescendo stacks +20% claw damage per kill.")
edge("kills", "health_regen", "moderate",
     "Frugal Witchcraft refunds the health a killing cast cost - Witchcraft kills only.")

# --- the ability loop ----------------------------------------------------
edge("cooldown_reduction", "ability_uptime", "strong",
     "A shorter cooldown is an ability ready sooner.")
edge("charges", "ability_uptime", "strong",
     "Abilities are paid for in charges; more charges, more casts.")
edge("ability_health_cost", "ability_uptime", "moderate",
     "A lower health price is a cast you can afford to repeat, where health is the binding cost.")
edge("ability_slots", "ability_uptime", "strong",
     "More slots is more abilities ready at once - and passive abilities only work while slotted.")
edge("ability_duration", "ability_uptime", "moderate",
     "An effect still running is one you do not have to recast.")
edge("ability_uptime", "ability_damage", "strong",
     "Damage an ability never gets cast for is damage you do not deal.")
edge("ability_uptime", "damage_output", "moderate",
     "More casts, more damage - true of every ability at once, so it says little about any one of them.")
edge("ability_uptime", "weapon_damage", "moderate",
     "Adrenaline Rush raises attack damage after every ability used.")
edge("ability_uptime", "health_regen", "moderate",
     "Unholy Vitality regenerates health after every ability used.")
edge("ability_uptime", "armour", "moderate",
     "Unnatural Resilience grants armour for as long as a Witchcraft ability is running.")

# --- blocking and dodging pay into everything ----------------------------
edge("perfect_block", "stamina_economy", "strong",
     "Perfect Block gives stamina back on the beat.")
edge("perfect_block", "charges", "strong",
     "Perfect Block and Walking Fortress both return activation charge.")
edge("perfect_block", "attack_speed", "moderate",
     "Swiftness boosts attack speed after a perfect block.")
edge("perfect_block", "crit_events", "moderate",
     "Perfect Riposte turns a perfect block into a critical strike.")
edge("perfect_block", "enemy_weakened", "moderate",
     "Sharp Eye weakens the enemy on a perfect block.")
edge("perfect_block", "weapon_damage", "moderate",
     "Counterattack hits harder straight after a perfect block.")
edge("perfect_block", "survivability", "strong",
     "A blocked hit is a hit you did not take.")
edge("dodge", "crit_events", "moderate",
     "Perfect Riposte fires after a perfect dodge too - at its third level.")
edge("dodge", "charges", "moderate",
     "Fleet of Foot returns activation charge on a last-moment dodge - at its second level.")
edge("dodge", "survivability", "strong",
     "A dodged hit is a hit you did not take.")

# --- staying alive, and health as a damage stat --------------------------
edge("armour", "survivability", "strong", "Less damage taken per hit.")
edge("health_pool", "survivability", "strong", "More to lose before it matters.")
edge("health_pool", "health_percent", "moderate",
     "A bigger bar holds a high percentage longer, though the percentage is what is read, not the size.")
edge("health_regen", "health_percent", "strong",
     "Regeneration is what pushes the bar back up.")
edge("health_regen", "survivability", "strong",
     "Health coming back is health you can spend again.")
edge("blood_restore", "health_regen", "strong",
     "Drinking is the main way vampiric health returns.")
edge("health_percent", "ability_damage", "strong",
     "Crimson Rush and Shred scale ability damage with how full your health is.")
edge("ability_health_cost", "survivability", "moderate",
     "Every cast you do not pay for in health is health kept.")
edge("enemy_weakened", "survivability", "moderate",
     "A weakened enemy deals less, for as long as the debuff holds.")

# --- corruption ----------------------------------------------------------
edge("corruption_rate", "corruption_level", "strong",
     "Filling faster reaches the thresholds sooner.")
edge("corruption_level", "health_pool", "moderate",
     "Hastened Corruption's last level grants +5% vampiric health per Corruption level.")

# --- the support economy -------------------------------------------------
edge("crafting", "consumables", "strong",
     "What you gather and craft is what you carry.")
edge("economy", "consumables", "moderate",
     "Better prices and stock mean more in the pack, if you spend the coin on them.")
edge("carry_weight", "economy", "weak",
     "Loot you can carry out is loot you can sell. True, and a long way from a build decision.")
edge("consumables", "health_regen", "moderate",
     "Herbal Remedies II heals off every consumable used.")
edge("consumables", "survivability", "moderate",
     "A potion in a quickslot is a fight you do not lose.")
edge("consumables", "damage_output", "weak",
     "Blood and food buffs raise attack damage, but any build can eat - this is not a synergy between two perks.")

# node_id -> what it raises, and what raises it
N = {}
def node(nid, name, provides, scales_with, note=None, feedback=None):
    """`feedback` names systems this node both provides and is paid by — a real
    loop, not a modelling slip. A node is never scored against itself, so the
    list changes nothing in the planner; it is there so the check for an
    accidental self-synergy can tell a deliberate loop from a mistake, and it
    must be explained in `note`."""
    rec = {"name": name, "provides": provides, "scales_with": scales_with}
    if note: rec["note"] = note
    if feedback: rec["feedback"] = feedback
    N[nid] = rec

# ---- Witchcraft perks
node("W1",  "Forager",               ["crafting"], [])
node("W2",  "Bewitching Influence",  ["economy"], ["carry_weight"])
node("W3",  "Unnatural Resilience",  ["armour"], ["ability_uptime", "ability_duration", "ability_slots"],
     "Armour only while a Witchcraft ability is running, so it is worth exactly as much as your uptime.")
node("W4",  "Witchcraft Mastery",    ["witchcraft_damage"], ["ability_uptime"])
node("W5",  "Herbal Remedies I",     ["consumables"], ["crafting"])
node("W6",  "Medicus I",             ["consumables"], ["crafting"])
node("W7",  "Forbidden Sigils",      ["ability_slots"], ["charges"])
node("W8",  "Lasting Malediction",   ["ability_duration"], ["ability_uptime"])
node("W9",  "Frugal Witchcraft",     ["health_regen", "ability_health_cost"], ["kills", "witchcraft_damage", "ability_uptime"],
     "Pays out only on a kill made with a Witchcraft ability — it wants damage and uptime, not just casts.")
node("W10", "Amalgam",               ["consumables"], ["crafting"])
node("W11", "Aether Flow",           ["cooldown_reduction"], ["crit_events"],
     "Level 3 converts critical hits into cooldown, so it scales with how often you crit.")
node("W12", "Evil Eye",              ["crit_chance"], ["ability_uptime"])
node("W13", "Font of Life",          ["health_regen"], [])
node("W14", "Herbal Remedies II",    ["health_regen"], ["consumables", "crafting"])
node("W15", "Medicus II",            ["crafting"], [])
node("W16", "Blasphemous Echo",      ["witchcraft_damage"], ["ability_uptime", "ability_slots", "ability_duration"],
     "Scales with enemies currently affected, so it wants several effects up at once.")
node("W17", "Potent Blood",          ["ability_health_cost"], ["ability_uptime"])
node("W18", "Unholy Fervour",        ["charges"], ["ability_uptime"])

# ---- Swordmastery perks
node("S1",  "Omniblock",             ["stamina_economy", "perfect_block"], ["stamina_pool"])
node("S2",  "Stinging Blade",        ["weapon_damage"], ["attacks_landed"])
node("S3",  "Endless Effort",        ["stamina_pool"], [])
node("S4",  "Vigour",                ["health_pool"], [])
node("S5",  "Perfect Riposte",       ["crit_events", "weapon_damage"], ["perfect_block", "dodge", "crit_damage"])
node("S6",  "Perfect Block",         ["stamina_economy", "charges"], ["perfect_block"])
node("S7",  "Fate’s Favour",    ["crit_chance", "crit_damage"], ["attacks_landed", "attack_speed"])
node("S8",  "Fleet of Foot",         ["stamina_economy", "charges", "dodge"], ["kills"])
node("S9",  "Pack Mule",             ["carry_weight"], [])
node("S10", "Sustained Focus",       ["charges"], [])
node("S11", "Second Skin I",         ["armour", "stamina_economy"], [])
node("S12", "Counterattack",         ["weapon_damage", "damage_over_time"], ["perfect_block"])
node("S13", "Precision",             ["weapon_damage", "stamina_economy"], ["attacks_landed"])
node("S14", "Master Fencer",         ["ability_slots"], ["charges"])
node("S15", "Renewed Focus",         ["charges"], ["attacks_landed"],
     "Level 3 restores charge from attacks, so it turns attack throughput into casts.")
node("S16", "Sharp Eye",             ["enemy_weakened"], ["perfect_block"])
node("S17", "Growing Momentum",      ["weapon_damage", "stamina_economy"], ["attacks_landed", "attack_speed"],
     "Stacks per attack and resets when you take damage — it wants speed and it wants you untouched.")
node("S18", "Restless Blade",        ["cooldown_reduction"], ["crit_events"],
     "Level 3 is -50% cooldowns on a critical hit, the strongest crit-to-cooldown conversion in the game.")
node("S19", "Second Skin II",        ["armour", "stamina_economy"], [])

# ---- Vampirism perks
node("V1",  "Nourishing Blood",      ["blood_restore", "health_regen"], [])
node("V2",  "Endless Hunger",        ["health_pool"], [])
node("V3",  "Shadow Dweller",        ["stamina_economy"], [])
node("V4",  "Razorsharp Claws",      ["claw_damage", "charges"], ["attacks_landed", "attack_speed"],
     "Level 4 turns claw attacks into activation charge, so throughput feeds the ability loop.")
node("V5",  "Vrakhiri Might",        ["ability_slots"], ["charges"])
node("V6",  "Crimson Feast",         ["weapon_damage", "armour", "crit_chance"], ["blood_restore"])
node("V7",  "Wild Blood",            ["charges"], ["blood_restore"])
node("V8",  "Dimension Reach",       ["stamina_economy"], [])
node("V9",  "Restless Claws",        ["stamina_economy"], ["perfect_block", "attacks_landed"])
node("V10", "Lasting Blood",         ["ability_health_cost"], ["ability_uptime"])
node("V11", "Hastened Corruption",   ["corruption_rate", "health_pool"], ["blood_restore"])
node("V12", "Closing Wounds",        ["health_regen"], ["health_pool"])
node("V13", "Mandrake Ward",         ["survivability", "health_regen"], [])
node("V14", "Clawpierce",            ["crit_chance", "crit_damage"], ["attacks_landed", "attack_speed"])
node("V15", "Endless Ferocity",      ["cooldown_reduction"], ["crit_events"])
node("V16", "Blood Theft",           ["health_regen"], ["attacks_landed", "attack_speed"])
node("V17", "Dancing Claws",         ["crit_chance"], ["attacks_landed", "attack_speed"],
     "Builds per attack and resets on a crit or on damage taken — pure throughput scaling.")

# ---- Witchcraft abilities
node("AW1",  "Astral Communion",   ["exploration"], [])
node("AW2",  "Burning Blood",      ["damage_over_time"], ["witchcraft_damage", "ability_uptime", "ability_duration", "charges", "ability_health_cost"])
node("AW3",  "Compel Soul",        ["exploration"], [])
node("AW4",  "Cycle of Ruin",      ["ability_duration"], ["attacks_landed", "attack_speed", "perfect_block"],
     "Extends running effects on every landed attack, block and perfect block — duration bought with throughput.")
node("AW5",  "Life Lock",          ["survivability", "damage_output"], ["ability_uptime", "ability_duration"])
node("AW6",  "Mercurial Fervour",  ["haste", "exploration"], [])
node("AW7",  "Ravenous Flock",     ["stun", "ability_damage"], ["witchcraft_damage", "charges", "ability_uptime"])
node("AW8",  "Soul Reaping",       ["health_regen", "damage_over_time"], ["witchcraft_damage", "ability_uptime", "ability_duration"])
node("AW9",  "Soul Stigma",        ["crit_chance", "crit_damage"], ["ability_uptime", "ability_duration", "attacks_landed"],
     "Puts crit chance and crit damage on a target, so its worth is whatever you swing into that target.")
node("AW10", "Unholy Vitality",    ["health_regen"], ["ability_uptime", "cooldown_reduction", "charges", "ability_slots"])

# ---- Swordmastery abilities
node("AS1", "Adrenaline Rush",   ["weapon_damage"], ["ability_uptime", "cooldown_reduction", "charges", "ability_slots"])
node("AS2", "Artery Strike",     ["crit_events", "ability_damage"], ["crit_damage", "weapon_damage", "charges", "ability_uptime"])
node("AS3", "Broad Swing",        ["ability_damage"], ["weapon_damage", "charges", "ability_uptime"])
node("AS4", "Charge",            ["stun", "ability_damage"], ["weapon_damage", "charges", "ability_uptime"])
node("AS5", "Dirty Trick",       ["stun", "enemy_weakened"], ["charges", "ability_uptime"])
node("AS6", "Swiftness",         ["attack_speed"], ["perfect_block", "ability_slots"],
     "The one source of attack speed in the game, and it is paid for with perfect blocks.")
node("AS7", "Walking Fortress",  ["charges"], ["perfect_block", "ability_slots"])

# ---- Vampirism abilities
node("AV1",  "Blood Surge",       ["ability_damage"], ["charges", "ability_uptime", "ability_health_cost", "health_percent"])
node("AV2",  "Crimson Rush",      ["ability_damage"], ["health_percent", "health_pool", "health_regen", "ability_slots"])
node("AV3",  "Death From Above",  ["kills"], ["ability_slots"])
node("AV4",  "Mesmerise",         ["survivability", "damage_output"], ["charges", "ability_uptime", "ability_health_cost"])
node("AV5",  "Piercing Shriek",   ["stun", "enemy_weakened"], ["charges", "ability_uptime", "perfect_block"])
node("AV6",  "Scarlet Shield",    ["health_regen", "perfect_block"], ["perfect_block", "ability_slots"],
     "Heals off perfect blocks, and at level 4 turns 25% of any block into one — the only source of perfect blocks outside Omniblock.",
     feedback=["perfect_block"])
node("AV7",  "Shadowstorm",      ["attacks_landed", "survivability"], ["charges", "ability_uptime"])
node("AV8",  "Shapeshift",        ["haste", "exploration"], [])
node("AV9",  "Shred",             ["ability_damage"], ["health_percent", "health_pool", "health_regen", "ability_slots"])
node("AV10", "Voracious Bite",    ["health_regen", "cooldown_reduction"], ["blood_restore", "charges", "ability_uptime"],
     "Sanguine Renewal makes this reset every active cooldown, which is why it carries cooldown reduction.")

# ---- Ultimates (synthetic ids: U<tree key><index from 1>)
node("Uwc1", "Aether Cascade",    ["witchcraft_damage"], ["ability_uptime", "ability_slots", "charges"],
     "Stacks +20% per ability used, so it is worth whatever your cast rate is.")
node("Uwc2", "Entwined Torment",  ["ability_damage"], ["witchcraft_damage", "ability_uptime"])
node("Uwc3", "Runic Bulwark",     ["enemy_weakened"], ["perfect_block"])
node("Usm1", "Last Stand",        ["weapon_damage"], ["survivability", "health_pool"],
     "Only fires below 30% health — it wants enough health pool to survive being there.")
node("Usm2", "Sword Sage",        ["cooldown_reduction"], ["kills", "damage_output"],
     "Kills reset every cooldown, which makes killing speed the whole ability economy.")
node("Usm3", "Tactical Mastery",  ["charges"], ["ability_uptime"])
node("Uvp1", "Lethal Crescendo",  ["claw_damage"], ["kills"])
node("Uvp2", "Renounce Death",    ["survivability", "health_regen"], [])
node("Uvp3", "Sanguine Renewal",  ["cooldown_reduction"], ["charges", "ability_uptime"],
     "Runs through Voracious Bite, so it needs the charge to keep biting.")

# --- breadth ---------------------------------------------------------------
# How generic a synergy claim is depends on where the two nodes meet. If 27
# different perks can drive ability uptime and 29 read it, "this feeds that"
# through uptime is true of hundreds of pairs and says almost nothing. Count
# the pairs that actually meet at each system and mark the hubs, so the planner
# can price a meeting there accordingly. Derived, not hand-picked — the numbers
# move with the graph, and tools/verify_perks.py recomputes them.
# Impact is a multiplier, not a distance. A link passes on only part of the
# effect, and a chain multiplies: two strong links carry 0.9 x 0.9 = 81% of what
# the first perk put in. Meeting at a hub is worth less again, because a claim
# true of hundreds of pairs is a generic one.
TRANSMISSION = {"strong": 0.9, "moderate": 0.75, "weak": 0.5}
HUB_FACTOR = 0.6
HOP_LIMIT = 2
HUB_PAIRS = 150
# Below 50% nothing is shown at all: a fifth of an effect is not a synergy.
BANDS = {"green": 100, "yellow": 75, "red": 50}


def _reach(starts, out_adj, in_adj, direction):
    """Best-carrying route to each system, keeping the highest product rather
    than the fewest hops — three firm links beat one vague one."""
    best = {s: {"carry": 1.0, "dist": 0} for s in starts}
    for hop in range(HOP_LIMIT):
        for cur in list(best):
            rec = best[cur]
            if rec["dist"] != hop:
                continue
            for e in (out_adj if direction == "out" else in_adj).get(cur, []):
                nxt = e["to"] if direction == "out" else e["from"]
                carry = rec["carry"] * TRANSMISSION[e["strength"]]
                if nxt in best and best[nxt]["carry"] >= carry:
                    continue
                best[nxt] = {"carry": carry, "dist": rec["dist"] + 1}
    return best


def annotate_breadth(systems, edges, nodes):
    out_adj, in_adj = {}, {}
    for e in edges:
        out_adj.setdefault(e["from"], []).append(e)
        in_adj.setdefault(e["to"], []).append(e)
    reachers = collections.Counter()
    readers = collections.Counter()
    for rec in nodes.values():
        for s in _reach(rec["provides"], out_adj, in_adj, "out"):
            reachers[s] += 1
        for s in rec["scales_with"]:
            readers[s] += 1
    for sid, rec in systems.items():
        pairs = reachers[sid] * readers[sid]
        rec["meeting_pairs"] = pairs
        rec["breadth"] = "hub" if pairs >= HUB_PAIRS else "normal"
    return systems


out = collections.OrderedDict()
out["game"] = "The Blood of Dawnwalker"
out["subject"] = "Mechanical synergy graph"
out["notes"] = [
    "This file is an interpretation, not a transcription. Perk and ability costs come from published tables; the causal links here are read off the effect text in data/perks.json and data/abilities.json.",
    "`systems` are the things a build can act on. `edges` are directed: from A to B means more A produces more B, `why` names the perk or mechanic that makes it true, and `strength` grades how firmly it holds.",
    "Each system carries `meeting_pairs` (how many node pairs can meet there) and `breadth`. A system at or above 150 pairs is a `hub`: ability uptime, activation charges and attacks landed. Meeting at a hub is priced +4, because a claim true of hundreds of pairs is a generic one. Both fields are derived from the graph, not hand-picked, and verify_perks.py recomputes them.",
    "Edge `strength` is strong (a perk says so in its own effect text, or it is the mechanic itself), moderate (real but conditional on build, level or state), or weak (true in the abstract and nearly useless as advice).",
    "Impact is a multiplier held in `scoring`. Each link passes on part of the effect - strong 0.9, moderate 0.75, weak 0.5 - and a chain multiplies, so two strong links carry 81%. Meeting at a hub system multiplies by a further 0.6. The result is a percentage: 100 is green, 75 and up amber, 50 and up red, and anything under 50 is not shown at all rather than drawn as a synergy nobody should act on.",
    "Green is therefore reserved for a direct meeting on a non-hub system - this node provides exactly what that node is paid by, with nothing in between.",
    "Each node declares `provides` (systems it raises) and `scales_with` (systems that make it worth more). Synergy is provides meeting scales_with, directly or along a chain of edges.",
    "Edges are deliberately specific. 'Both mention stamina' is not a synergy; 'cheaper blocks mean more attacks, which means more critical rolls, which means shorter cooldowns' is.",
    "The graph contains cycles on purpose - criticals cut cooldowns, cooldowns raise uptime, uptime raises damage, damage kills, kills cut cooldowns. Readers must bound their own traversal depth; the planner walks two hops.",
    "Edges are kept specific enough to mean something. 'Staying alive lets you keep attacking' is true of every defensive perk and every offensive one, so it is deliberately not an edge - it would link the whole graph to itself and make the marks worthless.",
    "Ultimates have no node_id in the perk registry; they are keyed here as U<tree key><index from 1>.",
]
out["scoring"] = {
    "transmission": TRANSMISSION,
    "hub_factor": HUB_FACTOR,
    "hop_limit": HOP_LIMIT,
    "hub_pairs": HUB_PAIRS,
    "bands": BANDS,
}
out["systems"] = annotate_breadth(S, E, N)
out["edges"] = E
out["nodes"] = N

with open("data/mechanics.json", "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("systems %d, edges %d, nodes %d" % (len(S), len(E), len(N)))
