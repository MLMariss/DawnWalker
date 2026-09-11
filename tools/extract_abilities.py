#!/usr/bin/env python3
"""Build data/abilities.json from two saved ability lists.

Game8's "All Abilities List" carries each ability's upgrade levels with their
skill point, time segment, manual, corruption and Vrakhir-blood costs. The
Fextralife "Abilities" page carries what an ability costs to *use* — activation
charges and health — which Game8 omits. This merges the two, using Game8 for
the tree split and level data and Fextralife only for the use cost.

    python3 tools/extract_abilities.py <game8.html> <fextralife.html>
"""
import json
import pathlib
import re
import sys
import unicodedata

from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
TREES = ("Witchcraft", "Swordmastery", "Vampirism")
KEYS = {"Witchcraft": "wc", "Swordmastery": "sm", "Vampirism": "vp"}
NAV = {"witchcraft", "swordmastery", "vampirism", "witchcraftswordmasteryvampirism"}


def key(name):
    name = unicodedata.normalize("NFKD", name).replace("’", "'").replace("‘", "'")
    return re.sub(r"[^a-z0-9]", "", name.lower())


# Typos in the source page, fixed here rather than silently in the data.
CLEANUPS = {
    ("Charge", 0): ('Charge dealing Damage and Stunning a target and everyone on your way. "',
                    "Charge dealing Damage and Stunning a target and everyone on your way.",
                    "stray quote mark in the source blurb"),
    ("Shapeshift", 1): ("2 Gain Haste", "Gain Haste",
                        "stray leading 2 in the source's level 1 text"),
}
APPLIED = []


def clean(name, index, text):
    """index 0 is the blurb, 1+ are level numbers."""
    fix = CLEANUPS.get((name, index))
    if fix and text == fix[0]:
        APPLIED.append("%s %s: %r -> %r (%s)" %
                       (name, "blurb" if index == 0 else "Lv.%d" % index, fix[0], fix[1], fix[2]))
        return fix[1]
    return text


def parse_levels(td):
    for img in td.find_all("img"):
        img.replace_with(f"[[{(img.get('alt') or '').strip()}]]")
    text = re.sub(r"\n+", "\n", td.get_text("\n", strip=True))
    # The fourth row of a four-level entry is mislabelled "Lv. 3" on the source
    # page, so split on the marker and number the levels by position.
    chunks = re.split(r"\bLv\.\s*\d+:", text)
    levels = []
    for n, chunk in enumerate(chunks[1:], 1):
        c = chunk.replace("\n", " ")
        sp = re.search(r"\[\[Skill Point\]\]\s*(\d+)", c)
        ts = re.search(r"\[\[Time\]\]\s*(\d+)", c)
        corr = re.search(r"\[\[Corruption Icon\]\]\s*Lv\.\s*(\d+)", c)
        if "[[Manual]]" in c:
            gate = "manual"
        elif corr:
            gate = "corruption %s" % corr.group(1)
        elif "[[Vrakhir Blood]]" in c:
            gate = "vrakhir blood"
        else:
            gate = "none"
        effect = c.split("Cost:")[0]
        effect = re.sub(r"\[\[[^\]]*\]\]", "", effect)
        effect = re.sub(r"\s+", " ", effect).strip(" .;")
        levels.append({
            "level": n, "effect": effect,
            "skill_points": int(sp.group(1)) if sp else 0,
            "time_segments": int(ts.group(1)) if ts else 0,
            "gate": gate,
        })
    return chunks[0].replace("\n", " ").strip(), levels


def parse_game8(path):
    soup = BeautifulSoup(pathlib.Path(path).read_text(encoding="utf-8", errors="replace"), "lxml")
    out = {}
    for table in soup.find_all("table"):
        heading = table.find_previous(["h2", "h3"])
        title = heading.get_text(" ", strip=True) if heading else ""
        m = re.match(r"(%s)\s+Abilities$" % "|".join(TREES), title)
        if not m:
            continue
        bucket = out.setdefault(m.group(1), {})
        for tr in table.find_all("tr")[1:]:
            cells = tr.find_all("td")
            if len(cells) < 2:
                continue
            name = cells[0].get_text(" ", strip=True)
            if key(name) in NAV:
                continue
            blurb, levels = parse_levels(cells[1])
            blurb = clean(name, 0, blurb)
            for lvl in levels:
                lvl["effect"] = clean(name, lvl["level"], lvl["effect"])
            if levels:
                bucket[name] = {"effect": blurb, "levels": levels}
    return out


def parse_fextra(path):
    """The wiki's one big table: Ability Name | Type | Effects | Cost."""
    soup = BeautifulSoup(pathlib.Path(path).read_text(encoding="utf-8", errors="replace"), "lxml")
    out = {}
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all("td")]
        if len(cells) < 4:
            continue
        name, typ, _effects, cost = cells[0], cells[1], cells[2], cells[3]
        if typ not in TREES:
            continue
        out[key(name)] = {"name": name, "tree": typ, "use_cost": re.sub(r"\s+", " ", cost).strip()}
    return out


def use_cost(raw):
    """'3 Activation Charges 25% Health' -> structured, with the text kept."""
    if not raw or raw.upper() == "N/A":
        return {"text": "Passive — no activation cost", "charges": 0, "health_percent": 0}
    charges = re.search(r"(\d+)\s*Activation Charge", raw, re.I)
    health = re.search(r"(\d+)\s*%\s*Health", raw, re.I)
    return {
        "text": raw,
        "charges": int(charges.group(1)) if charges else 0,
        "health_percent": int(health.group(1)) if health else 0,
    }


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    g8, fx = parse_game8(sys.argv[1]), parse_fextra(sys.argv[2])

    data = {
        "game": "The Blood of Dawnwalker",
        "subject": "Ability registry",
        "notes": [
            "Upgrade levels and their costs come from the Game8 'All Abilities List' page.",
            "Activation charge and health costs to use an ability come from the Fextralife ability table; Game8 does not list them.",
            "The source labels the fourth row of four-level abilities 'Lv. 3'; levels here are numbered by position.",
            "Abilities have no prerequisites in either source - they are learned independently of the perk graph.",
            "Gates: manual, corruption <n>, vrakhir blood (a Phial of Vrakhir Blood), or none.",
            "Two source typos are corrected on extraction; tools/extract_abilities.py names them.",
        ],
        "trees": {},
    }
    mismatch, missing = [], []
    for tree in TREES:
        entries = g8.get(tree, {})
        abilities = []
        for i, name in enumerate(sorted(entries), 1):
            e = entries[name]
            f = fx.get(key(name))
            if f and f["tree"] != tree:
                mismatch.append("%s: Game8 says %s, Fextralife says %s" % (name, tree, f["tree"]))
            if not f:
                missing.append("%s (%s): no use cost on the wiki table" % (name, tree))
            abilities.append({
                "node_id": "A%s%d" % (KEYS[tree][0].upper() if tree != "Swordmastery" else "S", i),
                "name": name,
                "effect": e["effect"],
                "max_level": len(e["levels"]),
                "use_cost": use_cost(f["use_cost"] if f else None),
                "levels": e["levels"],
            })
        data["trees"][tree] = {"key": KEYS[tree], "abilities": abilities}

    path = ROOT / "data" / "abilities.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for tree in TREES:
        a = data["trees"][tree]["abilities"]
        print("%-13s %2d abilities, %3d levels" % (tree, len(a), sum(len(x["levels"]) for x in a)))
    print("\nsource typos fixed:", APPLIED or "none")
    print("tree mismatches:", mismatch or "none")
    print("no use cost   :", missing or "none")
    print("wrote", path)


if __name__ == "__main__":
    main()
