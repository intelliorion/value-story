/**
 * `visual-check` — the gate.
 *
 * Everything else this tool proves is deterministic: the schema validates, the
 * invariants hold, the figures trace. None of it says whether the artifact is
 * READABLE on a real screen. This measures that, in a real browser, at three
 * real sizes — and measures the DELIVERED file, not a fresh render of it.
 *
 * It does not claim the artifact is good. Spec §6.6: `deliver` proves the
 * deterministic checks, `visual-check` proves bounded behaviour in a browser,
 * and whether the artifact lands is a human judgement the tool never makes.
 *
 * Playwright is a devDependency and is imported DYNAMICALLY, so that importing
 * this module — or running any other `vs` command — costs nothing and works
 * with an empty node_modules. `dependencies` stays `{}`.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { normalizedDiagnostic } from '../src/diagnostics.mjs';

/** Spec §6.5. Three desk-class sizes, widest last. */
export const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 1600, height: 1000 }),
  Object.freeze({ width: 1920, height: 1080 }),
]);

const INSTALL_HINT = 'Playwright is required by `vs visual-check` and is not installed.\n'
  + 'It is a devDependency, deliberately: the renderer, validator and CLI all run without it.\n'
  + 'Install it with:  npm install --save-dev playwright\n'
  + 'Then install its browser with:  npx playwright install chromium';

/**
 * Counterfeit passes are prohibited by name (spec §6.5). Every fix says what
 * NOT to do, because the cheapest way to make an overflow finding disappear is
 * to hide the content that overflows — which is a worse artifact reported as a
 * better one.
 */
const NEVER = 'do not add overflow:hidden, clip the content, introduce an internal scroller, '
  + 'or reduce the typography — those hide the overflow instead of resolving it';

/**
 * Spec §6.5: the hero delta must clear the first screen at EVERY checked size.
 *
 * Not just the smallest. "The smallest is binding anyway" is an assumption about
 * the CSS, not a property of the check — `--vs-hero-unit` is
 * `clamp(1rem, 1.5vw, 1.5rem)`, which does not saturate until 1600px, so
 * hero-adjacent sizing genuinely differs between 1440 and 1600/1920. The
 * difference is a couple of pixels against ~600px of headroom today, which is
 * exactly why it must not be assumed: it costs nothing to measure, and the
 * assumption becomes load-bearing the moment a layout reflows for real.
 */
export const HERO_SELECTOR = '.vs-hero__figures';

/**
 * WCAG 2.1 SC 1.4.3. Large text is 18pt (24px), or 14pt (18.66px) when bold —
 * the real rule, not the rounded-to-18px simplification.
 */
export const CONTRAST_NORMAL = 4.5;
export const CONTRAST_LARGE = 3;

/**
 * How many contrast failures and collisions are reported per viewport. A gate
 * that prints two hundred lines is a gate nobody reads; the count of what was
 * withheld is reported alongside, so nothing is silently dropped.
 */
const MAX_REPORTED = 5;

/**
 * Entry animations move and fade the very elements the fold and contrast checks
 * measure. Measuring mid-flight would report a transient position as a defect,
 * so the page is allowed to settle first — bounded, because a looping animation
 * (which the motion budget forbids, but a broken artifact may still carry)
 * would otherwise hang the gate.
 */
const SETTLE_MS = 2000;
async function settle(page) {
  await page.evaluate((limit) => {
    const animations = typeof document.getAnimations === 'function' ? document.getAnimations() : [];
    const finished = animations.map((a) => a.finished.catch(() => {}));
    return Promise.race([
      Promise.all(finished),
      new Promise((done) => { setTimeout(done, limit); }),
    ]);
  }, SETTLE_MS);
}

/**
 * Spec §6.5. The band is keyed on the MEASURED pixels, because the right
 * repair for 20px over and the right repair for 400px over are not the same
 * action at different intensities — they are different actions, and the
 * strongest one is "stop and report".
 *
 * Each band names what NOT to do. A repair instruction that only says what to
 * try invites an agent to delete content until the number goes down, which is
 * how a gate gets satisfied by destroying the thing it was protecting.
 */
function overflowRepair(overflowPx, selector, label) {
  if (overflowPx <= 40) {
    return {
      band: '<=40px',
      fixes: [
        `tighten one gap or padding on ${selector} by 20-40px; do not remove content`,
        NEVER,
      ],
    };
  }
  if (overflowPx <= 200) {
    return {
      band: '41-200px',
      fixes: [
        `move a supporting element to the next chapter: take one card out of the row ${selector} sits in; do not shrink the hero numeral`,
        `${overflowPx}px is one element too many for this row, not a padding error — do not squeeze every element to absorb it`,
        NEVER,
      ],
    };
  }
  return {
    band: '>200px',
    fixes: [
      `${selector} is ${overflowPx}px past the ${label} window: the layout is wrong for this content, and the honest action is to report it rather than compressing it`,
      'do not scale, condense or crop the page to bring the number down; a layout that only fits after compression is a worse artifact reported as a better one',
      NEVER,
    ],
  };
}

const CONTRAST_NEVER = 'do not lower the threshold, exempt the element, or drop the text to a '
  + 'decorative role — those retire the requirement instead of meeting it';

function contrastFixes(failure) {
  const shortfall = Math.round((failure.threshold - failure.ratio) * 100) / 100;
  const fixes = [
    'the palette is centralised in src/render/tokens.mjs: change the token this element resolves to, '
      + 'not a per-element override — an override patches one instance of a palette defect and leaves the defect',
    `lift ${failure.selector} off ${failure.color} toward a lighter step of the same token ramp, `
      + `or darken ${failure.background}; it needs ${shortfall} more of ratio to reach ${failure.threshold}:1`,
  ];
  if (!failure.largeText && failure.fontSizePx >= 16) {
    fixes.push(`or take ${failure.selector} to 24px (or 18.66px at weight 700), which moves it to the `
      + '3:1 large-text threshold on its own merits — a real typographic decision, not a waiver');
  }
  if (failure.backgroundKind === 'gradient') {
    fixes.push(`the background here is a gradient; ${failure.background} is the colour under this `
      + 'element’s own box, so moving the element along the band is also a fix');
  }
  fixes.push(CONTRAST_NEVER);
  return fixes;
}

const COLLISION_NEVER = 'do not add overflow:hidden, z-index, or a background swatch to cover the '
  + 'overlap — those hide the collision instead of resolving it';

/** Graduated on the overlap itself: a graze is a spacing bug, a large overlap is a layout bug. */
function collisionRepair(pair) {
  const area = pair.overlap.width * pair.overlap.height;
  if (area <= 600) {
    return {
      band: 'graze',
      fixes: [
        `separate ${pair.a} and ${pair.b}: give the row ${pair.overlap.height + 8}px more vertical room, `
          + 'or let the longer label wrap instead of running into its neighbour',
        'if one of them is a chart label, move the label outside the mark rather than over it',
        COLLISION_NEVER,
      ],
    };
  }
  return {
    band: 'overlap',
    fixes: [
      `${pair.a} and ${pair.b} are competing for the same ${pair.overlap.width}x${pair.overlap.height}px of the page: `
        + 'move one of them onto its own row, or into the next chapter',
      'do not shrink either label to make them fit — a collision resolved by making the text unreadable is not resolved',
      COLLISION_NEVER,
    ],
  };
}

const FOLD_NEVER = 'do not shrink the hero numeral and do not clip the band — the delta is the one thing '
  + 'the reader must see before scrolling, and a smaller one that fits is a worse artifact reported as a better one';

/** Graduated on the overshoot: a near miss is padding, a long push is a chapter in the wrong place. */
function foldRepair(hero) {
  const overshoot = hero.bottom - hero.innerHeight;
  if (overshoot <= 120) {
    return {
      band: '<=120px',
      fixes: [
        `raise ${hero.selector} by ${overshoot}px: tighten the chapter padding above it by 20-40px, `
          + 'or move a meta row below the hero',
        FOLD_NEVER,
      ],
    };
  }
  return {
    band: '>120px',
    fixes: [
      `${overshoot}px of material stands between the top of the page and ${hero.selector}: move the block above `
        + 'it below the hero rather than compressing the gap — this is a chapter in the wrong order, not a padding error',
      FOLD_NEVER,
    ],
  };
}

/**
 * Runs inside the page. One pass, one context, four measurements: horizontal
 * overflow, text contrast, text collision, and whether the hero delta clears
 * the first screen.
 *
 * Everything here is measurement. Nothing is judged; the decisions are taken in
 * Node from the numbers this returns. A finding that says "something overflows"
 * without saying WHAT is not actionable, so every measurement names its
 * element.
 *
 * @param {{heroSelector: string, aboveFold: boolean, maxReported: number}} opts
 */
function measure(opts) {
  const { heroSelector, aboveFold, maxReported } = opts;

  const selectorFor = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const classes = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (classes.length) part += `.${classes.join('.')}`;
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ') || 'html';
  };

  // --- colour -------------------------------------------------------------
  // getComputedStyle serialises colours as rgb()/rgba(), in both the legacy
  // comma form and the modern space+slash form. Anything else — color(),
  // oklch(), a keyword we do not know — returns null and becomes a RECORDED
  // SKIP rather than a guess: a plausible-but-wrong colour is worse than no
  // measurement at all.
  const parseColor = (value) => {
    if (!value) return null;
    const text = String(value).trim().toLowerCase();
    if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    const m = text.match(/^rgba?\(([^)]*)\)$/);
    if (!m) return null;
    const bits = m[1].split(/[\s,/]+/).filter((s) => s !== '');
    if (bits.length < 3) return null;
    const num = (s, scale) => (/%$/.test(s) ? (parseFloat(s) / 100) * scale : parseFloat(s));
    const r = num(bits[0], 255);
    const g = num(bits[1], 255);
    const b = num(bits[2], 255);
    const a = bits.length > 3 ? num(bits[3], 1) : 1;
    if ([r, g, b, a].some((n) => !Number.isFinite(n))) return null;
    return { r, g, b, a };
  };

  const css = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

  // WCAG 2.1 relative luminance and contrast ratio.
  //
  // The branch threshold is 0.04045, KNOWINGLY not the 0.03928 the published
  // WCAG 2.1 text literally prints. 0.04045 is the continuity-consistent value
  // (the point where the linear and power segments actually meet), it is what
  // the sRGB specification and every production checker use, and the two
  // diverge only for 8-bit channel values around 10. Written down because an
  // undocumented deviation from the spec's literal text reads as a typo.
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const contrastRatio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  // source-over: `fg`, which may be translucent, painted onto an opaque `bg`.
  const over = (fg, bg) => ({
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
    a: 1,
  });

  const WHITE = { r: 255, g: 255, b: 255, a: 1 };

  // --- background resolution ----------------------------------------------
  // Walk ancestors until something is fully opaque, compositing every
  // translucent layer on the way up. `body` is where this ENDS, not where it
  // starts: an element over a band inherits the band, not the page ground.
  const resolveBackground = (el) => {
    const layers = [];
    let node = el;
    let guard = 0;
    while (node && guard < 200) {
      guard += 1;
      const cs = getComputedStyle(node);
      const image = cs.backgroundImage;
      if (image && image !== 'none') return { kind: 'image', node, cs, layers };
      const c = parseColor(cs.backgroundColor);
      if (!c) return { kind: 'unparseable', node, value: cs.backgroundColor, layers };
      if (c.a > 0) {
        layers.push(c);
        if (c.a >= 0.999) return { kind: 'color', node, layers };
      }
      node = node.parentElement;
    }
    // Nothing opaque anywhere up the tree: the canvas. Chromium paints white.
    return { kind: 'canvas', node: null, layers };
  };

  const flatten = (layers, base) => {
    let bg = base;
    for (let i = layers.length - 1; i >= 0; i -= 1) bg = over(layers[i], bg);
    return bg;
  };

  // --- gradients -----------------------------------------------------------
  // A gradient has no single colour, so there is nothing honest to compare a
  // ratio against unless we know WHICH PART of it the text sits on. The rule
  // adopted here: resolve the axis-aligned vertical case EXACTLY — map the
  // text's own top and bottom onto the gradient line and sample only that
  // slice, worst sample wins — and SKIP everything else with a recorded
  // reason. Taking the first colour stop would be a plausible-but-wrong
  // measurement; taking the whole gradient's worst point would report a colour
  // the text never touches, which is a false positive by construction.
  const splitTop = (text) => {
    const out = [];
    let depth = 0;
    let current = '';
    for (const ch of text) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        out.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim() !== '') out.push(current.trim());
    return out;
  };

  const gradientBackground = (bgNode, cs, textBox) => {
    const image = cs.backgroundImage.trim();
    if (!image.startsWith('linear-gradient(') || !image.endsWith(')')) {
      return { skip: `it is not a single linear-gradient (${image.slice(0, 40)})` };
    }
    const inner = image.slice('linear-gradient('.length, -1);
    if (/gradient\(|url\(|image\(|cross-fade\(|element\(/i.test(inner)) {
      return { skip: 'it layers more than one gradient, or an image' };
    }
    if (cs.backgroundSize !== 'auto' || cs.backgroundRepeat !== 'repeat'
      || cs.backgroundOrigin !== 'padding-box' || cs.backgroundAttachment !== 'scroll') {
      return { skip: 'it is sized, tiled or attached in a way this check cannot map' };
    }

    const parts = splitTop(inner);
    if (!parts.length) return { skip: 'it has no arguments' };
    let downward = true;
    if (/deg$|^to\s/.test(parts[0])) {
      const d = parts.shift().trim();
      if (d === 'to bottom' || d === '180deg') downward = true;
      else if (d === 'to top' || d === '0deg') downward = false;
      else return { skip: `it runs at "${d}" and only vertical gradients are mapped` };
    }

    const box = bgNode.getBoundingClientRect();
    const padTop = box.top + parseFloat(cs.borderTopWidth || '0');
    const padHeight = box.height
      - parseFloat(cs.borderTopWidth || '0')
      - parseFloat(cs.borderBottomWidth || '0');
    if (!(padHeight > 0)) return { skip: 'its box has no height' };

    const stops = [];
    for (const part of parts) {
      const colorMatch = part.match(/^(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)/i);
      if (!colorMatch) return { skip: `a colour stop could not be read ("${part}")` };
      const color = parseColor(colorMatch[1]);
      if (!color) return { skip: `a colour stop could not be read (${colorMatch[1]})` };
      if (color.a < 0.999) return { skip: 'it has translucent colour stops' };
      const rest = part.slice(colorMatch[1].length).trim();
      const positions = rest === '' ? [] : rest.split(/\s+/);
      if (positions.length > 1) return { skip: 'a colour stop declares two positions' };
      let pos = null;
      if (positions.length === 1) {
        if (/%$/.test(positions[0])) pos = parseFloat(positions[0]) / 100;
        else if (/px$/.test(positions[0])) pos = parseFloat(positions[0]) / padHeight;
        else return { skip: `a stop position could not be read (${positions[0]})` };
      }
      stops.push({ color, pos });
    }
    if (stops.length < 2) return { skip: 'it has fewer than two colour stops' };

    if (stops[0].pos === null) stops[0].pos = 0;
    if (stops[stops.length - 1].pos === null) stops[stops.length - 1].pos = 1;
    for (let i = 1; i < stops.length - 1; i += 1) {
      if (stops[i].pos !== null) continue;
      let j = i;
      while (stops[j].pos === null) j += 1;
      const span = (stops[j].pos - stops[i - 1].pos) / (j - (i - 1));
      for (let k = i; k < j; k += 1) stops[k].pos = stops[i - 1].pos + span * (k - (i - 1));
    }
    for (let i = 1; i < stops.length; i += 1) stops[i].pos = Math.max(stops[i].pos, stops[i - 1].pos);

    const at = (t) => {
      const last = stops[stops.length - 1];
      if (t <= stops[0].pos) return stops[0].color;
      if (t >= last.pos) return last.color;
      for (let i = 1; i < stops.length; i += 1) {
        if (t > stops[i].pos) continue;
        const a = stops[i - 1];
        const b = stops[i];
        const span = b.pos - a.pos;
        const f = span <= 0 ? 0 : (t - a.pos) / span;
        return {
          r: a.color.r + (b.color.r - a.color.r) * f,
          g: a.color.g + (b.color.g - a.color.g) * f,
          b: a.color.b + (b.color.b - a.color.b) * f,
          a: 1,
        };
      }
      return last.color;
    };

    const clamp01 = (n) => Math.min(1, Math.max(0, n));
    let t0 = clamp01((textBox.top - padTop) / padHeight);
    let t1 = clamp01((textBox.bottom - padTop) / padHeight);
    if (!downward) {
      const lo = 1 - t1;
      const hi = 1 - t0;
      t0 = lo;
      t1 = hi;
    }
    const samples = [];
    const STEPS = 20;
    for (let i = 0; i <= STEPS; i += 1) samples.push(at(t0 + ((t1 - t0) * i) / STEPS));
    return { samples };
  };

  // --- what counts as text -------------------------------------------------
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'META', 'LINK', 'BR']);
  // Only elements with their OWN rendered text. An empty <div> has no contrast
  // problem, and an ancestor is not re-measured for its descendant's words.
  const hasOwnText = (el) => {
    for (const child of el.childNodes) {
      if (child.nodeType === 3 && child.nodeValue.trim() !== '') return true;
    }
    return false;
  };
  // An inline element that wraps across lines has a bounding box covering every
  // line it touches, which makes two ordinary siblings in one paragraph look
  // like they overlap. The per-line boxes are what is actually painted.
  const rectsOf = (el) => Array.prototype.map
    .call(el.getClientRects(), (r) => ({
      top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height,
    }))
    .filter((r) => r.width > 0 && r.height > 0);

  const opacityUpTo = (el, stop) => {
    let product = 1;
    let node = el;
    let guard = 0;
    while (node && node !== stop && guard < 200) {
      guard += 1;
      const o = parseFloat(getComputedStyle(node).opacity);
      if (Number.isFinite(o)) product *= o;
      node = node.parentElement;
    }
    return product;
  };

  const textNodes = [];
  for (const el of document.querySelectorAll('body, body *')) {
    if (SKIP_TAGS.has(el.tagName ? String(el.tagName).toUpperCase() : '')) continue;
    if (!hasOwnText(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') continue;
    const rects = rectsOf(el);
    if (!rects.length) continue;
    textNodes.push({ el, cs, rects });
    if (textNodes.length >= 600) break;
  }

  // --- contrast ------------------------------------------------------------
  const contrastFailures = [];
  const contrastSkipped = [];
  for (const { el, cs, rects } of textNodes) {
    const selector = selectorFor(el);
    const note = (reason) => {
      if (contrastSkipped.length < 20) contrastSkipped.push({ selector, reason });
    };

    if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') {
      note('the glyphs are painted from the element’s own background (background-clip: text)');
      continue;
    }
    const isSvg = el.namespaceURI === 'http://www.w3.org/2000/svg';
    const rawColor = isSvg ? cs.fill : cs.color;
    if (isSvg && (!rawColor || rawColor === 'none')) {
      note('svg text with no solid fill');
      continue;
    }
    const color = parseColor(rawColor);
    if (!color) {
      note(`the text colour could not be read (${rawColor})`);
      continue;
    }

    const bg = resolveBackground(el.parentElement || el);
    if (bg.kind === 'unparseable') {
      note(`the background colour could not be read (${bg.value})`);
      continue;
    }

    const box = rects.reduce((acc, r) => ({
      top: Math.min(acc.top, r.top),
      bottom: Math.max(acc.bottom, r.bottom),
    }), { top: Infinity, bottom: -Infinity });

    let backgrounds;
    let backgroundKind;
    const backgroundNode = bg.node;
    if (bg.kind === 'image') {
      const gradient = gradientBackground(bg.node, bg.cs, box);
      if (gradient.skip) {
        note(`the background is an image this check does not resolve: ${gradient.skip}`);
        continue;
      }
      const behind = resolveBackground(bg.node.parentElement || bg.node);
      if (behind.kind === 'image' || behind.kind === 'unparseable') {
        note('the gradient sits on another image or an unreadable colour');
        continue;
      }
      const base = flatten(behind.layers, WHITE);
      backgrounds = gradient.samples.map((s) => (s.a >= 0.999 ? s : over(s, base)));
      backgroundKind = 'gradient';
    } else {
      backgrounds = [flatten(bg.layers, WHITE)];
      backgroundKind = bg.kind === 'canvas' ? 'canvas' : 'color';
    }

    // Element opacity BETWEEN the text and whatever provides its background
    // genuinely fades the glyphs toward that background. Opacity at or above
    // the background node fades both together and is deliberately not counted.
    const fade = opacityUpTo(el, backgroundNode || document.documentElement);
    const alpha = color.a * (Number.isFinite(fade) ? fade : 1);
    if (alpha <= 0.001) {
      note('the text is fully transparent');
      continue;
    }

    const fontSize = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    // WCAG 2.1: large text is 18pt (24px), or 14pt (18.66px) when bold.
    const large = fontSize >= 24 - 1e-6 || (fontSize >= 18.66 - 1e-6 && weight >= 700);
    const threshold = large ? 3 : 4.5;

    let worst = null;
    for (const candidate of backgrounds) {
      const painted = over({ r: color.r, g: color.g, b: color.b, a: alpha }, candidate);
      const ratio = contrastRatio(painted, candidate);
      if (worst === null || ratio < worst.ratio) worst = { ratio, background: candidate, painted };
    }
    if (!worst || worst.ratio >= threshold) continue;

    contrastFailures.push({
      selector,
      color: css(worst.painted),
      declaredColor: rawColor,
      background: css(worst.background),
      backgroundKind,
      backgroundSelector: backgroundNode ? selectorFor(backgroundNode) : 'the page canvas',
      ratio: Math.round(worst.ratio * 100) / 100,
      threshold,
      fontSizePx: Math.round(fontSize * 100) / 100,
      fontWeight: weight,
      largeText: large,
    });
  }
  contrastFailures.sort((a, b) => a.ratio - b.ratio);

  // --- collision -----------------------------------------------------------
  const collisions = [];
  for (let i = 0; i < textNodes.length; i += 1) {
    for (let j = i + 1; j < textNodes.length; j += 1) {
      const a = textNodes[i];
      const b = textNodes[j];
      // A parent always contains its child. Text-bearing ancestors and their
      // descendants overlap BY DEFINITION and are never a collision.
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      let worst = null;
      for (const ra of a.rects) {
        for (const rb of b.rects) {
          const width = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const height = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          // More than 2px on BOTH axes. A 2px touch is not a collision.
          if (width <= 2 || height <= 2) continue;
          if (worst && worst.width * worst.height >= width * height) continue;
          worst = {
            x: Math.round(Math.max(ra.left, rb.left) + window.scrollX),
            y: Math.round(Math.max(ra.top, rb.top) + window.scrollY),
            width: Math.round(width),
            height: Math.round(height),
          };
        }
      }
      if (worst) collisions.push({ a: selectorFor(a.el), b: selectorFor(b.el), overlap: worst });
    }
  }
  collisions.sort((x, y) => y.overlap.width * y.overlap.height - x.overlap.width * x.overlap.height);

  // --- the hero, above the fold --------------------------------------------
  let hero = null;
  if (aboveFold) {
    const el = document.querySelector(heroSelector);
    if (!el) {
      // Legitimate and correct: an outcome carried by qualitative claims alone
      // has no hero delta. Skipping is the only honest result — failing here
      // would flag correct behaviour as a defect.
      hero = { present: false, reason: `no element matches ${heroSelector}: this artifact has no hero delta` };
    } else {
      const rect = el.getBoundingClientRect();
      hero = {
        present: true,
        selector: selectorFor(el),
        top: Math.round(rect.top + window.scrollY),
        bottom: Math.round(rect.bottom + window.scrollY),
        innerHeight: window.innerHeight,
      };
    }
  }

  const root = document.documentElement;
  const innerWidth = window.innerWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const right = Math.round(rect.right + window.scrollX);
    if (right > innerWidth) {
      offenders.push({ selector: selectorFor(el), right, width: Math.round(rect.width) });
    }
  }
  // Widest first: the element that actually reaches furthest is the one worth
  // naming; the others are usually the same overflow reported again.
  offenders.sort((a, b) => b.right - a.right || b.width - a.width);

  return {
    innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: root.scrollWidth,
    scrollHeight: root.scrollHeight,
    offenders: offenders.slice(0, 3),
    textElements: textNodes.length,
    // The cap is deliberate; reporting the CAPPED count as though it were the
    // whole count is not. `total` travels with every truncated payload so a
    // consumer reading the array alone cannot mistake five for all there is.
    contrast: {
      failures: contrastFailures.slice(0, maxReported),
      reported: Math.min(contrastFailures.length, maxReported),
      total: contrastFailures.length,
      truncated: Math.max(0, contrastFailures.length - maxReported),
      skipped: contrastSkipped,
    },
    collisions: {
      pairs: collisions.slice(0, maxReported),
      reported: Math.min(collisions.length, maxReported),
      total: collisions.length,
      truncated: Math.max(0, collisions.length - maxReported),
    },
    hero,
  };
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function clean(message) {
  const error = new Error(message);
  // The CLI prints `error.message`. Nothing here should ever reach a user as a
  // Node module-resolution stack trace.
  error.vsClean = true;
  return error;
}

/**
 * @param {string} htmlPath  the DELIVERED artifact. Never re-rendered, never
 *   re-validated, never written to.
 * @param {object} [options]
 * @param {Array<{width:number,height:number}>} [options.viewports]
 * @param {object} [options.browser]  an already-launched Playwright browser, so
 *   a caller checking several artifacts pays for one launch, not N.
 * @param {() => Promise<any>} [options.loadPlaywright]  seam for tests.
 * @returns {Promise<{ok: boolean, path: string, sha256: string,
 *   viewports: object[], findings: object[],
 *   summary: {reported: number, total: number, truncated: number, cap: number,
 *     byCode: Array<{code: string, reported: number, total: number, truncated: number}>}}>}
 */
export async function visualCheck(htmlPath, options = {}) {
  const {
    viewports = VIEWPORTS,
    browser: providedBrowser = null,
    loadPlaywright = () => import('playwright'),
  } = options;

  const path = resolve(htmlPath);

  let before;
  try {
    before = sha256(path);
  } catch (error) {
    throw clean(`the artifact could not be read: ${path} (${error.code || error.message})`);
  }

  let browser = providedBrowser;
  let ownsBrowser = false;
  if (!browser) {
    let chromium;
    try {
      ({ chromium } = await loadPlaywright());
    } catch {
      // Deliberately not re-thrown: ERR_MODULE_NOT_FOUND with a resolver stack
      // tells a user nothing they can act on.
      throw clean(INSTALL_HINT);
    }
    try {
      browser = await chromium.launch();
      ownsBrowser = true;
    } catch (error) {
      throw clean(`${INSTALL_HINT}\n\nthe browser could not be launched: ${String(error.message).split('\n')[0]}`);
    }
  }

  const measurements = [];
  const findings = [];
  // code -> { reported, total }. `total` is what was MEASURED; `reported` is
  // what survived the per-viewport cap. The gap between them is the whole
  // point of this tally.
  const tally = new Map();
  const count = (code, reported, total) => {
    const row = tally.get(code) || { reported: 0, total: 0 };
    row.reported += reported;
    row.total += total;
    tally.set(code, row);
  };
  const url = pathToFileURL(path).href;

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      try {
        // `file://` only. Nothing is served, nothing is rewritten, nothing is
        // injected into the document.
        await page.goto(url, { waitUntil: 'load' });
        await settle(page);
        const m = await page.evaluate(measure, {
          heroSelector: HERO_SELECTOR,
          aboveFold: true,
          maxReported: MAX_REPORTED,
        });
        const label = `${viewport.width}x${viewport.height}`;
        measurements.push({ viewport: label, ...m });

        // Carried into EVERY finding of a capped family, so a reader who sees
        // one finding still sees how many there were.
        const disclosure = (payload) => ({
          reported: payload.reported,
          total: payload.total,
          truncated: payload.truncated,
        });

        // --- contrast ---------------------------------------------------
        count('layout/contrast', m.contrast.reported, m.contrast.total);
        for (const failure of m.contrast.failures) {
          findings.push(normalizedDiagnostic({
            code: 'layout/contrast',
            severity: 'error',
            message: `At ${label} the text of ${failure.selector} is ${failure.ratio}:1 against its `
              + `background, below the ${failure.threshold}:1 WCAG 2.1 threshold for `
              + `${failure.largeText ? 'large' : 'normal'} text `
              + `(${failure.fontSizePx}px, weight ${failure.fontWeight}). `
              + `Text ${failure.color} on ${failure.background}, resolved from `
              + `${failure.backgroundSelector}${failure.backgroundKind === 'gradient' ? ' (a gradient, sampled under this element’s own box)' : ''}.`
              + (m.contrast.truncated > 0
                ? ` ${m.contrast.reported} of ${m.contrast.total} contrast failures are reported at this viewport.`
                : ''),
            subject: { viewport: label, selector: failure.selector },
            evidence: {
              viewportWidth: viewport.width,
              viewportHeight: viewport.height,
              ...failure,
              ...disclosure(m.contrast),
            },
            supportedFixes: contrastFixes(failure),
          }));
        }

        // --- collision --------------------------------------------------
        count('layout/collision', m.collisions.reported, m.collisions.total);
        for (const pair of m.collisions.pairs) {
          const repair = collisionRepair(pair);
          findings.push(normalizedDiagnostic({
            code: 'layout/collision',
            severity: 'error',
            message: `At ${label} the text of ${pair.a} overlaps the text of ${pair.b} by `
              + `${pair.overlap.width}x${pair.overlap.height}px at (${pair.overlap.x}, ${pair.overlap.y}).`
              + (m.collisions.truncated > 0
                ? ` ${m.collisions.reported} of ${m.collisions.total} collisions are reported at this viewport.`
                : ''),
            subject: { viewport: label, selector: pair.a },
            evidence: {
              viewportWidth: viewport.width,
              viewportHeight: viewport.height,
              ...pair,
              band: repair.band,
              ...disclosure(m.collisions),
            },
            supportedFixes: repair.fixes,
          }));
        }

        // --- the hero, above the fold -----------------------------------
        // `m.hero.present` is false when the artifact legitimately has no hero
        // delta, which is a SKIP with a recorded reason and never a finding.
        if (m.hero && m.hero.present && m.hero.bottom > m.hero.innerHeight) {
          const repair = foldRepair(m.hero);
          count('layout/hero-below-fold', 1, 1);
          findings.push(normalizedDiagnostic({
            code: 'layout/hero-below-fold',
            severity: 'error',
            message: `At ${label} the hero delta ${m.hero.selector} ends at ${m.hero.bottom}px, `
              + `past the ${m.hero.innerHeight}px first screen. `
              + 'The reader has to scroll before seeing the number the artifact exists to carry.',
            subject: { viewport: label, selector: m.hero.selector },
            evidence: {
              viewportWidth: viewport.width,
              viewportHeight: viewport.height,
              selector: m.hero.selector,
              top: m.hero.top,
              bottom: m.hero.bottom,
              innerHeight: m.hero.innerHeight,
              overshootPx: m.hero.bottom - m.hero.innerHeight,
              band: repair.band,
              reported: 1,
              total: 1,
              truncated: 0,
            },
            supportedFixes: repair.fixes,
          }));
        }

        // The whole of Task 20's gate, in one comparison. Vertical extent is
        // measured but is NOT a finding: a long narrative is EXPECTED to
        // scroll down, and a gate that failed on that would fail every
        // artifact this tool exists to produce.
        if (m.scrollWidth <= m.innerWidth) continue;

        const overflowPx = m.scrollWidth - m.innerWidth;
        const widest = m.offenders[0];
        // The document can be wider than the window with no single element
        // reaching past it (a margin, a float). Say so rather than inventing a
        // selector.
        const selector = widest ? widest.selector : 'html (no single element reaches past the window)';
        const repair = overflowRepair(overflowPx, selector, label);
        count('layout/overflow', 1, 1);

        findings.push(normalizedDiagnostic({
          code: 'layout/overflow',
          severity: 'error',
          message: `At ${label} the page is ${overflowPx}px wider than the window: `
            + `document.documentElement.scrollWidth is ${m.scrollWidth}px against window.innerWidth ${m.innerWidth}px. `
            + `The widest offending element is ${selector}`
            + (widest ? ` (${widest.width}px wide, right edge at ${widest.right}px).` : '.'),
          subject: { viewport: label, selector },
          evidence: {
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            innerWidth: m.innerWidth,
            scrollWidth: m.scrollWidth,
            overflowPx,
            band: repair.band,
            offenders: m.offenders,
            reported: 1,
            total: 1,
            truncated: 0,
          },
          supportedFixes: repair.fixes,
        }));
      } finally {
        await context.close();
      }
    }
  } finally {
    if (ownsBrowser) await browser.close();
  }

  // Spec §6.5 is explicit that this gate INSPECTS the artifact rather than
  // regenerating it. Asserted, not assumed: if the byte content moved, the
  // result is worthless and saying so is the only honest option.
  const after = sha256(path);
  if (after !== before) {
    throw clean(`the artifact changed while it was being checked: ${path}\n`
      + `  before: ${before}\n  after:  ${after}\n`
      + 'visual-check inspects the delivered file and must never modify it; the result has been discarded.');
  }

  // `findings.length` alone is a misleading number whenever anything was
  // capped: nine different artifacts all reporting 15 look equally bad when
  // they are not. The summary states reported AGAINST measured, per code.
  const byCode = [...tally.entries()]
    .filter(([, row]) => row.total > 0)
    .map(([code, row]) => ({
      code, reported: row.reported, total: row.total, truncated: row.total - row.reported,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const total = byCode.reduce((n, row) => n + row.total, 0);
  const summary = {
    reported: findings.length,
    total,
    truncated: total - findings.length,
    cap: MAX_REPORTED,
    byCode,
  };

  return {
    ok: findings.length === 0, path, sha256: after, viewports: measurements, findings, summary,
  };
}
