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
   'ov-body', 'ov-note', 'ovdrawer', 'abils', 'abil-note', 'abildrawer', 'hint-key'].forEach(function (id) {
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
    });
    renderHintKey();
    state.tab = TREES[0].name;
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
    var c = corruptionOf(gate);
    return c === null ? true : state.corruption >= c;
  }

  function gateLabel(gate) {
    if (!gate || gate === 'none') return '';
    if (gate === 'manual') return 'Manual required';
    if (gate === 'vrakhir blood') return 'Phial of Vrakhir Blood';
    if (gate === 'quest') return 'Story unlock';
    var c = corruptionOf(gate);
    return c === null ? gate : 'Corruption ' + c;
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
    var n = lv(p.node_id);
    if (!n) return { ok: false, why: 'Nothing learned here.' };
    if (n === 1) {
      var deps = (CHILDREN[p.node_id] || []).filter(function (c) { return lv(c.node_id) > 0; });
      if (deps.length) {
        return { ok: false, why: 'Unlearn ' + deps.map(function (d) { return d.name; }).join(', ') + ' first.' };
      }
    }
    var t = TREE_OF[p.node_id];
    var after = perkSpent(t) - (p.is_ability ? 0 : p.levels[n - 1].skill_points);
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

  function tallyOf(list, field) {
    return list.reduce(function (sum, p) {
      var n = lv(p.node_id), s = 0;
      for (var i = 0; i < n; i++) s += (field === 'manual' || field === 'vrakhir blood')
        ? (p.levels[i].gate === field ? 1 : 0)
        : p.levels[i][field];
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

  /* ------------------------------------------------- effect interpretation */

  /* Effects are written as prose. Two shapes carry a number we can total:
     a signed delta ("+25% max stamina", "-10% cooldowns") and a flat setting
     ("10% critical chance", "2 slots"). Anything with more than one number in
     it — "+4% per attack, up to +20%" — is conditional, and is listed as text
     rather than folded into a total. */
  function readEffect(text) {
    var body = String(text).replace(/\.$/, '').trim();
    var signed = /^([+-])(\d+)(%?)\s+(.+)$/.exec(body);
    if (signed && !/\d/.test(signed[4])) {
      return { kind: 'delta', value: (signed[1] === '-' ? -1 : 1) * +signed[2],
               unit: signed[3], label: signed[4] };
    }
    var flat = /^(\d+)(%?)\s+(.+)$/.exec(body);
    if (flat && !/\d/.test(flat[3])) {
      return { kind: 'set', value: +flat[1], unit: flat[2], label: flat[3] };
    }
    return null;
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
        var best = {};
        for (var i = 0; i < n; i++) {
          var l = p.levels[i];
          if (l.gate === 'manual') manuals.push(p.name + ' — level ' + l.level);
          if (l.gate === 'vrakhir blood') phials.push(p.name + ' — level ' + l.level);
          var r = readEffect(l.effect);
          if (!r) { other.push({ perk: p.name, text: l.effect }); continue; }
          var key = (r.label + '|' + r.unit).toLowerCase();
          if (!best[key] || Math.abs(r.value) > Math.abs(best[key].value)) {
            best[key] = { value: r.value, unit: r.unit, label: r.label, kind: r.kind };
          }
        }
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

  /* The systems named along a path, cause first. */
  function chainOf(hit, target, dir) {
    if (!hit.path.length) return [target];
    var out = [hit.path[0].from];
    hit.path.forEach(function (e) { out.push(e.to); });
    return out;
  }

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
        if (!hit) return;
        var pct = impactAt(hit, s);
        if (!best || pct > best.pct) {
          best = { pct: pct, dist: hit.dist, dir: 'feeds', chain: chainOf(hit, s, 'out'), path: hit.path, at: s };
        }
      });
      (y.provides || []).forEach(function (s) {
        var hit = rev[s];
        if (!hit) return;
        var pct = impactAt(hit, s);
        if (!best || pct > best.pct) {
          best = { pct: pct, dist: hit.dist, dir: 'fedBy', chain: chainOf(hit, s, 'in'), path: hit.path, at: s };
        }
      });
      if (!best) return;
      var band = bandOf(best.pct);
      if (!band) return;              // under 50%: not a synergy worth drawing
      rows.push({
        id: other, name: y.name, pct: Math.round(best.pct), band: band,
        dist: best.dist, dir: best.dir, chain: best.chain, at: best.at,
        hub: (MECH.systems[best.at] || {}).breadth === 'hub',
        why: best.path.map(function (e) { return e.why; }),
        tree: TREE_OF[other] || ULT_TREE[other] || null,
        learned: lv(other) > 0 || ultTaken(other)
      });
    });

    rows.sort(function (a, b) {
      if (a.pct !== b.pct) return b.pct - a.pct;
      if (a.learned !== b.learned) return a.learned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }

  var SYN_SHOWN = 14;

  /* Written once, under the board. The colours need explaining exactly once,
     and the side panel is not where a legend earns its space. */
  function renderHintKey() {
    if (!el.hintKey) return;
    el.hintKey.innerHTML = '<b>Synergy:</b> ' +
      '<span class="tier-dot tier-green"></span>100% · ' +
      '<span class="tier-dot tier-yellow"></span>75%+ · ' +
      '<span class="tier-dot tier-red"></span>50%+ of this perk\'s effect reaches it';
  }
  var BAND_TEXT = {
    green: 'Full effect: this node provides exactly what that one is paid by.',
    yellow: 'Most of the effect, one or two firm links away.',
    red: 'Part of the effect — generic, conditional, or a stretch.'
  };

  function synergyHTML(id) {
    var me = mech(id);
    if (!me) return '';
    var rows = synergiesFor(id);

    // What this node raises and is paid by used to be spelled out here. It is
    // the same information the rows already carry in their chains, and it was
    // taking the top of the panel to say it — so it moved to the title attribute
    // and the space went back to the perk.
    var head = [];
    if ((me.provides || []).length) {
      head.push('Raises ' + me.provides.map(sysName).join(', '));
    }
    if ((me.scales_with || []).length) {
      head.push('paid by ' + me.scales_with.map(sysName).join(', '));
    }
    if (!rows.length) return '';

    var shown = rows.slice(0, SYN_SHOWN);
    var list = shown.map(function (r) {
      var chain = r.chain.map(function (x) { return esc(sysName(x)); }).join(' <i>→</i> ');
      var where = r.tree && r.tree !== TREE_OF[id]
        ? '<span class="syn-tree">' + esc(r.tree.name) + '</span>' : '';
      var tip = BAND_TEXT[r.band] +
        (r.hub ? ' Meeting at ' + sysName(r.at) + ', which most of the board touches.' : '') +
        (r.why.length ? ' — ' + r.why.join(' ') : '');
      return '<li class="syn-row ' + (r.dir === 'feeds' ? 'out' : 'in') +
        ' tier-' + r.band + (r.learned ? ' has' : '') +
        '" title="' + esc(tip) + '">' +
        '<span class="syn-arrow" aria-hidden="true"></span>' +
        '<span class="syn-name">' + esc(r.name) + where +
          '<span class="syn-pct">' + r.pct + '%</span></span>' +
        '<span class="syn-chain">' + chain + '</span></li>';
    }).join('');

    var more = rows.length > shown.length
      ? '<p class="syn-more">and ' + (rows.length - shown.length) + ' more at ' +
        rows[shown.length].pct + '% or less.</p>' : '';

    return '<div class="syn-box" title="' + esc(head.join(' · ')) + '">' +
      '<ul class="syn-list">' + list + '</ul>' + more + '</div>';
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
  function distribute(gaps, total, target, floor, mayOverflow) {
    var n = gaps.length;
    if (!n) return [];
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
    return w;
  }

  /* Columns are remapped into the space available rather than the board being
     zoomed — scaling the board would drag the labels below 12px. Relative
     spacing is kept, with a floor on the gap between adjacent columns. */
  function layout(t) {
    var node = cssPx('--node', 92), colmin = cssPx('--colmin', 132);
    var availW = (el.boardscroll.clientWidth || 1000) - 4;
    // The board column is the scroller; the drawers and hint under the tree are
    // siblings, so measure what they leave rather than what the tree box is now.
    var col = el.boardscroll.parentNode, used = 0;
    Array.prototype.forEach.call(col.children, function (c) {
      if (c !== el.boardscroll) used += c.offsetHeight + 12;
    });
    var availH = (col.clientHeight || 700) - used - 16;

    var rows = Math.max.apply(null, t.perks.map(function (p) { return p.row; }));
    var labelRoom = 48, rowFloorGap = 58;
    // Below the stacking breakpoint the page scrolls and the board may scroll
    // sideways, which changes what the layout is allowed to do to fit.
    var stacked = window.matchMedia('(max-width:1000px)').matches;
    // Rows may not go below what a two-line label needs, so when the column is
    // short it is the node that gives way, not the spacing.
    if (!stacked && rows > 1) {
      var fits = (availH - 56 - rowFloorGap * (rows - 1)) / rows;
      node = Math.max(52, Math.min(node, fits));
    }
    el.tree.style.setProperty('--node', node + 'px');
    el.tree.style.setProperty('--icon', Math.round(node * 0.5) + 'px');
    var pad = node / 2 + 38;

    var xs = [];
    t.perks.forEach(function (p) { if (xs.indexOf(p.x) < 0) xs.push(p.x); });
    xs.sort(function (a, b) { return a - b; });

    var gaps = [], total = 0, i;
    for (i = 1; i < xs.length; i++) { gaps.push(xs[i] - xs[i - 1]); total += xs[i] - xs[i - 1]; }
    var target = Math.max(availW - 2 * pad, 0);
    var widths = distribute(gaps, total, target, colmin, stacked);

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
    // Below the stacking breakpoint the page scrolls anyway, so let the board
    // keep its full row height instead of nesting a second scroller inside it.
    var rowH = cssPx('--row', 180);
    if (!stacked && rows > 1) {
      rowH = Math.max(node + rowFloorGap, Math.min(rowH, (availH - top - node / 2 - labelRoom) / (rows - 1)));
    }
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
    renderTree();
    renderAbilities();
    renderUltimates();
    renderPanel();
    renderMeters();
    renderOverview();
    writeHash();
  }

  function renderTabs() {
    el.tabs.innerHTML = TREES.map(function (t) {
      var mn = manualsNeeded(t);
      return '<button class="tab" role="tab" type="button" data-tree="' + t.name + '"' +
        ' aria-selected="' + (t.name === state.tab) + '">' +
        '<span class="tab-mark">' + Icons.svg(Icons.forTree(t.name)) + '</span>' + t.name +
        '<span class="tab-stat"><i class="s-sp"></i>' + spent(t) +
        (mn ? '<i class="s-bk"></i>' + mn : '') + '</span></button>';
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
      '<span class="frame"></span>' + Icons.svg(Icons.forNode(p.node_id), 'glyph') +
      badge + bang + '<span class="syn"></span>' +
      '<span class="pips">' + pips + '</span>' +
      '<span class="name" style="width:' + L.labelW + 'px">' + esc(p.name) + '</span></button>';
  }

  function renderAbilities() {
    var t = tree(), list = t.abilities || [];
    var learned = list.filter(function (a) { return lv(a.node_id) > 0; }).length;
    var pts = list.reduce(function (sum, a) {
      var n = lv(a.node_id), s = 0;
      for (var i = 0; i < n; i++) s += a.levels[i].skill_points;
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
        '<span class="abil-mark">' + Icons.svg(Icons.forAbility(a.name)) + '</span>' +
        '<span class="abil-txt"><b>' + esc(a.name) + '</b>' +
        '<span class="abil-use">' + esc(use) + '</span>' +
        '<span class="abil-eff">' + esc(a.effect) + '</span>' +
        '<span class="abil-foot"><span class="pips">' + pips + '</span>' +
        (nl ? '<span class="abil-next">' + costHTML(nl.skill_points, nl.time_segments, nl.gate) +
              (gateLabel(nl.gate) && nl.gate !== 'manual'
                ? '<span class="gate-tag">' + esc(gateLabel(nl.gate)) + '</span>' : '') + '</span>'
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

  function renderUltimates() {
    var t = tree(), prog = ultProgress(t), met = prog.every(function (x) { return x.met; });
    el.ultGate.className = 'ult-gate' + (met ? ' met' : '');
    el.ultGate.textContent = met
      ? 'Unlocked — ' + prog.map(function (x) { return x.text; }).join(' · ')
      : prog.filter(function (x) { return !x.met; })
            .map(function (x) { return x.text + ' — ' + x.have + '/' + x.n; }).join(' · ');

    el.ults.innerHTML = t.ultimates.map(function (u, i) {
      var on = state.ults[t.key] === i;
      return '<button class="ult' + (on ? ' on' : '') + (met ? '' : ' locked') + '" type="button"' +
        ' data-ult="' + i + '" aria-pressed="' + on + '">' +
        '<span class="ult-mark">' + Icons.svg(Icons.forUltimate(u.name)) + '</span><span>' +
        '<b>' + esc(u.name) + (u.alias ? '<span class="alias">also listed as ' + esc(u.alias) + '</span>' : '') + '</b>' +
        '<span class="ult-eff">' + esc(u.effect) + '</span>' +
        '<span class="ult-cost">' + costHTML(u.cost.skill_points, u.cost.time_segments, null) + '</span>' +
        '</span></button>';
    }).join('');
  }

  function costHTML(sp, ts, gate) {
    var out = [];
    if (sp) out.push('<span class="cost sp"><i></i>' + sp + '</span>');
    if (ts) out.push('<span class="cost ts"><i></i>' + ts + '</span>');
    if (gate === 'manual') out.push('<span class="cost bk"><i></i></span>');
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

    var synLine = state.synergy ? synergyHTML(id) : '';

    var levels = p.levels.map(function (l, i) {
      var owned = i < n, isNext = i === n;
      var blocked = !owned && (!gateOk(l.gate) || (isNext ? !learnable.ok : true));
      var tag = (l.gate && l.gate !== 'none' && !owned)
        ? '<span class="gate-tag">' + esc(gateLabel(l.gate)) + '</span>' : '';
      return '<li class="' + (owned ? 'on ' : '') + (isNext ? 'next ' : '') + (blocked ? 'blocked' : '') + '">' +
        '<span class="lp"></span><span class="lv-text">' + esc(l.effect) + '</span>' +
        '<span class="lv-meta">' + tag + costHTML(l.skill_points, l.time_segments, l.gate) + '</span></li>';
    }).join('');

    var btn = nl ? 'Learn level ' + nl.level : 'Fully learned';
    if (p.quest_unlock) btn = state.quests[id] ? 'Found' : 'Mark as found';

    el.panel.innerHTML =
      '<div class="panel-hero">' + Icons.svg(p.is_ability ? Icons.forAbility(p.name) : Icons.forNode(id)) +
        '<span class="hero-tree">' + esc(t.name) + '</span>' +
        '<span class="hero-lv">Level ' + n + ' / ' + p.max_level + '</span></div>' +
      '<div class="panel-body">' +
        (when ? '<p class="panel-when">' + esc(when) + '</p>' : '') +
        (nl && gateLabel(nl.gate) ? '<p class="panel-gate' + (gateOk(nl.gate) ? ' ok' : '') + '">' +
          esc(gateLabel(nl.gate)) + '</p>' : '') +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="desc">' + esc(p.effect) + '</p>' + reqLine + synLine +
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

    if (s.other.length) {
      html += '<details class="ov-sub"><summary>Conditional &amp; unique effects (' + s.other.length + ')</summary>' +
        '<ul class="ov-list">' + s.other.map(function (o) {
          return '<li><b>' + esc(o.perk) + '</b>' + esc(o.text) + '</li>';
        }).join('') + '</ul></details>';
    }
    if (s.manuals.length) {
      html += '<details class="ov-sub"><summary>Manuals to find (' + s.manuals.length + ')</summary>' +
        '<ul class="ov-list">' + s.manuals.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') +
        '</ul></details>';
    }
    if (s.phials.length) {
      html += '<details class="ov-sub"><summary>Phials of Vrakhir Blood (' + s.phials.length + ')</summary>' +
        '<ul class="ov-list">' + s.phials.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') +
        '</ul></details>';
    }
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
      renderAll(); toast('Build cleared.');
    });

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
    // Ultimates are a fixed section now, not a drawer, so only these two toggle.
    [el.ovdrawer, el.abildrawer].forEach(function (d) {
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
        var n = state.levels[id];
        while (n > 0 && !p.quest_unlock && !gateOk(p.levels[n - 1].gate)) { n--; changed = true; }
        if (n > 0 && !unlocked(p)) { n = 0; changed = true; }
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
      .filter(function (id) { return !(BY_ID[id] && BY_ID[id].quest_unlock); })
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
