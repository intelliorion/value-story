import { claimFigures } from './render/claim-card.mjs';
import { normalizedDiagnostic } from './diagnostics.mjs';

const FIGURE = /\d[\d,]*(?:\.\d+)?/g;

function textOf(html) {
  return html
    .replace(/<[^>]*>/g, ' ')            // drop tags, taking attributes with them
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');  // drop entities
}

export function visibleFigures(html) {
  return [...textOf(html).matchAll(FIGURE)].map((m) => m[0]);
}

function reconcilableRegions(html) {
  const regions = [];
  const re = /<(article|section)\b[^>]*class="[^"]*vs-(?:claim|hero)[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
  for (const match of html.matchAll(re)) regions.push(match[2]);
  return regions;
}

export function reconcileDiagnostics(doc, html) {
  const authorised = new Set((doc?.claims || []).flatMap(claimFigures));
  const seen = new Set();
  const out = [];

  for (const region of reconcilableRegions(html)) {
    for (const figure of visibleFigures(region)) {
      if (authorised.has(figure) || seen.has(figure)) continue;
      seen.add(figure);
      out.push(normalizedDiagnostic({
        code: 'render/figure-untraced',
        message: `Figure ${JSON.stringify(figure)} appears on screen but no claim authorises it.`,
        subject: { figure },
        evidence: { authorised: [...authorised] },
        supportedFixes: [
          'add a claim to /claims that carries this figure',
          'remove the figure from the rendered content',
        ],
      }));
    }
  }
  return out;
}
