/* The Blood of Dawnwalker — skill tree planner.
   Everything about the perks is read from data/perks.json; this file holds the
   rules, the layout maths and the build analysis. */
(function () {
  'use strict';

  var DATA = null;
  var TREES = [];
  var BY_ID = {};
  var TREE_OF = {};
  var CHILDREN = {};
  var ULT_TREE = {};       // synthetic ultimate id -> tree
  var ULT_IDX = {};        // synthetic ultimate id -> index within its tree

  var state = {
    tab: null, sel: null,
    levels: {}, ults: {}, quests: {},
    corruption: 15, manuals: true, synergy: true
  };

  var el = {};
  ['tabs', 'tree', 'links', 'nodes', 'ults', 'ult-gate', 'panel', 'toast', 'corruption',
   'corruption-out', 'manuals', 'synergy', 'm-sp', 'm-ts', 'm-bk', 'boardscroll',
   'ov-body', 'ov-note', 'ovdrawer', 'abils', 'abil-note', 'abildrawer', 'ultdrawer',
   'hint-key'].forEach(function (id) {
    el[id.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] = document.getElementById(id);
  });

  /* ---------------------------------------------------------------- data */

  function load(file) {
    return fetch(file, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(file + ': HTTP ' + r.status);
      return r.json();
    });
  }

  Promise.all([load('data/perks.json'), load('data/abilities.json'), load('data/mechanics.json')])
    .then(function (all) { boot(all[0], all[1], all[2]); })
    .catch(function (err) {
      el.panel.innerHTML = '<div class="panel-empty"><b>Could not load the registry</b>' +
        'Browsers block fetch on <code>file://</code> URLs. Serve the folder instead:' +
        '<br><br><code>python3 -m http.server</code><br>then open <code>http://localhost:8000</code>.' +
        '<br><br>' + esc(String(err)) + '</div>';
    });

  function boot(json, abilities, mechanics) {
    DATA = json;
    buildMechanics(mechanics);
    Object.keys(DATA.trees).forEach(function (name) {
      var t = DATA.trees[name];
      var a = (abilities.trees[name] || {}).abilities || [];
      var tree = {
        name: name, key: t.key, perks: t.perks, ultimates: t.ultimates,
        ultimate_rule: t.ultimate_rule, active_time: t.active_time, abilities: a
      };
      TREES.push(tree);
      // Abilities are learned independently of the perk graph, so they get the
      // empty graph fields the shared rules expect.
      a.forEach(function (ab) {
        ab.is_ability = true;
        ab.prerequisites = []; ab.unlocks = []; ab.quest_unlock = false;
        BY_ID[ab.node_id] = ab; TREE_OF[ab.node_id] = tree;
        CHILDREN[ab.node_id] = [];
      });
      // Ultimates carry no node_id of their own; the mechanics graph keys them
      // U<tree key><index from 1>, so mirror that here.
      t.ultimates.forEach(function (u, i) {
        var uid = 'U' + t.key + (i + 1);
        ULT_TREE[uid] = tree; ULT_IDX[uid] = i;
      });
      t.perks.forEach(function (p) {
        BY_ID[p.node_id] = p; TREE_OF[p.node_id] = tree;
        CHILDREN[p.node_id] = CHILDREN[p.node_id] || [];
      });
      t.perks.forEach(function (p) {
        p.prerequisites.forEach(function (q) { (CHILDREN[q] = CHILDREN[q] || []).push(p); });
      });
      var w = treeWhen(tree);
      tree.when = w.when; tree.whenMixed = w.mixed;
    });
    renderHintKey();
    state.tab = TREES[0].name;
    seedStory();
    readHash();
    bindChrome();
    renderAll();
    window.addEventListener('resize', debounce(function () { renderTree(); }, 120));
  }

  /* --------------------------------------------------------------- rules */

  function lv(id) { return state.levels[id] || 0; }
  function tree() { return TREES.filter(function (t) { return t.name === state.tab; })[0]; }
  function nameOf(id) { return BY_ID[id] ? BY_ID[id].name : id; }

  function unlocked(p) {
    if (p.quest_unlock) return !!state.quests[p.node_id];
    return p.prerequisites.every(function (q) { return lv(q) >= 1; });
  }

  function corruptionOf(gate) {
    var m = /corruption\s+(\d+)/i.exec(gate || '');
    return m ? +m[1] : null;
  }

  function gateOk(gate) {
    if (!gate || gate === 'none' || gate === 'quest') return true;
    if (gate === 'manual') return state.manuals;
    // A Phial of Vrakhir Blood is consumed, not a permanent gate — it is
    // counted in the build overview rather than blocking the level.
    if (gate === 'vrakhir blood') return true;
    // Road shrines are free to reach and never consumed — not a real block.
    if (gate === 'road shrine') return true;
    var c = corruptionOf(gate);
    return c === null ? true : state.corruption >= c;
  }

  function gateLabel(gate) {
    if (!gate || gate === 'none') return '';
    if (gate === 'manual') return 'Manual required';
    if (gate === 'vrakhir blood') return 'Phial of Vrakhir Blood';
    if (gate === 'road shrine') return 'Road shrine';
    if (gate === 'quest') return 'Story unlock';
    var c = corruptionOf(gate);
    return c === null ? gate : 'Corruption ' + c;
  }

  /* A gate is a condition, not a price: it reads as its own mark plus the word
     for it, so nobody has to recognise a bare icon. It used to be spelled twice
     on the same row — once in words, once as an unlabelled chip among the skill
     point and time segment costs — and the chip was the unreadable one. */
  function gateKind(gate) {
    if (gate === 'manual') return 'g-manual';
    if (gate === 'road shrine') return 'g-shrine';
    if (gate === 'vrakhir blood') return 'g-phial';
    if (gate === 'quest') return 'g-quest';
    return corruptionOf(gate) === null ? '' : 'g-cor';
  }

  function gateShort(gate) {
    if (gate === 'manual') return 'Manual';
    if (gate === 'road shrine') return 'Shrine';
    if (gate === 'vrakhir blood') return 'Phial';
    if (gate === 'quest') return 'Story';
    var c = corruptionOf(gate);
    return c === null ? gate : 'Corruption ' + c;
  }

  function gateWhy(gate) {
    if (gate === 'manual') return 'Only learnable from a Manual found in the world';
    if (gate === 'road shrine') return 'Learned at a road shrine — free to reach, never used up';
    if (gate === 'vrakhir blood') return 'Consumes a Phial of Vrakhir Blood';
    if (gate === 'quest') return 'Unlocked by the story, not bought';
    var c = corruptionOf(gate);
    return c === null ? gate : 'Needs Corruption ' + c + ' or higher';
  }

  function gateTag(gate, owned) {
    if (!gate || gate === 'none') return '';
    var ok = owned || gateOk(gate);
    return '<span class="gate-tag ' + gateKind(gate) + (ok ? ' ok' : '') +
      '" title="' + esc(gateWhy(gate)) + '"><i></i>' + esc(gateShort(gate)) + '</span>';
  }

  function nextLevel(p) { return p.levels[lv(p.node_id)] || null; }

  function canLearn(p) {
    if (p.quest_unlock && !state.quests[p.node_id]) {
      return { ok: false, why: 'Story unlock — click the node to mark it found.' };
    }
    if (!unlocked(p)) {
      return { ok: false, why: 'Learn ' + p.prerequisites.map(nameOf).join(' and ') + ' to make this one available.' };
    }
    var nl = nextLevel(p);
    if (!nl) return { ok: false, why: 'Fully learned.' };
    if (!gateOk(nl.gate)) {
      return {
        ok: false,
        why: nl.gate === 'manual'
          ? 'Level ' + nl.level + ' needs a Manual — switch "Manuals found" on.'
          : 'Level ' + nl.level + ' needs ' + gateLabel(nl.gate) + '.'
      };
    }
    return { ok: true, level: nl };
  }

  function canRefund(p) {
    var n = lv(p.node_id), floor = storyFloor(p);
    if (n <= floor) {
      return { ok: false, why: floor
        ? 'The story grants level 1 outright — it cannot be refunded.'
        : 'Nothing learned here.' };
    }
    if (n === 1) {
      var deps = (CHILDREN[p.node_id] || []).filter(function (c) { return lv(c.node_id) > 0; });
      if (deps.length) {
        return { ok: false, why: 'Unlearn ' + deps.map(function (d) { return d.name; }).join(', ') + ' first.' };
      }
    }
    var t = TREE_OF[p.node_id];
    var after = perkSpent(t) - (p.is_ability ? 0 : levelCost(p, n - 1, 'skill_points'));
    if (state.ults[t.key] != null && !ultMet(t, after)) {
      return { ok: false, why: 'Deselect the ultimate perk first.' };
    }
    return { ok: true };
  }

  function learn(p) {
    var r = canLearn(p);
    if (!r.ok) { toast(r.why, true); return false; }
    state.levels[p.node_id] = lv(p.node_id) + 1;
    return true;
  }

  function refund(p) {
    var r = canRefund(p);
    if (!r.ok) { toast(r.why, true); return false; }
    var n = lv(p.node_id) - 1;
    if (n) state.levels[p.node_id] = n; else delete state.levels[p.node_id];
    return true;
  }

  /* Totals. Levels learned are the first `n` entries of a perk's level list. */
  function entries(t) { return t.perks.concat(t.abilities || []); }

  /* The story hands you the first level of a few abilities outright. They still
     appear, still occupy an ability slot and still upgrade at the usual price —
     but level 1 is free, so nothing may charge for it. Every cost in the planner
     reads through here. */
  function levelCost(p, i, field) {
    if (p.story_granted && i === 0) return 0;
    return p.levels[i][field];
  }
  function isFree(p, i) { return !!p.story_granted && i === 0; }

  /* The story does not offer these five abilities, it hands them over: you have
     them whether the build planned for them or not. So level 1 is where they
     start, Reset puts them back there, Refund cannot take it away, and nothing
     gated on level 1 applies — Dirty Trick and Burning Blood are manual-gated at
     level 1 and the story bypasses that, so neither is a manual to go and find. */
  function storyFloor(p) { return p && p.story_granted ? 1 : 0; }

  function seedStory() {
    Object.keys(BY_ID).forEach(function (id) {
      var f = storyFloor(BY_ID[id]);
      if (f && lv(id) < f) state.levels[id] = f;
    });
  }

  function tallyOf(list, field) {
    return list.reduce(function (sum, p) {
      var n = lv(p.node_id), s = 0;
      for (var i = 0; i < n; i++) s += (field === 'manual' || field === 'vrakhir blood')
        ? (!isFree(p, i) && p.levels[i].gate === field ? 1 : 0)
        : levelCost(p, i, field);
      return sum + s;
    }, 0);
  }
  function tally(t, field) { return tallyOf(entries(t), field); }

  /* Two different point counts, and the difference matters. `spent` is what the
     build actually costs you — perks and abilities alike. `perkSpent` is what
     the ultimate's "N/35" counter reads: ability points do NOT count toward it,
     so an all-ability tree never unlocks an ultimate. */
  function spent(t) { return tally(t, 'skill_points'); }
  function perkSpent(t) { return tallyOf(t.perks, 'skill_points'); }
  function timeSpent(t) {
    var u = state.ults[t.key];
    return tally(t, 'time_segments') + (u != null ? (t.ultimates[u].cost.time_segments || 0) : 0);
  }
  function manualsNeeded(t) { return tally(t, 'manual'); }
  function phialsNeeded(t) { return tally(t, 'vrakhir blood'); }

  /* A requirement string may name several conditions; all of them must hold. */
  function ultReq(t) {
    var r = (t.ultimates[0] && t.ultimates[0].requirement) || '35 points in tree';
    var conds = [];
    var pts = /(\d+)\s*points/i.exec(r);
    if (pts) conds.push({ type: 'points', n: +pts[1] });
    var c = corruptionOf(r);
    if (c !== null) conds.push({ type: 'corruption', n: c });
    if (!conds.length) conds.push({ type: 'points', n: 35 });
    return conds;
  }

  function ultProgress(t, spentOverride) {
    return ultReq(t).map(function (c) {
      var have = c.type === 'corruption' ? state.corruption
        : (spentOverride == null ? perkSpent(t) : spentOverride);
      return {
        met: have >= c.n, have: have, n: c.n,
        // Two readings of the same condition. `short` is a counter, for the
        // folded drawer summary, which has room for one; `text` is the sentence
        // the toast uses when you click a locked ultimate.
        short: (c.type === 'corruption' ? 'Corruption ' : 'Perk points ') +
          have + '/' + c.n,
        text: c.type === 'corruption' ? 'Corruption ' + c.n
          : 'Spend ' + c.n + ' on perks in this tree'
      };
    });
  }
  function ultTaken(id) {
    var t = ULT_TREE[id];
    return !!t && state.ults[t.key] === ULT_IDX[id];
  }

  function ultMet(t, o) { return ultProgress(t, o).every(function (x) { return x.met; }); }

  function activeTime(p) { return p.active_time || TREE_OF[p.node_id].active_time || ''; }

  /* When a tree's hours are the same all the way down — Swordmastery is ANYTIME
     throughout, Vampirism NIGHT ONLY — that is a fact about the tree, and it was
     printed again on every one of its 19 and 17 perk cards. It is read once, on
     the tree's tab. The card carries it only where a perk disagrees with its
     tree, which in the shipped data is the seven ANYTIME perks in an otherwise
     DAY ONLY Witchcraft. */
  function treeWhen(t) {
    var count = {}, when = '', top = 0, total = 0;
    t.perks.concat(t.abilities || [], t.ultimates || []).forEach(function (p) {
      var w = p.active_time || t.active_time || '';
      if (!w) return;
      total++;
      count[w] = (count[w] || 0) + 1;
      if (count[w] > top) { top = count[w]; when = w; }
    });
    return { when: when, mixed: top !== total };
  }

  /* DAY ONLY / NIGHT ONLY / ANYTIME, short enough to ride a tab. */
  function shortWhen(when) {
    var w = whenMark(when);
    return w === 'day' ? 'Day' : w === 'night' ? 'Night' : w ? 'Any' : '';
  }

  /* The banner above a perk name is one of three, each with its own mark in
     game: a sun for DAY ONLY, a crescent for NIGHT ONLY, both for ANYTIME. */
  function whenMark(when) {
    var w = String(when || '').toUpperCase();
    if (w.indexOf('DAY') === 0) return 'day';
    if (w.indexOf('NIGHT') === 0) return 'night';
    return w ? 'any' : '';
  }

  /* ------------------------------------------------- effect interpretation */

  /* Effects are written as prose. Three shapes carry a number we can total:
     a signed delta ("+25% max stamina", "-10% cooldowns"), a flat setting
     ("10% critical chance", "2 slots"), and a chance, which the game writes
     with the number in the middle — "Weapon Critical Hit : 6% chance". That
     last shape reached neither of the first two, so every crit chance in the
     game fell through to the conditional text list and was never totalled:
     Fate's Favour, Clawpierce, Evil Eye, Potent Blood, Unholy Fervour and
     Forager, thirteen lines in all. Anything with more than one number in it —
     "+4% per attack, up to +20%" — is genuinely conditional and stays text. */
  function readEffect(text) {
    var body = String(text).replace(/\.$/, '').trim();
    var signed = /^([+-])(\d+)(%?)\s+(.+)$/.exec(body);
    if (signed && isLabel(signed[4])) {
      return { kind: 'delta', value: (signed[1] === '-' ? -1 : 1) * +signed[2],
               unit: signed[3], label: signed[4] };
    }
    var flat = /^(\d+)(%?)\s+(.+)$/.exec(body);
    if (flat && isLabel(flat[3])) {
      return { kind: 'set', value: +flat[1], unit: flat[2], label: flat[3] };
    }
    var chance = /^(.+?)\s*:\s*([+-]?\d+)(%?)\s*(chance)?$/i.exec(body);
    if (chance && isLabel(chance[1])) {
      return { kind: 'set', value: +chance[2], unit: chance[3],
               label: chance[1] + (chance[4] ? ' chance' : '') };
    }
    return null;
  }

  /* What follows the number has to be the name of a stat for the row to mean
     anything. The test used to be only "no digits in it", which let a whole
     sentence through: Omniblock's last level is "-40% Stamina cost. Directional
     Block works like Omniblock if wrong direction is chosen.", and the overview
     printed that entire sentence as a stat name with -40% against it, in a
     different group from the "Stamina cost" it should have joined. A name is
     one clause and a handful of words. */
  function isLabel(text) {
    var t = String(text).trim();
    return !/\d/.test(t) && !/[.;:]/.test(t) && t.split(/\s+/).length <= 6;
  }

  /* Three perks reduce "Cooldowns" and three others add "Slots available", and
     each is scoped by its own effect line to one tree's abilities — Restless
     Blade to Swordmastery's, Aether Flow to Witchcraft's, Endless Ferocity to
     Vampiric ones. The level text drops that scope, so the summary keyed three
     separate pools to one label and added them together: "Cooldowns -50%" for
     three unrelated -10/-20/-20 reductions, and "Slots available 12" for three
     sets of four. The scope is in the perk's own effect, so read it from there
     and keep the rows apart. */
  var FAMILY = /\b(Witchcraft|Swordmastery|Vampiric)\b[^.]*\bAbilit(?:y|ies)\b/i;

  function scopedLabel(p, label) {
    var m = FAMILY.exec(p.effect || '');
    if (!m) return label;
    var fam = m[1];
    if (new RegExp('\\b' + fam + '\\b', 'i').test(label)) return label;
    return label + ' (' + fam.charAt(0).toUpperCase() + fam.slice(1).toLowerCase() + ' abilities)';
  }

  /* Two lines are versions of one another when they are the same sentence once
     the numbers come out, so a perk that restates a rider at a bigger number
     lists it once, at the number you actually have. */
  function shapeOf(text) {
    return String(text).toLowerCase().replace(/[\d]+(\.[\d]+)?/g, '#').replace(/\s+/g, ' ').trim();
  }

  var GROUPS = [
    ['Offence', /damage|crit|bleed|weaken/i],
    ['Defence', /armour|health|penalt|regener|block|immortal/i],
    ['Resources', /stamina|charge|cooldown|corruption|refund|restor/i]
  ];
  function groupFor(label) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][1].test(label)) return GROUPS[i][0];
    return 'Utility';
  }

  /* Within one perk, a later level replaces the earlier one for the same stat
     (Endless Effort's +100% is not +25% and +50% and +75% as well), so take the
     highest. Across different perks the stats add up. */
  function summarise() {
    var stats = {}, other = [], manuals = [], phials = [];
    TREES.forEach(function (t) {
      entries(t).forEach(function (p) {
        var n = lv(p.node_id);
        if (!n) return;
        var best = {}, cond = [], byShape = {};
        for (var i = 0; i < n; i++) {
          var l = p.levels[i];
          // The story's own level is not a manual to go and find.
          if (!isFree(p, i) && l.gate === 'manual') manuals.push(p.name + ' — level ' + l.level);
          if (!isFree(p, i) && l.gate === 'vrakhir blood') phials.push(p.name + ' — level ' + l.level);
          var r = readEffect(l.effect);
          if (!r) {
            /* An ability's level text is a complete restatement of the ability —
               Artery Strike at level 3 IS the ability, 560% and 680% are gone —
               so only the level you hold is listed. A perk's levels are riders
               that stack, and two different riders are both still true, so they
               both stand; only a restatement of the same rider collapses. */
            if (p.is_ability) cond = [l.effect];
            else if (byShape[shapeOf(l.effect)] != null) cond[byShape[shapeOf(l.effect)]] = l.effect;
            else { byShape[shapeOf(l.effect)] = cond.length; cond.push(l.effect); }
            continue;
          }
          var label = scopedLabel(p, r.label);
          var key = (label + '|' + r.unit).toLowerCase();
          if (!best[key] || Math.abs(r.value) > Math.abs(best[key].value)) {
            best[key] = { value: r.value, unit: r.unit, label: label, kind: r.kind };
          }
        }
        cond.forEach(function (text) { other.push({ perk: p.name, text: text }); });
        Object.keys(best).forEach(function (key) {
          var b = best[key];
          if (!stats[key]) stats[key] = { value: 0, unit: b.unit, label: b.label, kind: b.kind, perks: [] };
          stats[key].value += b.value;
          stats[key].perks.push(p.name);
        });
      });
      var u = state.ults[t.key];
      if (u != null) other.push({ perk: t.ultimates[u].name + ' (ultimate)', text: t.ultimates[u].effect });
    });
    return { stats: stats, other: other, manuals: manuals, phials: phials };
  }

  /* ------------------------------------------------------------- synergy

     Two perks are not synergistic because their text shares a word. They are
     synergistic when one raises something the other is paid by — directly, or
     down a chain of real mechanics. data/mechanics.json holds that chain: each
     node declares what it `provides` and what it `scales_with`, and the edges
     say which systems drive which. Attack speed lands more attacks, more
     attacks roll more criticals, and criticals are what Restless Blade turns
     into cooldown — so Swiftness feeds Restless Blade three steps away, and
     the planner can say why. */
  var MECH = null;
  var OUT = {};            // system -> [edge] following the arrow
  var IN = {};             // system -> [edge] against it
  var MAX_HOPS = 2;        // past two steps everything connects to everything; data may override

  /* Impact is a multiplier, not a distance. Each link passes on only part of
     what the first perk put in — strong 0.9, moderate 0.75, weak 0.5 — and a
     chain multiplies, so two strong links carry 81%. Meeting at a hub system
     multiplies by a further 0.6, because a claim true of hundreds of pairs is
     a generic one. The model lives in data/mechanics.json; these are fallbacks. */
  var SCORE = {
    transmission: { strong: 0.9, moderate: 0.75, weak: 0.5 },
    hub_factor: 0.6, hop_limit: 2,
    bands: { green: 100, yellow: 75, red: 50 }
  };

  function carryOf(strength) {
    return SCORE.transmission[strength] || SCORE.transmission.moderate;
  }

  /* Green is a direct meeting on a non-hub system and nothing less: this node
     provides exactly what that node is paid by. Under 50% returns null and the
     row is not drawn at all — a fifth of an effect is not a synergy. */
  function bandOf(pct) {
    if (pct >= SCORE.bands.green - 0.5) return 'green';
    if (pct >= SCORE.bands.yellow) return 'yellow';
    if (pct >= SCORE.bands.red) return 'red';
    return null;
  }

  function buildMechanics(m) {
    MECH = m;
    if (m.scoring) SCORE = m.scoring;
    MAX_HOPS = SCORE.hop_limit || MAX_HOPS;
    (m.edges || []).forEach(function (e) {
      (OUT[e.from] = OUT[e.from] || []).push(e);
      (IN[e.to] = IN[e.to] || []).push(e);
    });
  }

  function sysName(id) {
    return (MECH && MECH.systems[id] && MECH.systems[id].name) || id;
  }
  function mech(id) { return (MECH && MECH.nodes[id]) || null; }

  /* Breadth-first over the mechanics graph. `dir` is 'out' to follow the arrows
     (what my outputs end up affecting) or 'in' to walk against them (what could
     end up feeding my inputs). Either way the stored path reads forward, cause
     first, so it can be printed as-is. The graph has cycles by design — crits
     cut cooldowns, cooldowns raise uptime, uptime raises damage, damage kills,
     kills cut cooldowns — so `seen` and MAX_HOPS are what terminate this. */
  function reach(starts, dir) {
    var best = {};
    starts.forEach(function (s) { best[s] = { carry: 1, dist: 0, path: [] }; });
    // Expanded hop by hop, keeping the best-carrying route to each system rather
    // than the shortest — two strong links carry more than one weak one, and
    // should be ranked that way.
    for (var hop = 0; hop < MAX_HOPS; hop++) {
      var frontier = Object.keys(best);
      for (var i = 0; i < frontier.length; i++) {
        var cur = frontier[i], rec = best[cur];
        if (rec.dist !== hop) continue;
        var edges = (dir === 'out' ? OUT[cur] : IN[cur]) || [];
        for (var k = 0; k < edges.length; k++) {
          var e = edges[k], next = dir === 'out' ? e.to : e.from;
          var carry = rec.carry * carryOf(e.strength);
          if (best[next] && best[next].carry >= carry) continue;
          best[next] = {
            carry: carry, dist: rec.dist + 1,
            path: dir === 'out' ? rec.path.concat([e]) : [e].concat(rec.path)
          };
        }
      }
    }
    return best;
  }

  /* A meeting on a hub system is discounted — see SCORE.hub_factor. */
  function impactAt(hit, sysid) {
    var sys = MECH.systems[sysid];
    var hub = sys && sys.breadth === 'hub' ? SCORE.hub_factor : 1;
    return hit.carry * hub * 100;
  }

  /* Scores every other node against this one. The result is a band per node,
     which is what the board draws as a coloured dot — the chain that produced it
     is not rendered anywhere, so it is not carried here either. */
  function synergiesFor(id) {
    var me = mech(id);
    if (!me) return [];
    var fwd = reach(me.provides || [], 'out');
    var rev = reach(me.scales_with || [], 'in');
    var rows = [];

    Object.keys(MECH.nodes).forEach(function (other) {
      if (other === id) return;
      var y = MECH.nodes[other], best = null;

      (y.scales_with || []).forEach(function (s) {
        var hit = fwd[s];
        if (hit) { var pct = impactAt(hit, s); if (best === null || pct > best) best = pct; }
      });
      (y.provides || []).forEach(function (s) {
        var hit = rev[s];
        if (hit) { var pct = impactAt(hit, s); if (best === null || pct > best) best = pct; }
      });
      if (best === null) return;
      var band = bandOf(best);
      if (!band) return;              // under 50%: not a synergy worth drawing
      rows.push({
        id: other, name: y.name, pct: Math.round(best), band: band,
        tree: TREE_OF[other] || ULT_TREE[other] || null
      });
    });
    return rows;
  }

  /* Written once, under the board. The colours need explaining exactly once,
     and the side panel is not where a legend earns its space. */
  function renderHintKey() {
    if (!el.hintKey) return;
    el.hintKey.innerHTML = '<b>Synergy:</b> ' +
      '<span class="tier-dot tier-green"></span>100% · ' +
      '<span class="tier-dot tier-yellow"></span>75%+ · ' +
      '<span class="tier-dot tier-red"></span>50%+ of this perk\'s effect reaches it';
  }

  /* Board marking stays inside the tree on screen — those are the nodes you can
     actually click from here — and only shows a direct hit, where this node's
     output *is* the other's input. Two-hop chains are real but there are enough
     of them to light up the whole board, so they stay in the panel list. */
  function related(id) {
    var marks = {};
    synergiesFor(id).forEach(function (r) {
      // Every band that made the 50% cut is marked, in its own colour — the
      // board is a heat map, and a red dot is itself the useful answer.
      if (r.tree === TREE_OF[id]) marks[r.id] = r.band;
    });
    return marks;
  }

  /* -------------------------------------------------------------- layout */

  function cssPx(name, fallback) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isNaN(v) ? fallback : v;
  }

  /* Share `target` pixels out among the gaps between columns, in proportion to
     the spacing the game uses, but never letting a gap fall below `floor`.
     Clamping a narrow gap up has to come out of the wide ones, or the board
     would overflow — so the surplus is taken back from whatever is still above
     the floor, and the floor itself gives way if there is simply no room. */
  function distribute(gaps, total, target, floor, ceil, mayOverflow) {
    var n = gaps.length;
    if (!n) return [];
    // A wide window used to be shared out in full, so the same seven columns
    // that read tightly on a laptop drifted 300px apart on a 2560px monitor.
    // The board gains nothing from that distance, so it takes no more than it
    // needs and leaves the rest to the page.
    if (ceil > floor) target = Math.min(target, ceil * n);
    // Normally the board is made to fit the window, so a floor that cannot fit
    // gives way. Where the board is allowed to scroll sideways it does not:
    // squeezing past the floor is what drives names into each other.
    if (!mayOverflow && floor * n > target) floor = target / n;
    var w = gaps.map(function (g) { return total ? g / total * target : target / n; });
    for (var pass = 0; pass < 6; pass++) {
      w = w.map(function (x) { return Math.max(floor, x); });
      var sum = w.reduce(function (a, b) { return a + b; }, 0);
      if (sum - target <= 0.5) break;
      var free = [], freeTotal = 0;
      w.forEach(function (x, i) { if (x > floor + 0.5) { free.push(i); freeTotal += x; } });
      if (!free.length) break;
      var give = Math.min(sum - target, freeTotal - floor * free.length);
      if (give <= 0) break;
      var k = (freeTotal - give) / freeTotal;
      free.forEach(function (i) { w[i] *= k; });
    }
    // Proportional sharing alone keeps the game's own ratios, which on the
    // widest trees means one gap three times another. Clamping the long ones
    // down closes the empty stretches without touching the short ones; the
    // width it gives back is left as margin, not redistributed.
    if (ceil > floor) w = w.map(function (x) { return Math.min(ceil, x); });
    return w;
  }

  /* Columns are remapped into the space available rather than the board being
     zoomed — scaling the board would drag the labels below 12px. Relative
     spacing is kept, with a floor on the gap between adjacent columns. */
  /* The tree is laid out across the width it has, and at the size the stylesheet
     says — never squeezed to fit the height it has left.

     It used to do the latter, and it went wrong twice over. The height it
     measured was "the column minus whatever my siblings currently occupy", and
     `renderTree` runs before the ultimates and abilities drawers are filled in,
     so the first paint measured them empty and every paint after that measured
     them full: at a 1050px window the node went 92px on load and 70.75px on the
     next render, the tree losing 119px under the cursor as soon as you clicked
     anything. Below about 860px tall it bottomed out on its own 52px floor and
     the board scrolled regardless, so the squeeze bought nothing there but an
     illegible board — and it meant opening the Abilities drawer shrank the tree,
     because the tree's size depended on the length of the page under it.

     Height now comes from `--node`/`--row`, which the stylesheet steps down by
     viewport height. That is stable — a media query cannot be changed by a click
     — and where the tree still does not fit, the board scrolls, which is what a
     board too tall for its column is supposed to do. */
  function layout(t) {
    var node = cssPx('--node', 92), colmin = cssPx('--colmin', 132);
    var colmax = Math.max(colmin, cssPx('--colmax', 150));
    var availW = (el.boardscroll.clientWidth || 1000) - 4;

    var rows = Math.max.apply(null, t.perks.map(function (p) { return p.row; }));
    var labelRoom = 48;
    // Below the stacking breakpoint the page scrolls and the board may scroll
    // sideways, which changes what the layout is allowed to do to fit.
    var stacked = window.matchMedia('(max-width:1000px)').matches;
    var pad = node / 2 + 38;

    var xs = [];
    t.perks.forEach(function (p) { if (xs.indexOf(p.x) < 0) xs.push(p.x); });
    xs.sort(function (a, b) { return a - b; });

    var gaps = [], total = 0, i;
    for (i = 1; i < xs.length; i++) { gaps.push(xs[i] - xs[i - 1]); total += xs[i] - xs[i - 1]; }
    var target = Math.max(availW - 2 * pad, 0);
    var widths = distribute(gaps, total, target, colmin, colmax, stacked);

    var at = {}, cursor = pad;
    at[xs[0]] = cursor;
    for (i = 0; i < widths.length; i++) { cursor += widths[i]; at[xs[i + 1]] = cursor; }
    var used = cursor + pad;
    var width = Math.max(availW, used);
    var shift = used < availW ? (availW - used) / 2 : 0;   // centre any spare room

    // Labels sit under their node, so they may be no wider than the tightest
    // column pitch or neighbouring names would collide.
    var pitch = widths.length ? Math.min.apply(null, widths) : colmin;
    // A label is centred on its node, so it may overhang neither its neighbour
    // nor the edge of the board — hence the padding cap as well as the pitch.
    var labelW = Math.min(152, Math.max(56, Math.min(pitch - 8, 2 * pad - 8)));

    var top = node / 2 + 8;
    var rowH = cssPx('--row', 180);
    var height = top + (rows - 1) * rowH + node / 2 + labelRoom;

    return {
      node: node, width: width, height: height, labelW: labelW,
      pos: function (p) { return { x: at[p.x] + shift, y: top + (p.row - 1) * rowH }; }
    };
  }

  /* -------------------------------------------------------------- render */

  function renderAll() {
    document.body.className = 't-' + (tree() ? tree().key : 'wc');
    renderTabs();
    renderAbilities();
    renderUltimates();
    renderTree();
    renderPanel();
    renderMeters();
    renderOverview();
    writeHash();
  }

  function renderTabs() {
    el.tabs.innerHTML = TREES.map(function (t) {
      var mn = manualsNeeded(t);
      var when = t.when
        ? '<span class="tab-when" title="' + esc(t.whenMixed
              ? 'Most of ' + t.name + ' works ' + t.when.toLowerCase() +
                '; the perks that do not are badged on their own card.'
              : 'Every perk and ability in ' + t.name + ' works ' + t.when.toLowerCase() + '.') +
          '"><i class="when-mark ' + whenMark(t.when) + '"></i>' + esc(shortWhen(t.when)) +
          (t.whenMixed ? '*' : '') + '</span>'
        : '';
      return '<button class="tab" role="tab" type="button" data-tree="' + t.name + '"' +
        ' aria-selected="' + (t.name === state.tab) + '">' +
        '<span class="tab-mark">' + Icons.svg(Icons.forTree(t.name)) + '</span>' + t.name + when +
        '<span class="tab-stat"><i class="s-sp" title="Skill points spent in this tree"></i>' + spent(t) +
        (mn ? '<i class="s-bk" title="Manuals this tree\'s build needs"></i>' + mn : '') +
        '</span></button>';
    }).join('');
  }

  function renderTree() {
    var t = tree();
    if (!t) return;
    var L = layout(t);
    el.tree.style.width = L.width + 'px';
    el.tree.style.height = L.height + 'px';
    el.links.setAttribute('viewBox', '0 0 ' + L.width + ' ' + L.height);

    var syn = state.synergy && state.sel && TREE_OF[state.sel] === t ? related(state.sel) : {};
    var paths = [];
    t.perks.forEach(function (child) {
      child.prerequisites.forEach(function (pid) {
        var parent = BY_ID[pid];
        if (!parent) return;
        var a = L.pos(parent), b = L.pos(child), r = L.node / 2;
        var y1 = a.y + r, y2 = b.y - r, d;
        if (Math.abs(a.x - b.x) < 2) d = 'M' + a.x + ' ' + y1 + ' L' + b.x + ' ' + y2;
        else {
          var my = y1 + (y2 - y1) * 0.45;
          d = 'M' + a.x + ' ' + y1 + ' L' + a.x + ' ' + my + ' L' + b.x + ' ' + my + ' L' + b.x + ' ' + y2;
        }
        var cls = 'link';
        if (lv(parent.node_id) >= 1) cls += lv(child.node_id) >= 1 ? ' done' : ' lit';
        paths.push('<path class="' + cls + '" d="' + d + '"/>');
      });
    });
    el.links.innerHTML = paths.join('');
    el.nodes.innerHTML = t.perks.map(function (p) { return nodeHTML(p, L, syn); }).join('');
  }

  /* Level markers, drawn the way the game draws them: a filled diamond for every
     level learned, a hollow bright one on the level you could buy next, and a
     dark one for the rest. Perk nodes and ability rows share this so the two
     read the same at a glance. */
  function pipsHTML(p, n, learnable) {
    var out = '';
    for (var i = 0; i < p.max_level; i++) {
      var cls = i < n ? ' on' : (i === n && learnable ? ' next' : '');
      out += '<span class="pip' + cls + '"></span>';
    }
    return out;
  }

  function nodeHTML(p, L, syn) {
    var n = lv(p.node_id), open = unlocked(p), learnable = canLearn(p).ok;
    var cls = ['node'];
    if (n > 0) cls.push('taken');
    if (n >= p.max_level) cls.push('maxed');
    if (learnable) cls.push('avail');
    else if (!open) cls.push('locked');
    else if (n < p.max_level) cls.push('gated');
    if (state.sel === p.node_id) cls.push('selected');
    if (syn[p.node_id]) cls.push('synergy', 'syn-' + syn[p.node_id]);

    var pips = pipsHTML(p, n, learnable);

    var badge = '';
    if (p.quest_unlock && !state.quests[p.node_id]) badge = '<span class="badge lock"></span>';
    else {
      var need = p.levels.some(function (l, i) { return l.gate === 'manual' && i >= n; });
      var used = p.levels.some(function (l, i) { return l.gate === 'manual' && i < n; });
      if (need) badge = '<span class="badge"></span>';
      else if (used) badge = '<span class="badge got"></span>';
    }
    var bang = (learnable && n === 0 && !p.quest_unlock) ? '<span class="bang">!</span>' : '';

    var pt = L.pos(p);
    return '<button class="' + cls.join(' ') + '" type="button" data-node="' + p.node_id + '"' +
      ' style="left:' + pt.x + 'px;top:' + pt.y + 'px"' +
      ' aria-label="' + esc(p.name) + ', level ' + n + ' of ' + p.max_level + '">' +
      '<span class="frame"></span>' + Icons.forNodeMark(p.node_id, 'glyph') +
      badge + bang + '<span class="syn"></span>' +
      '<span class="pips">' + pips + '</span>' +
      '<span class="name" style="width:' + L.labelW + 'px">' + esc(p.name) + '</span></button>';
  }

  function renderAbilities() {
    var t = tree(), list = t.abilities || [];
    var learned = list.filter(function (a) { return lv(a.node_id) > 0; }).length;
    var pts = list.reduce(function (sum, a) {
      var n = lv(a.node_id), s = 0;
      for (var i = 0; i < n; i++) s += levelCost(a, i, 'skill_points');
      return sum + s;
    }, 0);
    var act = list.filter(function (a) { return a.kind === 'active'; }).length;
    el.abilNote.textContent = learned + ' of ' + list.length + ' learned · ' + act +
      ' active, ' + (list.length - act) + ' passive · ' + pts +
      ' points, which do not count toward the ultimate';

    var syn = state.synergy && state.sel && TREE_OF[state.sel] === t ? related(state.sel) : {};

    function card(a) {
      var n = lv(a.node_id), can = canLearn(a).ok;
      var cls = 'abil' + (n ? ' taken' : '') + (n >= a.max_level ? ' maxed' : '') +
                (can ? ' avail' : '') + (state.sel === a.node_id ? ' selected' : '') +
                (syn[a.node_id] ? ' synergy syn-' + syn[a.node_id] : '');
      var pips = pipsHTML(a, n, can);
      var nl = a.levels[n];
      var use = a.use_cost && a.use_cost.text ? a.use_cost.text : '';
      return '<button class="' + cls + '" type="button" data-node="' + a.node_id + '"' +
        ' aria-label="' + esc(a.name) + ', level ' + n + ' of ' + a.max_level + '">' +
        '<span class="abil-mark">' + Icons.forAbilityMark(a.node_id, a.name) + '</span>' +
        '<span class="abil-txt"><b>' + esc(a.name) +
          (a.story_granted ? '<span class="story-tag" title="The story grants level 1 — ' +
            'it costs no skill points and no time segments. Upgrades are paid for normally.">' +
            'Story</span>' : '') + '</b>' +
        '<span class="abil-use">' + esc(use) + '</span>' +
        '<span class="abil-eff">' + esc(a.effect) + '</span>' +
        '<span class="abil-foot"><span class="pips">' + pips + '</span>' +
        (nl ? '<span class="abil-next">' +
              (isFree(a, n) ? '<span class="free-tag">Story — free</span>'
                            : costHTML(nl.skill_points, nl.time_segments)) +
              gateTag(nl.gate, false) + '</span>'
            : '<span class="abil-next done">Maxed</span>') +
        '</span></span></button>';
    }

    /* Active and passive are different things to shop for: one costs charges or
       health every time you fire it, the other just runs once equipped. They
       compete for the same slots, so both are shown, but not in one undivided
       pile. */
    var groups = [
      { kind: 'active', title: 'Active',
        note: 'cost charges or health to use' },
      { kind: 'passive', title: 'Passive',
        note: 'no activation cost — they work once equipped, and still take a slot' }
    ];
    var html = groups.map(function (g) {
      var items = list.filter(function (a) { return a.kind === g.kind; });
      if (!items.length) return '';
      return '<div class="abil-group">' +
        '<h4 class="abil-head">' + g.title +
          '<span class="abil-count">' + items.length + '</span>' +
          '<span class="abil-sub">' + g.note + '</span></h4>' +
        '<div class="abils-grid">' + items.map(card).join('') + '</div></div>';
    }).join('');
    el.abils.innerHTML = html || '<p class="ov-empty">No abilities listed for this tree.</p>';
  }

  /* The drawer is folded by default, so its summary has to carry the whole
     state of the section: how far off the requirement is, whether it has been
     met, and — once the choice is made — which ultimate was taken, since that
     is permanent and the one thing worth seeing without opening anything. */
  function renderUltimates() {
    var t = tree(), prog = ultProgress(t), met = prog.every(function (x) { return x.met; });
    var chosen = state.ults[t.key] != null ? t.ultimates[state.ults[t.key]] : null;

    el.ultGate.className = 'ult-gate' + (met ? ' met' : '');
    el.ultGate.textContent = chosen
      ? 'Chosen: ' + chosen.name
      : prog.map(function (x) { return x.short; }).join(' · ') +
        (met ? ' · ready to choose' : '');
    // Unlocked and unspent is the only moment the fold is hiding something the
    // reader can act on, so that is the only moment it calls attention to itself.
    el.ultdrawer.classList.toggle('ready', met && !chosen);

    el.ults.innerHTML = t.ultimates.map(function (u, i) {
      var on = state.ults[t.key] === i;
      return '<button class="ult' + (on ? ' on' : '') + (met ? '' : ' locked') + '" type="button"' +
        ' data-ult="' + i + '" aria-pressed="' + on + '">' +
        '<span class="ult-mark">' + Icons.forUltMark(t.key, i + 1, '', u.name) + '</span><span>' +
        '<b>' + esc(u.name) + (u.alias ? '<span class="alias">also listed as ' + esc(u.alias) + '</span>' : '') + '</b>' +
        '<span class="ult-eff">' + esc(u.effect) + '</span>' +
        '<span class="ult-cost">' + costHTML(u.cost.skill_points, u.cost.time_segments) + '</span>' +
        '</span></button>';
    }).join('');
  }

  /* Price only: skill points and time segments. Gates used to be folded in here
     as extra unlabelled chips, which put the same condition on a row twice and
     left the reader to guess at a book, a shrine and a blood sigil at 13px.
     They are `gateTag`s now, marks with the word beside them. `label` spells the
     units out where the layout has room — the top bar was the only place they
     were ever named. */
  function costHTML(sp, ts, label) {
    var out = [];
    if (sp) out.push('<span class="cost sp" title="' + sp + ' skill point' + (sp > 1 ? 's' : '') +
      '"><i></i>' + sp + (label ? '<u>pt' + (sp > 1 ? 's' : '') + '</u>' : '') + '</span>');
    if (ts) out.push('<span class="cost ts" title="' + ts + ' time segment' + (ts > 1 ? 's' : '') +
      '"><i></i>' + ts + (label ? '<u>seg' + (ts > 1 ? 's' : '') + '</u>' : '') + '</span>');
    return out.join(' ');
  }

  function renderPanel() {
    var id = state.sel;
    if (!id || !BY_ID[id]) {
      el.panel.innerHTML = '<div class="panel-empty"><b>No perk selected</b>' +
        'Hover a node to read it. Click to learn its next level, right-click to refund.</div>';
      return;
    }
    var p = BY_ID[id], t = TREE_OF[id], n = lv(id);
    var nl = nextLevel(p), learnable = canLearn(p), refundable = canRefund(p);
    var when = activeTime(p);

    var reqLine = '';
    if (p.is_ability) {
      reqLine = '<p class="req">Costs <b>' + esc(p.use_cost.text) + '</b> to use</p>';
    } else if (p.quest_unlock) {
      reqLine = '<p class="req"><b>Story unlock.</b> No skill point or time cost — ' +
        (state.quests[id] ? 'marked as found.' : 'click the node to mark it found.') + '</p>';
    } else if (p.prerequisites.length) {
      reqLine = '<p class="req">Requires <b>' + p.prerequisites.map(function (q) {
        return esc(nameOf(q)) + (lv(q) ? ' ✓' : '');
      }).join('</b> and <b>') + '</b></p>';
    }


    var levels = p.levels.map(function (l, i) {
      var owned = i < n, isNext = i === n;
      var blocked = !owned && (!gateOk(l.gate) || (isNext ? !learnable.ok : true));
      return '<li class="' + (owned ? 'on ' : '') + (isNext ? 'next ' : '') + (blocked ? 'blocked' : '') + '">' +
        '<span class="lp"></span><span class="lv-text">' + esc(l.effect) + '</span>' +
        '<span class="lv-meta"><span class="lv-costs">' +
          (isFree(p, i) ? '<span class="free-tag">Story — free</span>'
                        : costHTML(l.skill_points, l.time_segments, true)) + '</span>' +
          (owned ? '' : gateTag(l.gate, false)) + '</span></li>';
    }).join('');

    var btn = nl ? 'Learn level ' + nl.level : 'Fully learned';
    if (p.quest_unlock) btn = state.quests[id] ? 'Found' : 'Mark as found';

    /* The hours ride the tree's tab. Here they appear only as an exception —
       this perk does not keep its tree's hours — so the badge means something
       when it is there, instead of being the same word on every card. */
    var whenBadge = (when && when !== t.when)
      ? '<span class="hero-when" title="' + esc(p.name + ' works ' + when.toLowerCase() +
          ', unlike the rest of ' + t.name + '.') +
        '"><i class="when-mark ' + whenMark(when) + '"></i>' + esc(when) + '</span>'
      : '';

    el.panel.innerHTML =
      '<div class="panel-hero">' +
        '<span class="hero-mark">' +
          (p.is_ability ? Icons.forAbilityMark(id, p.name) : Icons.forNodeMark(id)) + '</span>' +
        '<span class="hero-tree">' + esc(t.name) + whenBadge + '</span>' +
        '<span class="hero-lv">Level ' + n + ' / ' + p.max_level + '</span></div>' +
      '<div class="panel-body">' +
        (p.cooldown ? '<p class="panel-cd"><i class="cd-mark"></i>Cooldown: ' +
          esc(p.cooldown) + '</p>' : '') +
        '<h3>' + esc(p.name) +
          (p.story_granted ? '<span class="story-tag">Story</span>' : '') + '</h3>' +
        '<p class="desc">' + esc(p.effect) + '</p>' +
        (p.note ? '<p class="desc-note">' + esc(p.note) + '</p>' : '') + reqLine +
        '<ul class="levels">' + levels + '</ul>' +
      '</div>' +
      '<div class="panel-foot">' +
        '<button class="btn btn-learn" type="button" data-act="learn"' +
          (p.quest_unlock ? '' : (learnable.ok ? '' : ' disabled')) + '>' + btn + '</button>' +
        '<button class="btn btn-ghost" type="button" data-act="refund"' +
          (refundable.ok ? '' : ' disabled') + '>Refund</button>' +
      '</div>' +
      (!learnable.ok && !p.quest_unlock ? '<p class="panel-note">' + esc(learnable.why) + '</p>' : '');
  }

  function renderMeters() {
    var sp = 0, ts = 0, bk = 0;
    TREES.forEach(function (t) {
      sp += spent(t);
      var u = state.ults[t.key];
      if (u != null) sp += t.ultimates[u].cost.skill_points || 0;
      ts += timeSpent(t); bk += manualsNeeded(t);
    });
    el.mSp.textContent = sp; el.mTs.textContent = ts; el.mBk.textContent = bk;
  }

  /* `toggle` does not bubble, so the listener is a capturing one on the body. */
  var ovOpen = {};

  function renderOverview() {
    var s = summarise();
    var keys = Object.keys(s.stats);
    var t = tree();
    var ph = phialsNeeded(t);
    el.ovNote.textContent = t.name + ': ' + spent(t) + ' points · ' + manualsNeeded(t) + ' manuals needed' +
      (ph ? ' · ' + ph + (ph === 1 ? ' phial' : ' phials') : '');

    if (!keys.length && !s.other.length) {
      el.ovBody.innerHTML = '<p class="ov-empty">Nothing learned yet. Totals appear here as you spend points.</p>';
      return;
    }

    var groups = {};
    keys.forEach(function (k) {
      var st = s.stats[k], g = groupFor(st.label);
      (groups[g] = groups[g] || []).push(st);
    });

    var html = ['Offence', 'Defence', 'Resources', 'Utility'].filter(function (g) { return groups[g]; })
      .map(function (g) {
        var rows = groups[g].sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); })
          .map(function (st) {
            var v = (st.kind === 'delta' && st.value > 0 ? '+' : '') + st.value + st.unit;
            return '<div class="ov-row"><span>' + esc(cap(st.label)) + '</span><b>' + esc(v) + '</b></div>';
          }).join('');
        return '<div class="ov-group"><h4>' + g + '</h4>' + rows + '</div>';
      }).join('');

    /* Three lists that can run to dozens of rows each, under totals that are the
       reason to open the overview at all. They fold away with their count on the
       summary line, and each opens into a scroller of its own — so reaching the
       fifteenth conditional effect never means scrolling the twenty-two manuals
       past first, and opening one cannot push the overview off its column. The
       open ones are remembered: the body is rewritten on every click anywhere in
       the planner, and a section that snapped shut each time would be useless. */
    function section(title, items, render) {
      if (!items.length) return '';
      var key = title.replace(/\W+/g, '');
      return '<details class="ov-sub" data-ov="' + key + '"' + (ovOpen[key] ? ' open' : '') + '>' +
        '<summary>' + esc(title) + '<span class="ov-count">' + items.length + '</span></summary>' +
        '<ul class="ov-list">' + items.map(render).join('') + '</ul></details>';
    }

    /* No perk name on the row. Every one of these is something the tree gives
       you; which node it came off is not what you are reading the list for, and
       the name was the widest thing in it. */
    html += section('Conditional & unique effects', s.other, function (o) {
      return '<li>' + esc(o.text) + '</li>';
    });
    html += section('Manuals to find', s.manuals, function (m) {
      return '<li>' + esc(m) + '</li>';
    });
    html += section('Phials of Vrakhir Blood', s.phials, function (m) {
      return '<li>' + esc(m) + '</li>';
    });

    el.ovBody.innerHTML = html;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* -------------------------------------------------------------- events */

  function bindChrome() {
    el.tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tree]');
      if (!b) return;
      state.tab = b.dataset.tree; state.sel = null;
      renderAll();
    });

    el.nodes.addEventListener('click', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b) return;
      var p = BY_ID[b.dataset.node];
      state.sel = p.node_id;
      if (p.quest_unlock) {
        state.quests[p.node_id] = !state.quests[p.node_id];
        if (state.quests[p.node_id]) state.levels[p.node_id] = 1; else delete state.levels[p.node_id];
      } else learn(p);
      var byKeyboard = e.detail === 0;
      renderAll();
      if (byKeyboard) focusNode(p.node_id); else revealPanel();
    });

    el.nodes.addEventListener('contextmenu', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b) return;
      e.preventDefault();
      var p = BY_ID[b.dataset.node];
      state.sel = p.node_id;
      if (p.quest_unlock) { state.quests[p.node_id] = false; delete state.levels[p.node_id]; }
      else refund(p);
      renderAll();
    });

    el.nodes.addEventListener('mouseover', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b || state.sel === b.dataset.node) return;
      state.sel = b.dataset.node;
      renderPanel(); renderTree();
    });

    el.nodes.addEventListener('keydown', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b || (e.key !== 'Backspace' && e.key !== 'Delete')) return;
      e.preventDefault();
      refund(BY_ID[b.dataset.node]);
      renderAll(); focusNode(b.dataset.node);
    });

    el.abils.addEventListener('click', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b) return;
      state.sel = b.dataset.node;
      learn(BY_ID[b.dataset.node]);
      renderAll();
    });
    el.abils.addEventListener('contextmenu', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b) return;
      e.preventDefault();
      state.sel = b.dataset.node;
      refund(BY_ID[b.dataset.node]);
      renderAll();
    });
    el.abils.addEventListener('mouseover', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b || state.sel === b.dataset.node) return;
      state.sel = b.dataset.node;
      renderPanel();
    });

    el.ults.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ult]');
      if (!b) return;
      var t = tree(), i = +b.dataset.ult;
      if (!ultMet(t)) {
        toast('You need to ' + ultProgress(t).filter(function (x) { return !x.met; })
          .map(function (x) { return x.text.toLowerCase(); }).join(' and ') + ' before choosing an ultimate.', true);
        return;
      }
      if (state.ults[t.key] === i) delete state.ults[t.key]; else state.ults[t.key] = i;
      renderAll();
    });

    el.panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || !state.sel) return;
      var p = BY_ID[state.sel];
      if (b.dataset.act === 'learn') {
        if (p.quest_unlock) { state.quests[p.node_id] = true; state.levels[p.node_id] = 1; }
        else learn(p);
      } else if (p.quest_unlock) { state.quests[p.node_id] = false; delete state.levels[p.node_id]; }
      else refund(p);
      renderAll();
    });

    el.corruption.addEventListener('input', function () {
      state.corruption = +el.corruption.value;
      el.corruptionOut.textContent = state.corruption;
      dropInvalid(); renderAll();
    });
    el.manuals.addEventListener('change', function () {
      state.manuals = el.manuals.checked; dropInvalid(); renderAll();
    });
    el.synergy.addEventListener('change', function () {
      state.synergy = el.synergy.checked; renderTree(); renderPanel();
    });

    document.getElementById('reset').addEventListener('click', function () {
      state.levels = {}; state.ults = {}; state.quests = {}; state.sel = null;
      seedStory();
      renderAll(); toast('Build cleared.');
    });

    el.ovBody.addEventListener('toggle', function (e) {
      var d = e.target;
      if (d && d.tagName === 'DETAILS' && d.dataset.ov) ovOpen[d.dataset.ov] = d.open;
    }, true);

    document.getElementById('share').addEventListener('click', function () {
      writeHash();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(
          function () { toast('Build link copied.'); },
          function () { toast('Copy failed — the link is in the address bar.', true); });
      } else toast('The build link is in the address bar.');
    });

    window.addEventListener('hashchange', function () {
      if (writingHash) return;
      readHash(); renderAll();
    });
    // Each of these changes how much of the board's column is left for the tree.
    [el.ovdrawer, el.abildrawer, el.ultdrawer].forEach(function (d) {
      d.addEventListener('toggle', function () { renderTree(); });
    });

    el.corruption.value = state.corruption;
    el.corruptionOut.textContent = state.corruption;
    el.manuals.checked = state.manuals;
    el.synergy.checked = state.synergy;
  }

  function focusNode(id) {
    var b = el.nodes.querySelector('[data-node="' + id + '"]');
    if (b) b.focus();
  }
  function revealPanel() {
    if (window.matchMedia('(min-width:1001px)').matches) return;
    el.panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* Corruption dropping or manuals switching off can make learned levels
     illegal; peel them back from the top so the build stays possible. */
  function dropInvalid() {
    var changed = true;
    while (changed) {
      changed = false;
      Object.keys(state.levels).forEach(function (id) {
        var p = BY_ID[id];
        if (!p) { delete state.levels[id]; changed = true; return; }
        var n = state.levels[id], floor = storyFloor(p);
        while (n > floor && !p.quest_unlock && !gateOk(p.levels[n - 1].gate)) { n--; changed = true; }
        if (n > floor && !unlocked(p)) { n = floor; changed = true; }
        if (n < floor) { n = floor; changed = true; }
        if (n) state.levels[id] = n; else delete state.levels[id];
      });
      TREES.forEach(function (t) {
        if (state.ults[t.key] != null && !ultMet(t)) { delete state.ults[t.key]; changed = true; }
      });
    }
  }

  /* ----------------------------------------------------------- build links */

  var writingHash = false;

  function writeHash() {
    var parts = ['1', 'c' + state.corruption, 'm' + (state.manuals ? 1 : 0)];
    var picks = Object.keys(state.levels)
      .filter(function (id) {
        return !(BY_ID[id] && BY_ID[id].quest_unlock) &&
               state.levels[id] > storyFloor(BY_ID[id]);
      })
      .sort().map(function (id) { return id + '.' + state.levels[id]; });
    if (picks.length) parts.push('p=' + picks.join(','));
    var q = Object.keys(state.quests).filter(function (id) { return state.quests[id]; }).sort();
    if (q.length) parts.push('q=' + q.join(','));
    var u = Object.keys(state.ults).filter(function (k) { return state.ults[k] != null; })
      .map(function (k) { return k + '.' + state.ults[k]; });
    if (u.length) parts.push('u=' + u.join(','));
    parts.push('t=' + (tree() ? tree().key : ''));

    writingHash = true;
    var h = '#b=' + parts.join(';');
    if (location.hash !== h) history.replaceState(null, '', h);
    setTimeout(function () { writingHash = false; }, 0);
  }

  function readHash() {
    var m = /#b=(.+)$/.exec(location.hash || '');
    if (!m) return;
    state.levels = {}; state.ults = {}; state.quests = {};
    m[1].split(';').forEach(function (chunk) {
      var k = chunk[0], v = chunk.slice(1).replace(/^=/, '');
      if (k === 'c') state.corruption = clamp(+v, 0, 15);
      else if (k === 'm') state.manuals = v === '1';
      else if (k === 'p') v.split(',').forEach(function (pair) {
        var a = pair.split('.'), p = BY_ID[a[0]];
        if (p) state.levels[a[0]] = clamp(+a[1] || 0, 0, p.max_level);
      });
      else if (k === 'q') v.split(',').forEach(function (id) {
        if (BY_ID[id]) { state.quests[id] = true; state.levels[id] = 1; }
      });
      else if (k === 'u') v.split(',').forEach(function (pair) {
        var a = pair.split('.');
        var t = TREES.filter(function (x) { return x.key === a[0]; })[0];
        if (t) state.ults[a[0]] = clamp(+a[1] || 0, 0, t.ultimates.length - 1);
      });
      else if (k === 't') {
        var tt = TREES.filter(function (x) { return x.key === v; })[0];
        if (tt) state.tab = tt.name;
      }
    });
    if (el.corruption) { el.corruption.value = state.corruption; el.corruptionOut.textContent = state.corruption; }
    if (el.manuals) el.manuals.checked = state.manuals;
    seedStory();
    dropInvalid();
  }

  /* ----------------------------------------------------------------- util */

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, isNaN(n) ? lo : n)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer;
  function toast(msg, warn) {
    el.toast.textContent = msg;
    el.toast.className = 'toast show' + (warn ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, 2800);
  }
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
})();
