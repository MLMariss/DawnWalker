/* The Blood of Dawnwalker — skill tree planner.
   Reads data/perks.json and renders every tree from it; nothing about the
   perks is hard-coded here beyond the icon mapping in icons.js. */
(function () {
  'use strict';

  var DATA = null;          // parsed registry
  var TREES = [];           // [{name, key, perks, ultimates, ultimate_rule}]
  var BY_ID = {};           // node_id -> perk
  var TREE_OF = {};         // node_id -> tree
  var CHILDREN = {};        // node_id -> [perk] (from prerequisites)

  var state = {
    tab: null,
    sel: null,
    levels: {},             // node_id -> levels learned
    ults: {},               // tree key -> ultimate index
    quests: {},             // node_id -> true for story-unlocked nodes
    corruption: 15,
    manuals: true
  };

  var el = {
    tabs: document.getElementById('tabs'),
    tree: document.getElementById('tree'),
    links: document.getElementById('links'),
    nodes: document.getElementById('nodes'),
    ults: document.getElementById('ults'),
    ultGate: document.getElementById('ult-gate'),
    ultRule: document.getElementById('ult-rule'),
    panel: document.getElementById('panel'),
    toast: document.getElementById('toast'),
    corruption: document.getElementById('corruption'),
    corruptionOut: document.getElementById('corruption-out'),
    manuals: document.getElementById('manuals'),
    mSp: document.getElementById('m-sp'),
    mTs: document.getElementById('m-ts'),
    mBk: document.getElementById('m-bk')
  };

  /* ---------------------------------------------------------------- data */

  fetch('data/perks.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(boot)
    .catch(function (err) {
      el.panel.innerHTML =
        '<div class="panel-empty"><b>Could not load data/perks.json</b>' +
        'Browsers block fetch on <code>file://</code> URLs. Serve the folder instead:' +
        '<br><br><code>python3 -m http.server</code><br>then open ' +
        '<code>http://localhost:8000</code>.<br><br><small>' + esc(String(err)) + '</small></div>';
    });

  function boot(json) {
    DATA = json;
    Object.keys(DATA.trees).forEach(function (name) {
      var t = DATA.trees[name];
      var tree = {
        name: name, key: t.key, perks: t.perks,
        ultimates: t.ultimates, ultimate_rule: t.ultimate_rule
      };
      TREES.push(tree);
      t.perks.forEach(function (p) {
        BY_ID[p.node_id] = p;
        TREE_OF[p.node_id] = tree;
        CHILDREN[p.node_id] = CHILDREN[p.node_id] || [];
      });
      t.perks.forEach(function (p) {
        p.prerequisites.forEach(function (q) {
          (CHILDREN[q] = CHILDREN[q] || []).push(p);
        });
      });
    });

    state.tab = TREES[0].name;
    readHash();
    bindChrome();
    renderTabs();
    renderAll();
    window.addEventListener('resize', debounce(renderTree, 120));
  }

  /* --------------------------------------------------------------- rules */

  function lv(id) { return state.levels[id] || 0; }
  function tree() { return TREES.filter(function (t) { return t.name === state.tab; })[0]; }

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
    var c = corruptionOf(gate);
    return c === null ? true : state.corruption >= c;
  }

  function gateLabel(gate) {
    if (!gate || gate === 'none') return '';
    if (gate === 'manual') return 'Manual required';
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
      return { ok: false, why: 'Requires ' + p.prerequisites.map(nameOf).join(' and ') + '.' };
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
    if (state.ults[t.key] != null) {
      var after = spent(t) - p.levels[n - 1].skill_points;
      if (!ultMet(t, after)) return { ok: false, why: 'Deselect the ultimate perk first.' };
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

  /* Skill points spent on perks in a tree (ultimate cost excluded — the
     in-game unlock counter reads "Spend N to unlock" off perk points). */
  function spent(t) {
    return t.perks.reduce(function (sum, p) {
      var n = lv(p.node_id), s = 0;
      for (var i = 0; i < n; i++) s += p.levels[i].skill_points;
      return sum + s;
    }, 0);
  }

  function timeSpent(t) {
    var total = t.perks.reduce(function (sum, p) {
      var n = lv(p.node_id), s = 0;
      for (var i = 0; i < n; i++) s += p.levels[i].time_segments;
      return sum + s;
    }, 0);
    var u = state.ults[t.key];
    if (u != null) total += (t.ultimates[u].cost.time_segments || 0);
    return total;
  }

  function manualsUsed(t) {
    return t.perks.reduce(function (sum, p) {
      var n = lv(p.node_id), s = 0;
      for (var i = 0; i < n; i++) if (p.levels[i].gate === 'manual') s++;
      return sum + s;
    }, 0);
  }

  function ultReq(t) {
    var r = (t.ultimates[0] && t.ultimates[0].requirement) || '35 points in tree';
    var c = corruptionOf(r);
    if (c !== null) return { type: 'corruption', n: c, text: 'Corruption ' + c };
    var m = /(\d+)\s*points/i.exec(r);
    var n = m ? +m[1] : 35;
    return { type: 'points', n: n, text: 'Spend ' + n + ' in this tree' };
  }

  function ultMet(t, spentOverride) {
    var req = ultReq(t);
    if (req.type === 'corruption') return state.corruption >= req.n;
    return (spentOverride == null ? spent(t) : spentOverride) >= req.n;
  }

  function nameOf(id) { return BY_ID[id] ? BY_ID[id].name : id; }

  /* ------------------------------------------------------------- render */

  function renderAll() {
    renderTabs();
    renderTree();
    renderUltimates();
    renderPanel();
    renderMeters();
    writeHash();
  }

  function renderTabs() {
    el.tabs.innerHTML = TREES.map(function (t) {
      var on = t.name === state.tab;
      return '<button class="tab" role="tab" type="button" data-tree="' + t.name + '"' +
        ' aria-selected="' + on + '">' +
        '<span class="tab-mark">' + Icons.svg(Icons.forTree(t.name)) + '</span>' +
        t.name +
        '<span class="tab-count">' + spent(t) + '</span></button>';
    }).join('');
  }

  function metrics() {
    var css = getComputedStyle(document.documentElement);
    var node = parseFloat(css.getPropertyValue('--node')) || 74;
    var row = parseFloat(css.getPropertyValue('--row')) || 170;
    return { node: node, row: row, pad: 70, top: node / 2 + 24 };
  }

  function pos(p, m) {
    return { x: p.x * scaleX(m) + m.pad, y: m.top + (p.row - 1) * m.row };
  }

  /* Columns were captured at in-game pixel positions; squeeze them a little
     on narrow node sizes so labels keep their gutter. */
  function scaleX(m) { return m.node < 70 ? 0.82 : 1; }

  function renderTree() {
    var t = tree();
    if (!t) return;
    var m = metrics();
    var maxX = Math.max.apply(null, t.perks.map(function (p) { return p.x; }));
    var maxRow = Math.max.apply(null, t.perks.map(function (p) { return p.row; }));
    var w = maxX * scaleX(m) + m.pad * 2;
    var h = m.top + (maxRow - 1) * m.row + m.node / 2 + 46;

    el.tree.style.width = w + 'px';
    el.tree.style.height = h + 'px';

    // Scale the board down to the available width, but never so far that the
    // labels stop being readable — past that point the wrapper scrolls.
    var avail = document.getElementById('treescroll').clientWidth || w;
    var s = Math.max(0.6, Math.min(1, (avail - 6) / w));
    el.tree.style.transformOrigin = 'top left';
    el.tree.style.transform = s < 1 ? 'scale(' + s + ')' : 'none';
    el.tree.style.marginLeft = (s === 1 && avail > w) ? ((avail - w) / 2) + 'px' : '0';
    document.getElementById('treescroll').style.height = Math.ceil(h * s) + 'px';
    el.links.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    el.links.setAttribute('width', w);
    el.links.setAttribute('height', h);

    // links
    var paths = [];
    t.perks.forEach(function (child) {
      child.prerequisites.forEach(function (pid) {
        var parent = BY_ID[pid];
        if (!parent) return;
        var a = pos(parent, m), b = pos(child, m);
        var r = m.node / 2;
        var y1 = a.y + r, y2 = b.y - r;
        var d;
        if (Math.abs(a.x - b.x) < 2) {
          d = 'M' + a.x + ' ' + y1 + ' L' + b.x + ' ' + y2;
        } else {
          var my = y1 + (y2 - y1) * 0.45;
          d = 'M' + a.x + ' ' + y1 + ' L' + a.x + ' ' + my +
              ' L' + b.x + ' ' + my + ' L' + b.x + ' ' + y2;
        }
        var cls = 'link';
        if (lv(parent.node_id) >= 1) cls += lv(child.node_id) >= 1 ? ' done' : ' lit';
        paths.push('<path class="' + cls + '" d="' + d + '"/>');
      });
    });
    el.links.innerHTML = paths.join('');

    // nodes
    el.nodes.innerHTML = t.perks.map(function (p) { return nodeHTML(p, m); }).join('');
  }

  function nodeHTML(p, m) {
    var n = lv(p.node_id);
    var open = unlocked(p);
    var cls = ['node'];
    if (p.quest_unlock) cls.push('quest');
    if (n > 0) cls.push('taken');
    if (n >= p.max_level) cls.push('maxed');
    if (canLearn(p).ok) cls.push('avail');            // next level is affordable now
    else if (!open) cls.push('locked');               // prerequisites unmet
    else if (n < p.max_level) cls.push('gated');      // unlocked, but the level is gated
    if (state.sel === p.node_id) cls.push('selected');

    var pips = '';
    for (var i = 0; i < p.max_level; i++) {
      pips += '<span class="pip' + (i < n ? ' on' : '') + '"></span>';
    }

    var badge = '';
    if (p.quest_unlock && !state.quests[p.node_id]) {
      badge = '<svg class="badge lock" viewBox="0 0 24 24"><path d="' + Icons.glyphs.lock + '"/></svg>';
    } else if (p.levels.some(function (l, i) { return l.gate === 'manual' && i >= n; })) {
      badge = '<svg class="badge" viewBox="0 0 24 24"><path d="' + Icons.glyphs.book + '"/></svg>';
    }

    var pt = pos(p, m);
    return '<button class="' + cls.join(' ') + '" type="button" data-node="' + p.node_id + '"' +
      ' style="left:' + pt.x + 'px;top:' + pt.y + 'px"' +
      ' aria-label="' + esc(p.name) + ', level ' + n + ' of ' + p.max_level + '">' +
      '<span class="frame"></span><span class="disc"></span>' +
      Icons.svg(Icons.forNode(p.node_id)) + badge +
      '<span class="pips">' + pips + '</span>' +
      '<span class="name">' + esc(p.name) + '</span></button>';
  }

  function renderUltimates() {
    var t = tree();
    var req = ultReq(t);
    var met = ultMet(t);
    var have = req.type === 'corruption' ? state.corruption : spent(t);

    el.ultRule.textContent = t.ultimate_rule || '';
    el.ultGate.className = 'ult-gate' + (met ? ' met' : '');
    el.ultGate.textContent = met
      ? 'Unlocked — ' + req.text
      : req.text + ' — ' + have + '/' + req.n;

    el.ults.innerHTML = t.ultimates.map(function (u, i) {
      var on = state.ults[t.key] === i;
      return '<button class="ult' + (on ? ' on' : '') + (met ? '' : ' locked') + '" type="button"' +
        ' data-ult="' + i + '" aria-pressed="' + on + '">' +
        '<span class="ult-mark">' + Icons.svg(Icons.forUltimate(u.name)) + '</span>' +
        '<span><b>' + esc(u.name) + '</b><span>' + esc(u.effect) + '</span>' +
        '<span class="ult-cost">' + costHTML(u.cost.skill_points, u.cost.time_segments, null) +
        '</span></span></button>';
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
    var nl = nextLevel(p);
    var learnable = canLearn(p);
    var refundable = canRefund(p);

    var gate = nl ? gateLabel(nl.gate) : '';
    var gateOkNow = nl ? gateOk(nl.gate) : true;

    var reqLine = '';
    if (p.quest_unlock) {
      reqLine = '<p class="req"><b>Story unlock.</b> No skill point or time cost — ' +
        (state.quests[id] ? 'marked as found.' : 'click the node to mark it found.') + '</p>';
    } else if (p.prerequisites.length) {
      reqLine = '<p class="req">Requires <b>' + p.prerequisites.map(function (q) {
        return esc(nameOf(q)) + (lv(q) ? ' ✓' : '');
      }).join('</b> and <b>') + '</b></p>';
    }

    var levels = p.levels.map(function (l, i) {
      var owned = i < n;
      var isNext = i === n;
      var blocked = !owned && (!gateOk(l.gate) || (isNext ? !learnable.ok : true));
      var tag = l.gate && l.gate !== 'none' && !owned
        ? '<span class="gate-tag">' + esc(gateLabel(l.gate)) + '</span>' : '';
      return '<li class="' + (owned ? 'on ' : '') + (isNext ? 'next ' : '') + (blocked ? 'blocked' : '') + '">' +
        '<span class="lp"></span>' +
        '<span class="lv-text">' + esc(l.effect) + '</span>' +
        '<span class="lv-meta">' + tag + costHTML(l.skill_points, l.time_segments, l.gate) + '</span></li>';
    }).join('');

    var btnLabel = nl ? 'Learn level ' + nl.level : 'Fully learned';
    if (p.quest_unlock) btnLabel = state.quests[id] ? 'Found' : 'Mark as found';

    el.panel.innerHTML =
      '<div class="panel-hero">' + Icons.svg(Icons.forNode(id)) +
        '<span class="hero-tree">' + esc(t.name) + '</span>' +
        '<span class="hero-lv">Level ' + n + ' / ' + p.max_level + '</span></div>' +
      '<div class="panel-body">' +
        (gate ? '<p class="panel-gate' + (gateOkNow ? ' ok' : '') + '">' + esc(gate) + '</p>' : '') +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="desc">' + esc(p.effect) + '</p>' + reqLine +
        '<ul class="levels">' + levels + '</ul>' +
      '</div>' +
      '<div class="panel-foot">' +
        '<button class="btn btn-learn" type="button" data-act="learn"' +
          (p.quest_unlock ? '' : (learnable.ok ? '' : ' disabled')) + '>' + btnLabel + '</button>' +
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
      ts += timeSpent(t);
      bk += manualsUsed(t);
    });
    el.mSp.textContent = sp;
    el.mTs.textContent = ts;
    el.mBk.textContent = bk;
  }

  /* ------------------------------------------------------------- events */

  function bindChrome() {
    el.tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tree]');
      if (!b) return;
      state.tab = b.dataset.tree;
      state.sel = null;
      renderAll();
    });

    el.nodes.addEventListener('click', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b) return;
      var p = BY_ID[b.dataset.node];
      state.sel = p.node_id;
      if (p.quest_unlock) {
        state.quests[p.node_id] = !state.quests[p.node_id];
        if (!state.quests[p.node_id]) delete state.levels[p.node_id];
        else state.levels[p.node_id] = 1;
      } else {
        learn(p);
      }
      var byKeyboard = e.detail === 0;   // Enter/Space rather than a pointer
      renderAll();
      if (byKeyboard) focusNode(p.node_id); else revealPanel();
    });

    el.nodes.addEventListener('contextmenu', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b) return;
      e.preventDefault();
      var p = BY_ID[b.dataset.node];
      state.sel = p.node_id;
      if (p.quest_unlock) {
        state.quests[p.node_id] = false;
        delete state.levels[p.node_id];
      } else {
        refund(p);
      }
      renderAll();
    });

    el.nodes.addEventListener('mouseover', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b || state.sel === b.dataset.node) return;
      state.sel = b.dataset.node;
      renderPanel();
      markSelected();
    });

    el.nodes.addEventListener('keydown', function (e) {
      var b = e.target.closest('[data-node]');
      if (!b) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        refund(BY_ID[b.dataset.node]);
        renderAll();
        focusNode(b.dataset.node);
      }
    });

    el.ults.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ult]');
      if (!b) return;
      var t = tree(), i = +b.dataset.ult;
      if (!ultMet(t)) { toast(ultReq(t).text + ' before choosing an ultimate.', true); return; }
      state.ults[t.key] = state.ults[t.key] === i ? undefined : i;
      if (state.ults[t.key] === undefined) delete state.ults[t.key];
      renderAll();
    });

    el.panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || !state.sel) return;
      var p = BY_ID[state.sel];
      if (b.dataset.act === 'learn') {
        if (p.quest_unlock) { state.quests[p.node_id] = true; state.levels[p.node_id] = 1; }
        else learn(p);
      } else {
        if (p.quest_unlock) { state.quests[p.node_id] = false; delete state.levels[p.node_id]; }
        else refund(p);
      }
      renderAll();
    });

    el.corruption.addEventListener('input', function () {
      state.corruption = +el.corruption.value;
      el.corruptionOut.textContent = state.corruption;
      dropInvalid();
      renderAll();
    });

    el.manuals.addEventListener('change', function () {
      state.manuals = el.manuals.checked;
      dropInvalid();
      renderAll();
    });

    document.getElementById('reset').addEventListener('click', function () {
      state.levels = {}; state.ults = {}; state.quests = {}; state.sel = null;
      renderAll();
      toast('Build cleared.');
    });

    document.getElementById('share').addEventListener('click', function () {
      writeHash();
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
          function () { toast('Build link copied.'); },
          function () { toast('Copy failed — the link is in the address bar.', true); }
        );
      } else {
        toast('The build link is in the address bar.');
      }
    });

    window.addEventListener('hashchange', function () {
      if (writingHash) return;
      readHash();
      renderAll();
    });

    el.corruption.value = state.corruption;
    el.corruptionOut.textContent = state.corruption;
    el.manuals.checked = state.manuals;
  }

  /* On narrow layouts the detail panel sits below the board, so a tap on a
     node would otherwise update something off-screen. */
  function revealPanel() {
    if (window.matchMedia('(min-width:1101px)').matches) return;
    el.panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function markSelected() {
    Array.prototype.forEach.call(el.nodes.children, function (b) {
      b.classList.toggle('selected', b.dataset.node === state.sel);
    });
  }

  function focusNode(id) {
    var b = el.nodes.querySelector('[data-node="' + id + '"]');
    if (b) b.focus();
  }

  /* Levels can become illegal when corruption drops or manuals switch off —
     peel them back from the top so the build stays legal. */
  function dropInvalid() {
    var changed = true;
    while (changed) {
      changed = false;
      Object.keys(state.levels).forEach(function (id) {
        var p = BY_ID[id];
        if (!p) { delete state.levels[id]; changed = true; return; }
        var n = state.levels[id];
        while (n > 0 && !gateOk(p.levels[n - 1].gate) && !p.quest_unlock) { n--; changed = true; }
        if (n > 0 && !unlocked(p)) { n = 0; changed = true; }
        if (n) state.levels[id] = n; else delete state.levels[id];
      });
      TREES.forEach(function (t) {
        if (state.ults[t.key] != null && !ultMet(t)) { delete state.ults[t.key]; changed = true; }
      });
    }
  }

  /* --------------------------------------------------------- build links */

  var writingHash = false;

  function writeHash() {
    var parts = ['1', 'c' + state.corruption, 'm' + (state.manuals ? 1 : 0)];
    var picks = Object.keys(state.levels).filter(function (id) {
      return !(BY_ID[id] && BY_ID[id].quest_unlock);
    }).sort().map(function (id) { return id + '.' + state.levels[id]; });
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
      else if (k === 'p') {
        v.split(',').forEach(function (pair) {
          var a = pair.split('.'), p = BY_ID[a[0]];
          if (p) state.levels[a[0]] = clamp(+a[1] || 0, 0, p.max_level);
        });
      } else if (k === 'q') {
        v.split(',').forEach(function (id) { if (BY_ID[id]) { state.quests[id] = true; state.levels[id] = 1; } });
      } else if (k === 'u') {
        v.split(',').forEach(function (pair) {
          var a = pair.split('.');
          var t = TREES.filter(function (x) { return x.key === a[0]; })[0];
          if (t) state.ults[a[0]] = clamp(+a[1] || 0, 0, t.ultimates.length - 1);
        });
      } else if (k === 't') {
        var tt = TREES.filter(function (x) { return x.key === v; })[0];
        if (tt) state.tab = tt.name;
      }
    });
    if (el.corruption) { el.corruption.value = state.corruption; el.corruptionOut.textContent = state.corruption; }
    if (el.manuals) el.manuals.checked = state.manuals;
    dropInvalid();
  }

  /* --------------------------------------------------------------- util */

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
    toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, 2600);
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
})();
