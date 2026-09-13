#!/usr/bin/env python3
"""Cross-check data/perks.json against a saved Game8 "All Perks List" page.

Game8 publishes every perk's levels with skill point, time segment, manual and
corruption requirements in a machine-readable table, which makes it a good
external check on the committed registry. Save the page (Ctrl+S, "Web Page,
complete") and point this script at the .html file:

    python3 tools/verify_perks.py "All Perks List _ The Blood of Dawnwalker.html"

It reports every difference in level count, skill point cost, time segment cost,
manual gate, corruption gate and the numbers inside each level's effect text,
and exits non-zero if anything differs. It also checks data/mechanics.json —
that every node it maps exists, every system it names is declared, and no edge
dangles.

Node positions and the prerequisite graph come from in-game skill screens and
appear in no published table, so there is nothing here to check them against.
They are read directly off the screens rather than inferred.

Requires: beautifulsoup4 and lxml, but only to read a source page. The internal
checks run without them.
"""
import json
import pathlib
import re
import sys
import unicodedata

def _soup():
    """Imported only when a source page is actually being parsed — the internal
    checks need no HTML parser, and should run in a bare checkout."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        sys.exit("beautifulsoup4 is required to read a source page: "
                 "pip install beautifulsoup4 lxml")
    return BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
TREES = ("Witchcraft", "Swordmastery", "Vampirism")
# Every table on the page is preceded by the same tree-navigation row.
NAV = {"witchcraftswordmasteryvampirism", "witchcraft", "swordmastery", "vampirism"}


def key(name):
    """Fold a perk name to a comparable key (curly quotes, case, punctuation)."""
    name = unicodedata.normalize("NFKD", name).replace("’", "'").replace("‘", "'")
    return re.sub(r"[^a-z0-9]", "", name.lower())


def parse_cell(td):
    """Split one description cell into the perk blurb plus a list of levels."""
    for img in td.find_all("img"):
        td_alt = (img.get("alt") or "").strip()
        img.replace_with(f"[[{td_alt}]]")
    text = re.sub(r"\n+", "\n", td.get_text("\n", strip=True))
    # Game8 labels the fourth row of four-level perks "Lv. 3" as well, so split
    # on the marker rather than trusting the number it carries.
    chunks = re.split(r"\bLv\.\s*\d+:", text)
    levels = []
    for chunk in chunks[1:]:
        c = chunk.replace("\n", " ")
        sp = re.search(r"\[\[Skill Point\]\]\s*(\d+)", c)
        ts = re.search(r"\[\[Time\]\]\s*(\d+)", c)
        corr = re.search(r"\[\[Corruption\]\]\s*Lv\.\s*(\d+)", c) or re.search(r"Lv\.\s*(\d+)\s*$", c.strip())
        effect = re.sub(r"\[\[[^\]]*\]\]", "", c.split("Cost:")[0]).strip(" .;")
        levels.append({
            "effect": re.sub(r"\s+", " ", effect),
            "skill_points": int(sp.group(1)) if sp else 0,
            "time_segments": int(ts.group(1)) if ts else 0,
            "manual": "[[Manual]]" in c,
            "corruption": int(corr.group(1)) if corr else None,
        })
    return chunks[0].replace("\n", " ").strip(), levels


def parse_page(path):
    soup = _soup()(pathlib.Path(path).read_text(encoding="utf-8", errors="replace"), "lxml")
    out = {}
    for table in soup.find_all("table"):
        heading = table.find_previous(["h2", "h3"])
        title = heading.get_text(" ", strip=True) if heading else ""
        m = re.match(r"(%s)\s+(Ultimate\s+)?Perks$" % "|".join(TREES), title)
        if not m:
            continue
        bucket = out.setdefault(m.group(1), {"perks": {}, "ultimates": {}})
        target = bucket["ultimates"] if m.group(2) else bucket["perks"]
        for tr in table.find_all("tr")[1:]:
            cells = tr.find_all("td")
            if len(cells) < 2:
                continue
            name = cells[0].get_text(" ", strip=True)
            if key(name) in NAV:
                continue
            blurb, levels = parse_cell(cells[1])
            target[name] = {"effect": blurb, "levels": levels}
    return out


def override_index(registry):
    """Deliberate departures from the source, keyed by (tree, perk, level, field)."""
    return {
        (o["tree"], key(o["perk"]), o["level"], o["field"]): o
        for o in registry.get("source_overrides", [])
    }


def compare(src, registry, overrides=None):
    findings, expected = [], []
    overrides = overrides if overrides is not None else override_index(registry)
    for tree_name, tree in registry["trees"].items():
        source = src.get(tree_name)
        if not source:
            findings.append(f"{tree_name}: no tables found in the source page")
            continue

        src_perks = {key(k): (k, v) for k, v in source["perks"].items()}
        our_perks = {key(p["name"]): p for p in tree["perks"]}
        for k in sorted(set(src_perks) - set(our_perks)):
            findings.append(f"{tree_name}: in source, missing from registry — {src_perks[k][0]}")
        for k in sorted(set(our_perks) - set(src_perks)):
            findings.append(f"{tree_name}: in registry, missing from source — {our_perks[k]['name']}")

        for k in sorted(set(src_perks) & set(our_perks)):
            perk, (src_name, src_perk) = our_perks[k], src_perks[k]
            src_levels, our_levels = src_perk["levels"], perk["levels"]
            if perk["quest_unlock"]:
                if src_levels:
                    findings.append(f"{tree_name}/{perk['name']}: registry marks a story unlock, "
                                    f"source lists {len(src_levels)} levels")
                continue
            if len(src_levels) != len(our_levels):
                findings.append(f"{tree_name}/{perk['name']}: {len(our_levels)} levels in registry, "
                                f"{len(src_levels)} in source")
            for i in range(min(len(src_levels), len(our_levels))):
                ours, theirs = our_levels[i], src_levels[i]
                where = f"{tree_name}/{perk['name']} Lv{i + 1}"
                for field in ("skill_points", "time_segments"):
                    if ours[field] == theirs[field]:
                        continue
                    o = overrides.get((tree_name, k, i + 1, field))
                    if o and o["registry"] == ours[field] and o["source"] == theirs[field]:
                        expected.append(f"{where}: {field} {ours[field]} in registry, {theirs[field]} "
                                        f"in source — {o['reason']}")
                    else:
                        findings.append(f"{where}: {field} {ours[field]} in registry, {theirs[field]} in source")
                if (ours["gate"] == "manual") != theirs["manual"]:
                    findings.append(f"{where}: manual gate {ours['gate'] == 'manual'} in registry, "
                                    f"{theirs['manual']} in source")
                m = re.match(r"corruption (\d+)$", ours["gate"])
                ours_corr = int(m.group(1)) if m else None
                if ours_corr != theirs["corruption"]:
                    findings.append(f"{where}: corruption {ours_corr} in registry, {theirs['corruption']} in source")
                # Effect wording is deliberately condensed in the registry, so
                # compare the set of numbers rather than the prose or its order.
                if sorted(re.findall(r"\d+", ours["effect"])) != sorted(re.findall(r"\d+", theirs["effect"])):
                    findings.append(f"{where}: effect numbers differ — registry \"{ours['effect']}\" "
                                    f"vs source \"{theirs['effect']}\"")

        src_ults = {key(k): (k, v) for k, v in source["ultimates"].items()}
        our_ults = {key(u["name"]): u for u in tree["ultimates"]}
        for k in sorted(set(src_ults) - set(our_ults)):
            findings.append(f"{tree_name}: ultimate in source, missing from registry — {src_ults[k][0]}")
        for k in sorted(set(our_ults) - set(src_ults)):
            findings.append(f"{tree_name}: ultimate in registry, missing from source — {our_ults[k]['name']}")
        for k in sorted(set(src_ults) & set(our_ults)):
            ult, (_, src_ult) = our_ults[k], src_ults[k]
            level = src_ult["levels"][0] if src_ult["levels"] else {}
            for field in ("skill_points", "time_segments"):
                if ult["cost"][field] != level.get(field):
                    findings.append(f"{tree_name}/{ult['name']}: ultimate {field} {ult['cost'][field]} "
                                    f"in registry, {level.get(field)} in source")
    return findings, expected


ABILITY_GATES = {"none", "manual", "vrakhir blood", "road shrine"}


def ability_checks(abilities, perk_ids):
    """data/abilities.json is generated by tools/extract_abilities.py, so the
    useful checks here are internal: bookkeeping, gate vocabulary, and that no
    ability id collides with a perk id (the planner keys build state by id)."""
    findings = []
    if abilities is None:
        return findings
    seen = set()
    for tree_name, tree in abilities.get("trees", {}).items():
        for ability in tree.get("abilities", []):
            where = f"{tree_name}/{ability['name']}"
            if len(ability["levels"]) != ability["max_level"]:
                findings.append(f"{where}: max_level {ability['max_level']} but "
                                f"{len(ability['levels'])} level entries")
            if ability["node_id"] in seen:
                findings.append(f"{where}: duplicate node_id {ability['node_id']}")
            seen.add(ability["node_id"])
            if ability["node_id"] in perk_ids:
                findings.append(f"{where}: node_id {ability['node_id']} collides with a perk")
            if not ability.get("use_cost", {}).get("text"):
                findings.append(f"{where}: no activation cost recorded")
            # `kind` splits the drawer, so it has to agree with what the ability
            # actually costs to fire rather than drift on its own.
            cost = ability.get("use_cost", {})
            kind = ("passive" if cost.get("charges", 0) == 0 and cost.get("health_percent", 0) == 0
                    else "active")
            if ability.get("kind") != kind:
                findings.append(f"{where}: kind is {ability.get('kind')!r} but "
                                f"use_cost makes it {kind!r}")
            # `story_granted` is observed in game and appears in no published
            # table, so there is nothing to cross-check it against. What can be
            # checked is that it is a real boolean and that the level it makes
            # free actually exists.
            granted = ability.get("story_granted")
            if granted is not None:
                if granted is not True:
                    findings.append(f"{where}: story_granted is {granted!r}; "
                                    "omit the field rather than writing a falsey value")
                elif not ability["levels"]:
                    findings.append(f"{where}: story_granted but the ability has no levels")
            for level in ability["levels"]:
                gate = level["gate"]
                if gate not in ABILITY_GATES and not re.match(r"corruption \d+$", gate):
                    findings.append(f"{where} Lv{level['level']}: unknown gate {gate!r}")
                if level["skill_points"] < 1:
                    findings.append(f"{where} Lv{level['level']}: costs no skill points")
                src = level.get("text_source")
                if src not in ("game", "game8"):
                    findings.append(f"{where} Lv{level['level']}: text_source is {src!r}; "
                                    "every level row records where its text came from")
            findings += scale_checks(where, ability["levels"])
    return findings


def scale_checks(where, levels):
    """Damage figures scale with the save, so a row read from one capture and a
    row left on the Game8 table are not comparable — splice them together and a
    final level reads as weaker than the one below it. Every such row is already
    flagged `scale_mismatch` in the registry; this catches a *new* one, and an
    old one whose flag was dropped without the number being fixed."""
    findings = []
    columns = [_magnitudes(l["effect"]) for l in levels]
    width = min((len(c) for c in columns), default=0)
    for i in range(width):
        column = [c[i] for c in columns]
        for a, b, lo, hi in zip(column, column[1:], levels, levels[1:]):
            if b >= a or lo.get("scale_mismatch") or hi.get("scale_mismatch"):
                continue
            findings.append(f"{where} Lv{hi['level']}: {b:g} is below Lv{lo['level']}'s "
                            f"{a:g} in the same position — a level reading as a downgrade "
                            "is how a spliced source shows up")
    for level in levels:
        if level.get("scale_mismatch") and level.get("text_source") != "game8":
            findings.append(f"{where} Lv{level['level']}: scale_mismatch on a row that "
                            "is not from Game8 — clear the flag once the row is re-read")
    return findings


# A percentage, a duration and a hit count all restate the same value at every
# level or count upward in ones; only flat magnitudes carry the save's scaling,
# so those are the ones worth comparing between levels.
_NOT_A_MAGNITUDE = re.compile(r"\s*(?:%|s\b|m\b|hits?\b|seconds?\b)")


def _magnitudes(text):
    out = []
    for match in re.finditer(r"\d[\d,]*(?:\.\d+)?", text):
        if _NOT_A_MAGNITUDE.match(text, match.end()):
            continue
        out.append(float(match.group().replace(",", "")))
    return out


def internal_checks(registry):
    """Checks that need no external source: the graph and level bookkeeping."""
    findings = []
    for tree_name, tree in registry["trees"].items():
        ids = {p["node_id"] for p in tree["perks"]}
        inverse = {}
        for perk in tree["perks"]:
            for req in perk["prerequisites"]:
                inverse.setdefault(req, set()).add(perk["node_id"])
        for perk in tree["perks"]:
            if len(perk["levels"]) != perk["max_level"]:
                findings.append(f"{tree_name}/{perk['name']}: max_level {perk['max_level']} "
                                f"but {len(perk['levels'])} level entries")
            for req in perk["prerequisites"]:
                if req not in ids:
                    findings.append(f"{tree_name}/{perk['name']}: prerequisite {req} is not a node in this tree")
            unlocks = set(perk["unlocks"])
            expected = inverse.get(perk["node_id"], set())
            if unlocks != expected:
                findings.append(f"{tree_name}/{perk['name']}: unlocks {sorted(unlocks)} does not match "
                                f"the inverse of prerequisites {sorted(expected)}")
    return findings



def _breadth(mech, scoring):
    """Recompute which systems are hubs, so a stale declaration is caught."""
    trans = scoring["transmission"]
    hops = scoring.get("hop_limit", 2)
    hub_pairs = scoring.get("hub_pairs", 150)
    out_adj, in_adj = {}, {}
    for e in mech["edges"]:
        if e.get("strength") not in trans:
            return {}          # graded badly; the strength check reports it
        out_adj.setdefault(e["from"], []).append(e)
        in_adj.setdefault(e["to"], []).append(e)

    def walk(starts):
        best = {s: 0 for s in starts}
        for hop in range(hops):
            for cur in list(best):
                if best[cur] != hop:
                    continue
                for e in out_adj.get(cur, []):
                    if e["to"] not in best:
                        best[e["to"]] = hop + 1
        return best

    reachers, readers = {}, {}
    for rec in mech["nodes"].values():
        for s in walk(rec["provides"]):
            reachers[s] = reachers.get(s, 0) + 1
        for s in rec["scales_with"]:
            readers[s] = readers.get(s, 0) + 1
    return {s: ("hub" if reachers.get(s, 0) * readers.get(s, 0) >= hub_pairs else "normal")
            for s in mech["systems"]}


def mechanics_checks(registry, abilities):
    """data/mechanics.json is an interpretation, but it still has to refer to
    nodes and systems that exist, or the planner silently drops synergies."""
    path = ROOT / "data" / "mechanics.json"
    if not path.exists():
        return ["data/mechanics.json is missing — the planner needs it to draw synergies"]
    mech = json.loads(path.read_text(encoding="utf-8"))
    findings = []

    real = {}
    for tree in registry["trees"].values():
        for perk in tree["perks"]:
            real[perk["node_id"]] = perk["name"]
        for i, ult in enumerate(tree["ultimates"], 1):
            real[f"U{tree['key']}{i}"] = ult["name"]
    if abilities:
        for tree in abilities["trees"].values():
            for ab in tree["abilities"]:
                real[ab["node_id"]] = ab["name"]

    systems = set(mech.get("systems", {}))
    referenced = set()

    for nid, rec in mech.get("nodes", {}).items():
        if nid not in real:
            findings.append(f"mechanics: {nid} is not a perk, ability or ultimate")
            continue
        if rec.get("name") != real[nid]:
            findings.append(f"mechanics/{nid}: name {rec.get('name')!r} "
                            f"does not match the registry's {real[nid]!r}")
        for field in ("provides", "scales_with"):
            for sysid in rec.get(field, []):
                referenced.add(sysid)
                if sysid not in systems:
                    findings.append(f"mechanics/{nid}: {field} names unknown system {sysid!r}")
        # A node that both provides and is paid by a system is usually a slip.
        # A few are real loops — Scarlet Shield heals off perfect blocks and at
        # level 4 makes them — and those declare the system in `feedback` and
        # say why in `note`. Nothing else may overlap.
        declared = set(rec.get("feedback", []))
        both = set(rec.get("provides", [])) & set(rec.get("scales_with", []))
        undeclared = both - declared
        if undeclared:
            findings.append(f"mechanics/{nid}: {sorted(undeclared)} is both provided and scaled with, "
                            "which makes the node its own synergy")
        for sysid in sorted(declared - both):
            findings.append(f"mechanics/{nid}: feedback names {sysid!r}, which the node does not "
                            "both provide and scale with")
        if declared and not rec.get("note"):
            findings.append(f"mechanics/{nid}: declares a feedback loop but no note explaining it")

    for nid, name in sorted(real.items()):
        if nid not in mech.get("nodes", {}):
            findings.append(f"mechanics: no entry for {nid} ({name})")

    scoring = mech.get("scoring")
    if not scoring:
        findings.append("mechanics: no scoring block — the planner cannot grade impact")
    else:
        trans = scoring.get("transmission", {})
        for grade in ("strong", "moderate", "weak"):
            v = trans.get(grade)
            if not isinstance(v, (int, float)) or not 0 < v <= 1:
                findings.append(f"mechanics/scoring: transmission[{grade}] must be in (0, 1], got {v!r}")
        if trans.get("strong", 0) <= trans.get("moderate", 0) or trans.get("moderate", 0) <= trans.get("weak", 0):
            findings.append("mechanics/scoring: transmission must fall strong > moderate > weak")
        bands = scoring.get("bands", {})
        if not (bands.get("green", 0) > bands.get("yellow", 0) > bands.get("red", 0)):
            findings.append("mechanics/scoring: bands must fall green > yellow > red")

    # `breadth` is derived, so it must still agree with the graph it describes.
    if scoring:
        recomputed = _breadth(mech, scoring)
        for sysid, want in sorted(recomputed.items()):
            got = mech["systems"][sysid].get("breadth")
            if got != want:
                findings.append(f"mechanics/{sysid}: breadth is {got!r} but the graph now makes it "
                                f"{want!r} — re-run tools/build_mechanics.py")

    seen_edges = set()
    for edge in mech.get("edges", []):
        pair = (edge.get("from"), edge.get("to"))
        for end in pair:
            referenced.add(end)
            if end not in systems:
                findings.append(f"mechanics: edge names unknown system {end!r}")
        if pair[0] == pair[1]:
            findings.append(f"mechanics: {pair[0]} is an edge to itself")
        if pair in seen_edges:
            findings.append(f"mechanics: duplicate edge {pair[0]} -> {pair[1]}")
        seen_edges.add(pair)
        if not edge.get("why"):
            findings.append(f"mechanics: edge {pair[0]} -> {pair[1]} has no reason given")
        if edge.get("strength") not in ("strong", "moderate", "weak"):
            findings.append(f"mechanics: edge {pair[0]} -> {pair[1]} has strength "
                            f"{edge.get('strength')!r}, not strong/moderate/weak")

    for sysid in sorted(systems - referenced):
        findings.append(f"mechanics: system {sysid!r} is declared but never used")
    return findings


def main():
    registry = json.loads((ROOT / "data" / "perks.json").read_text(encoding="utf-8"))
    ability_path = ROOT / "data" / "abilities.json"
    abilities = json.loads(ability_path.read_text(encoding="utf-8")) if ability_path.exists() else None

    perk_ids = {p["node_id"] for t in registry["trees"].values() for p in t["perks"]}
    findings = (internal_checks(registry) + ability_checks(abilities, perk_ids)
                + mechanics_checks(registry, abilities))
    label = "internal consistency"

    expected = []
    if len(sys.argv) > 1:
        diffs, expected = compare(parse_page(sys.argv[1]), registry)
        findings += diffs
        label = "internal consistency and the Game8 source"
    else:
        print("No source page given — running internal checks only.\n"
              "Pass a saved Game8 'All Perks List' page to cross-check costs and gates.\n")

    granted = sum(1 for t in (abilities or {"trees": {}})["trees"].values()
                  for a in t["abilities"] if a.get("story_granted"))
    quest = sum(1 for t in registry["trees"].values()
                for p in t["perks"] if p.get("quest_unlock"))
    perks = sum(len(t["perks"]) for t in registry["trees"].values())
    ults = sum(len(t["ultimates"]) for t in registry["trees"].values())
    abils = sum(len(t["abilities"]) for t in abilities["trees"].values()) if abilities else 0
    if expected:
        print(f"{len(expected)} documented deviation(s) from the source:\n")
        for e in expected:
            print(" ~", e)
        print()
    if findings:
        print(f"{len(findings)} finding(s) across {perks} perks, {ults} ultimates "
              f"and {abils} abilities:\n")
        for f in findings:
            print(" -", f)
        return 1
    mech_path = ROOT / "data" / "mechanics.json"
    if mech_path.exists():
        mech = json.loads(mech_path.read_text(encoding="utf-8"))
        print(f"{perks} perks, {ults} ultimates and {abils} abilities "
              f"check out against {label}.")
        print(f"Mechanics graph: {len(mech['systems'])} systems, {len(mech['edges'])} edges, "
              f"{len(mech['nodes'])} nodes mapped.")
        print(f"Story-driven, costing no points: {quest} perks and {granted} ability first levels.")
    else:
        print(f"{perks} perks, {ults} ultimates and {abils} abilities "
              f"check out against {label}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
