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
    lock:    'M6.5 10.5h11v10h-11zM9 10.5V7a3 3 0 0 1 6 0v3.5M12 14v3',

    /* Per-node marks, drawn for one node each rather than shared. */
    sickleLeaf:  'M18.5 5.5A11.5 11.5 0 0 1 7 17M15.8 7.9A8.2 8.2 0 0 1 9.2 14.4M7 17l-3.2 3.4M12.6 5.4c1.5-2.1 3.5-2.4 5.2-1-1.3 1.9-3.3 2.2-5.2 1z',
    sunEye:      'M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8zM12 1.4v2.4M12 20.2v2.4M1.4 12h2.4M19.8 12h2.8M4.4 4.4l1.8 1.8M17.8 17.8l1.8 1.8M19.6 4.4l-1.8 1.8M6.2 17.8l-1.8 1.8M8.3 12s1.6-2.3 3.7-2.3S15.7 12 15.7 12s-1.6 2.3-3.7 2.3S8.3 12 8.3 12z',
    wardEye:     'M12 3.2l7 2.6v5.8c0 4.1-2.8 7.2-7 9.2-4.2-2-7-5.1-7-9.2V5.8zM8.8 11s1.4-1.9 3.2-1.9 3.2 1.9 3.2 1.9-1.4 1.9-3.2 1.9S8.8 11 8.8 11zM5 5.8C3.1 4.5 2.4 2.9 2.9 1.4c1.7.5 2.8 1.7 3.2 3.1M19 5.8c1.9-1.3 2.6-2.9 2.1-4.4-1.7.5-2.8 1.7-3.2 3.1',
    palmEye:     'M6.6 21.2v-6.6a1.5 1.5 0 0 1 3 0V6.4a1.5 1.5 0 0 1 3 0v6.2M12.6 12.6V5.6a1.5 1.5 0 0 1 3 0v7M15.6 12.6V8.2a1.5 1.5 0 0 1 3 0v6.8a6.2 6.2 0 0 1-6.2 6.2H9.6M9.4 16.6s1.3-1.7 2.9-1.7 2.9 1.7 2.9 1.7-1.3 1.7-2.9 1.7-2.9-1.7-2.9-1.7z',
    mortarPestle:'M4.4 10.6h15.2c0 4.3-3.4 7.6-7.6 7.6s-7.6-3.3-7.6-7.6zM3.4 9.1h17.2M12 18.2v2.2M8.4 20.6h7.2M18.6 2.4a1.9 1.9 0 0 1 0 3.2l-4.8 4.9',
    shears:      'M6.2 3.4l8.6 11.2M17.8 3.4L9.2 14.6M6.4 16.8a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM17.6 16.8a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM14.8 14.6l2 2.8M9.2 14.6l-2 2.8',
    sigilPillar: 'M12 6.6a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6zM12 6.6v14.2M8.2 10.4h7.6M9.4 14.4h5.2M5.2 4.4C3.2 7.1 3.2 15.1 5.2 19.8M18.8 4.4c2 2.7 2 10.7 0 15.4',
    hornedSkull: 'M12 4.2c3.3 0 6 2.5 6 5.5 0 2-1 3.4-2.2 4.2l-.3 2.2H8.5l-.3-2.2C7 13.1 6 11.7 6 9.7c0-3 2.7-5.5 6-5.5zM9.6 9.6a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM14.4 9.6a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM6.3 6.6C4.4 5.6 3.4 3.9 3.4 2.1c1.8.3 3.2 1.4 4 3M17.7 6.6c1.9-1 2.9-2.7 2.9-4.5-1.8.3-3.2 1.4-4 3M5.4 17.6l13.2 3.6M18.6 17.6L5.4 21.2',
    bindings:    'M5.6 7.4l12.8 9.2M18.4 7.4L5.6 16.6M10.1 10.6l3.8 2.3M9.5 12.4l3.8 2.3M12 2.2v4M10.1 3.9h3.8',
    alembic:     'M8 3.4h8l-1 3.6a3 3 0 0 1-6 0zM12 7v2.2M12 9.2v11.2M8.6 11.8h6.8M8.6 14.8h6.8M8.6 17.8h6.8M9.2 20.4h5.6',
    eyeFlow:     'M7.8 12s1.8-2.4 4.2-2.4 4.2 2.4 4.2 2.4-1.8 2.4-4.2 2.4S7.8 12 7.8 12zM12 10.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM6.2 7.8C3.7 5.3 3.1 3.6 3.6 2c2 .9 3.4 2.6 4 4.4M17.8 7.8c2.5-2.5 3.1-4.2 2.6-5.8-2 .9-3.4 2.6-4 4.4M6.2 16.2c-2.5 2.5-3.1 4.2-2.6 5.8 2-.9 3.4-2.6 4-4.4M17.8 16.2c2.5 2.5 3.1 4.2 2.6 5.8-2-.9-3.4-2.6-4-4.4',
    burstFlame:  'M12 5.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zM12 1.3l1.7 3.5h-3.4zM12 22.7l-1.7-3.5h3.4zM1.3 12l3.5-1.7v3.4zM22.7 12l-3.5 1.7v-3.4zM12 8.4c1.5 2 3 3 3 5a3 3 0 0 1-6 0c0-1 .5-1.8 1.2-2.4 0 1 .5 1.6 1 1.6 0-2 .8-3 .8-4.2z',
    branches:    'M12 21.2V10.8M12 10.8C9.5 9.8 8 7.8 8 5.3c2.4.3 4 2 4 5.5zM12 10.8c2.5-1 4-3 4-5.5-2.4.3-4 2-4 5.5zM12 14.2c-1.8-.8-3-2-3.5-3.6M12 16.8c1.8-.8 3-2 3.5-3.6M9.4 21.2h5.2',
    potted:      'M6.8 14.4h10.4M8.2 14.4h7.6l-1 5.8H9.2zM12 14.4V9M12 9c-2-.5-3.3-2-3.5-4.1 2 .2 3.3 1.7 3.5 4.1zM12 9c2-.5 3.3-2 3.5-4.1-2 .2-3.3 1.7-3.5 4.1zM12 15.9l1.7 2.9h-3.4z',
    bannerSkull: 'M9.8 8.6c3 0 5.5 2.2 5.5 4.9 0 1.8-.9 3.1-2 3.8l-.3 2.2H6.6l-.3-2.2c-1.1-.7-2-2-2-3.8 0-2.7 2.5-4.9 5.5-4.9zM7.7 13.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM11.9 13.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM18.2 20.6V3M18.2 3.6h4.4l-1.4 2.2 1.4 2.2h-4.4',
    spiralCoil:  'M12.9 12a1.9 1.9 0 1 1-1.9-1.9 4.1 4.1 0 1 1-4.1 4.1 6.9 6.9 0 1 1 6.9-6.9M3.4 7.2c2.4-3 4.9-3 6 0M20.6 16.8c-2.4 3-4.9 3-6 0',
    bloodStar:   'M12 2.8s3.8 4.6 3.8 7a3.8 3.8 0 0 1-7.6 0c0-2.4 3.8-7 3.8-7zM12 14.6l1.8 2.6 3-.6-1.4 2.7 1.4 2.7-3-.6-1.8 2.6-1.8-2.6-3 .6 1.4-2.7-1.4-2.7 3 .6z',
    flameSkull:  'M12 9.4c3.2 0 5.8 2.4 5.8 5.2 0 1.9-1 3.3-2.2 4l-.3 2.2H8.7l-.3-2.2c-1.2-.7-2.2-2.1-2.2-4 0-2.8 2.6-5.2 5.8-5.2zM9.9 14.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM14.1 14.7a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM12 8.1c0-2.5 1.6-4 1.6-6.1 1.9 2 3.1 3.6 3.1 5.6M9.1 8c-.9-1.6-.5-3.3.5-4.5.2 1.6 1 2.5 1.7 2.9M6.6 8.4c-.7-1.2-.5-2.5.3-3.5'
  };

  var NODE_GLYPH = {
    /* Witchcraft */
    W1:'sickleLeaf', W2:'sunEye', W3:'wardEye', W4:'palmEye',
    W5:'mortarPestle', W6:'shears', W7:'sigilPillar', W8:'hornedSkull',
    W9:'bindings', W10:'alembic', W11:'eyeFlow', W12:'burstFlame',
    W13:'branches', W14:'potted', W15:'bannerSkull', W16:'spiralCoil',
    W17:'bloodStar', W18:'flameSkull',
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

  /* Abilities are keyed by name — there are 27 of them and they change less
     often than the perk grid. */
  var ABILITY_GLYPH = {
    'Astral Communion':'star', 'Burning Blood':'flame', 'Compel Soul':'ward',
    'Cycle of Ruin':'spiral', 'Life Lock':'shield', 'Mercurial Fervour':'boot',
    'Ravenous Flock':'bat', 'Soul Reaping':'drop', 'Soul Stigma':'eye',
    'Unholy Vitality':'heart',
    'Adrenaline Rush':'muscle', 'Artery Strike':'sword', 'Broad Swing':'swords',
    'Charge':'arrow', 'Dirty Trick':'gauntlet', 'Swiftness':'boot',
    'Walking Fortress':'block',
    'Blood Surge':'waves', 'Crimson Rush':'chalice', 'Death From Above':'claw',
    'Mesmerise':'eye', 'Piercing Shriek':'waves', 'Scarlet Shield':'shield',
    'Shadowstorm':'hourglass', 'Shapeshift':'fang', 'Shred':'claw',
    'Voracious Bite':'fang'
  };

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

  /* A node's mark is the game's icon where one has been built, and the drawn
     glyph otherwise — the abilities have no icon files, so they stay on glyphs.
     The mask is painted with currentColor so every board state still tints it.
     The path is relative to assets/styles.css, not to the page: the custom
     property is substituted into a mask declaration there, and that is what the
     URL resolves against. 'assets/marks/...' here would ask for
     assets/assets/marks/... and 404. */
  function has(id) {
    return !!(global.MARKS && global.MARKS.indexOf(id) !== -1);
  }

  function mark(id, glyphName, cls) {
    if (!has(id)) return svg(glyphName, cls);
    return '<i class="mark' + (cls ? ' ' + cls : '') + '" aria-hidden="true"' +
           ' style="--mark:url(\'marks/' + id + '.png\')"></i>';
  }

  global.Icons = {
    glyphs: GLYPHS,
    forNode: function (id) { return NODE_GLYPH[id] || 'hex'; },
    forTree: function (n) { return TREE_GLYPH[n] || 'hex'; },
    forUltimate: function (n) { return ULT_GLYPH[n] || 'star'; },
    forAbility: function (n) { return ABILITY_GLYPH[n] || 'hex'; },
    svg: svg,
    hasMark: has,
    /* id is a node id; the glyph name is the fallback when no mask exists. */
    mark: mark,
    forNodeMark: function (id, cls) { return mark(id, NODE_GLYPH[id] || 'hex', cls); },
    forUltMark: function (key, i, cls, name) {
      return mark('U' + key + i, ULT_GLYPH[name] || 'star', cls);
    }
  };
})(window);
