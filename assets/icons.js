/* Hand-drawn SVG glyphs. No game assets — every path is original line art
   chosen to read at 30px. GLYPHS maps a name to path data on a 24x24 grid;
   NODE_GLYPH maps each perk node id to one of those names. */
(function (global) {
  'use strict';

  var GLYPHS = {
    leaf:    'M12 21V9M12 9C7.5 9 4 6 3.5 3 8 3 11.5 5 12 9zM12 9c4.5 0 8-3 8.5-6C16 3 12.5 5 12 9z',
    coin:    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9.5 9.2A2.5 2.5 0 0 1 12 8c1.4 0 2.5.9 2.5 2s-1.1 2-2.5 2-2.5.9-2.5 2 1.1 2 2.5 2a2.5 2.5 0 0 0 2.5-1.2',
    shield:  'M12 2.5l7.5 3v6.2c0 4.4-3.1 7.7-7.5 9.8-4.4-2.1-7.5-5.4-7.5-9.8V5.5z',
    block:   'M12 2.5l7.5 3v6.2c0 4.4-3.1 7.7-7.5 9.8-4.4-2.1-7.5-5.4-7.5-9.8V5.5zM6.5 11h11M12 7.5v7',
    hex:     'M12 2l8.2 4.9v10.2L12 22l-8.2-4.9V6.9zM12 8l4 2.4v4.8L12 17.6l-4-2.4v-4.8z',
    sigil:   'M12 2l8.2 4.9v10.2L12 22l-8.2-4.9V6.9zM8 14.5L12 7l4 7.5zM9.5 12.5h5',
    flask:   'M9.5 2.5h5M10.5 2.5v6.2l-4.9 8.8a2 2 0 0 0 1.8 3h9.2a2 2 0 0 0 1.8-3l-4.9-8.8V2.5M7.2 15.5h9.6',
    vial:    'M9 2.5h6M10.5 2.5v14a1.5 1.5 0 0 0 3 0v-14M10.5 11.5h3',
    mortar:  'M3.5 9.5h17c0 4.7-3.8 8.5-8.5 8.5S3.5 14.2 3.5 9.5zM12 18v3.5M8 21.5h8M16.5 2.8L11 9',
    cauldron:'M3.5 9.5h17v2.8c0 4.2-3.8 7.7-8.5 7.7S3.5 16.5 3.5 12.3zM7.5 9.5L5 5M16.5 9.5L19 5M12 9.5V4',
    drop:    'M12 2.5s6.5 7.2 6.5 11a6.5 6.5 0 0 1-13 0c0-3.8 6.5-11 6.5-11zM9 14a3 3 0 0 0 3 3',
    chalice: 'M6.5 3.5h11l-1 5.5a4.5 4.5 0 0 1-9 0zM12 13.5v5.5M8 19h8M8.5 6.5h7',
    eye:     'M2 12s4.2-6.2 10-6.2S22 12 22 12s-4.2 6.2-10 6.2S2 12 2 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
    hourglass:'M6 2.5h12M6 21.5h12M7 2.5c0 5 5 6.2 5 9.5s-5 4.5-5 9.5M17 2.5c0 5-5 6.2-5 9.5s5 4.5 5 9.5M9 18.5h6',
    spiral:  'M12.5 12a2 2 0 1 1-2-2 4.5 4.5 0 1 1-4.5 4.5A7.5 7.5 0 1 1 13.5 7',
    waves:   'M3 8.5c2.5-3 5-3 7.5 0s5 3 7.5 0M3 13c2.5-3 5-3 7.5 0s5 3 7.5 0M3 17.5c2.5-3 5-3 7.5 0s5 3 7.5 0',
    heart:   'M12 20.5S3.5 15 3.5 9.2A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.6c0 5.8-8.5 11.3-8.5 11.3z',
    flame:   'M12 2c2.6 4 6 6.2 6 10.2a6 6 0 0 1-12 0c0-2 1-3.4 2.2-4.4 0 2 1 3.2 2 3.2 0-4 1.8-6 1.8-9z',
    sword:   'M13.5 3.5H20v6.5M20 3.5L11 12.5M7.5 13l3.5 3.5M4 20.5l3.7-3.7M5.8 14.7l3.5 3.5',
    swords:  'M4 3.5h3.5L18 14M20 3.5h-3.5L6 14M6.5 16.5L4 19l1 1.5 2.5-2.5M17.5 16.5L20 19l-1 1.5-2.5-2.5',
    muscle:  'M6 21v-4.5a4.5 4.5 0 0 1 4.5-4.5h2.2a3 3 0 0 0 3-3V4.6a2.3 2.3 0 1 1 4.6 0v5.6A8 8 0 0 1 12.3 18H11v3z',
    boot:    'M6 3.5h3.8v8.2h3.4l5.3 3.8v5H6z M9.8 11.7v-4',
    pack:    'M6 8h12v12.5H6zM9.5 8V5.5a2.5 2.5 0 0 1 5 0V8M9.5 12.5h5',
    focus:   'M12 2.5l4 4-4 4-4-4zM12 13.5l4 4-4 4-4-4zM12 9.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z',
    slots:   'M7 4l3 3-3 3-3-3zM17 4l3 3-3 3-3-3zM7 14l3 3-3 3-3-3zM17 14l3 3-3 3-3-3z',
    armor:   'M12 2.5L18.5 5v6.5c0 4.4-2.8 7.7-6.5 10-3.7-2.3-6.5-5.6-6.5-10V5zM12 5v15M8.5 9h7M8.5 13h7',
    crosshair:'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    arrow:   'M3.5 18.5l5.5-5.5 3.5 3.5 7-8.5M14 8h5.5v5.5',
    gauntlet:'M7 21.5V9.4a2 2 0 0 1 4 0V4.2a2 2 0 1 1 4 0v5.2a2 2 0 1 1 4 0v5.4a6.7 6.7 0 0 1-6.7 6.7zM7 12.5L4.5 15l2.5 3',
    star:    'M12 2.5l2.6 6.6 7 .5-5.4 4.5 1.7 6.9L12 17.3l-5.9 3.7 1.7-6.9L2.4 9.6l7-.5z',
    fang:    'M4.5 4h15l-1.5 5.5-6 12-6-12zM9 9h6',
    claw:    'M5 2.5c1 5 2 8 3 11M10 2c.6 5.2 1 8.5 1.3 11.6M15.5 3c-.3 5-.6 8.2-1 11.2M4 15c2.5 4.5 5.5 6.5 9 6.5s5.5-1.5 6.5-3.5',
    portal:  'M12 2.5c4.2 0 7.5 4.3 7.5 9.5s-3.3 9.5-7.5 9.5S4.5 17.2 4.5 12 7.8 2.5 12 2.5zM12 7c1.9 0 3.5 2.2 3.5 5s-1.6 5-3.5 5-3.5-2.2-3.5-5 1.6-5 3.5-5z',
    bat:     'M2 8.5c3-1.2 4.3.8 5.3 3 .8-4.2 2.6-6 4.7-6s3.9 1.8 4.7 6c1-2.2 2.3-4.2 5.3-3-2 2.2-2.8 5.3-4.8 6.8h-10.4C4.8 13.8 4 10.7 2 8.5zM12 5.5V3M10 3l2 2 2-2',
    ward:    'M12 21.5V9.5M12 9.5C8.5 9.5 6 7 5.5 3.5 9 3.5 11.5 6 12 9.5zM12 9.5c3.5 0 6-2.5 6.5-6-3.5 0-6 2.5-6.5 6zM8.5 21.5h7',
    book:    'M4 5a3 3 0 0 1 3-3h13v16.5H7a3 3 0 0 0-3 3zM7 2v16.5M10 6.5h6M10 10h6',
    lock:    'M6.5 10.5h11v10h-11zM9 10.5V7a3 3 0 0 1 6 0v3.5M12 14v3'
  };

  var NODE_GLYPH = {
    /* Witchcraft */
    W1:'leaf', W2:'coin', W3:'shield', W4:'hex', W5:'flask', W6:'mortar',
    W7:'sigil', W8:'hourglass', W9:'drop', W10:'cauldron', W11:'spiral',
    W12:'eye', W13:'heart', W14:'vial', W15:'book', W16:'waves',
    W17:'chalice', W18:'flame',
    /* Swordmastery */
    S1:'block', S2:'sword', S3:'muscle', S4:'heart', S5:'swords', S6:'shield',
    S7:'star', S8:'boot', S9:'pack', S10:'focus', S11:'armor', S12:'gauntlet',
    S13:'crosshair', S14:'slots', S15:'spiral', S16:'eye', S17:'arrow',
    S18:'hourglass', S19:'armor',
    /* Vampirism */
    V1:'chalice', V2:'fang', V3:'portal', V4:'claw', V5:'slots', V6:'drop',
    V7:'bat', V8:'portal', V9:'claw', V10:'drop', V11:'spiral', V12:'heart',
    V13:'ward', V14:'crosshair', V15:'hourglass', V16:'chalice', V17:'arrow'
  };

  var TREE_GLYPH = { Witchcraft:'sigil', Swordmastery:'sword', Vampirism:'fang' };

  var ULT_GLYPH = {
    'Arcane Cascade':'waves', 'Entwined Torment':'hex', 'Runic Bulwark':'shield',
    'Last Stand':'gauntlet', 'Sword Sage':'swords', 'Tactical Mastery':'focus',
    'Lethal Crescendo':'claw', 'Renounce Death':'heart', 'Sanguine Renewal':'chalice'
  };

  /* Returns an <svg> string for a glyph name, falling back to a rune mark. */
  function svg(name, cls) {
    var d = GLYPHS[name] || GLYPHS.hex;
    return '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') +
           ' aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  global.Icons = {
    glyphs: GLYPHS,
    forNode: function (id) { return NODE_GLYPH[id] || 'hex'; },
    forTree: function (n) { return TREE_GLYPH[n] || 'hex'; },
    forUltimate: function (n) { return ULT_GLYPH[n] || 'star'; },
    svg: svg
  };
})(window);
