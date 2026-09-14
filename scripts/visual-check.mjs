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

function graduatedFixes(overflowPx, selector) {
  if (overflowPx <= 80) {
    return [
      `tighten one gap or padding on ${selector} by 20-40px; do not remove content`,
      NEVER,
    ];
  }
  if (overflowPx < 200) {
    return [
      `reduce the column count or the fixed width of ${selector}, or let it wrap; do not remove content`,
      'if it is a table or a chart, shorten the longest label rather than the container',
      NEVER,
    ];
  }
  return [
    'move a supporting card out of this row and into the second chapter; do not shrink the hero numeral',
    `${selector} is over by ${overflowPx}px — that is a layout decision, not a padding tweak`,
    NEVER,
  ];
}

/**
 * Runs inside the page. Returns the measurement, plus the elements whose right
 * edge lies beyond the window — a finding that says "something overflows"
 * without saying WHAT is not actionable.
 */
function measure() {
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
 *   viewports: object[], findings: object[]}>}
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
  const url = pathToFileURL(path).href;

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      try {
        // `file://` only. Nothing is served, nothing is rewritten, nothing is
        // injected into the document.
        await page.goto(url, { waitUntil: 'load' });
        const m = await page.evaluate(measure);
        const label = `${viewport.width}x${viewport.height}`;
        measurements.push({ viewport: label, ...m });

        // The whole gate, in one comparison. Vertical extent is measured but
        // is NOT a finding: a long narrative is EXPECTED to scroll down, and a
        // gate that failed on that would fail every artifact this tool exists
        // to produce.
        if (m.scrollWidth <= m.innerWidth) continue;

        const overflowPx = m.scrollWidth - m.innerWidth;
        const widest = m.offenders[0];
        // The document can be wider than the window with no single element
        // reaching past it (a margin, a float). Say so rather than inventing a
        // selector.
        const selector = widest ? widest.selector : 'html (no single element reaches past the window)';

        findings.push({
          code: 'visual/horizontal-overflow',
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
            offenders: m.offenders,
          },
          supportedFixes: graduatedFixes(overflowPx, selector),
        });
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

  return { ok: findings.length === 0, path, sha256: after, viewports: measurements, findings };
}
