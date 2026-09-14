import { claimFigures } from './render/claim-card.mjs';
import { normalizedDiagnostic } from './diagnostics.mjs';

const FIGURE = /\d[\d,]*(?:\.\d+)?/g;

// Unit labels ("m2", "CO2", "cases/week x2") are not figures. Strip the
// elements the renderer uses to hold them before extracting numerals, so a
// digit inside a unit label is never mistaken for an on-screen figure.
const UNIT_ELEMENT = /<(\w+)\b[^>]*class="[^"]*(?:vs-claim__unit|vs-hero__unit)[^"]*"[^>]*>[\s\S]*?<\/\1>/g;

function textOf(html) {
  return html
    .replace(/<[^>]*>/g, ' ')            // drop tags, taking attributes with them
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');  // drop entities
}

export function visibleFigures(html) {
  return [...textOf(html).matchAll(FIGURE)].map((m) => m[0]);
}

function stripUnitElements(html) {
  return html.replace(UNIT_ELEMENT, ' ');
}

function attrValue(attrs, name) {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

// The class-match must be part of the regex itself, not a post-filter: a
// post-filter would let a non-matching container (e.g. <section
// class="vs-chapter">) match generically first and swallow the vs-claim
// articles nested inside it before they could be matched individually.
const REGION = /<(article|section)\b([^>]*\bclass="[^"]*vs-(?:claim|hero)[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g;

// Every claim/hero region the renderer can produce, tagged with enough
// metadata (tag name, whether it belongs to a qualitative claim, which
// claim id it belongs to) to give targeted diagnostics below.
function reconcilableRegions(html) {
  const regions = [];
  for (const match of html.matchAll(REGION)) {
    const [, tag, attrs, body] = match;
    const classAttr = attrValue(attrs, 'class') || '';
    regions.push({
      tag,
      body,
      qualitative: classAttr.includes('vs-claim--qualitative'),
      claimId: attrValue(attrs, 'data-claim'),
    });
  }
  return regions;
}

// The region regex above is non-greedy: it stops at the FIRST closing tag
// of the same element name. If the captured body still contains an opening
// tag of that name, the real region boundary was missed and everything
// past the inner closing tag went unchecked — a silent false negative.
// Detect that and refuse to reconcile the region rather than trust it.
function isUnreliablyBounded(tag, body) {
  return new RegExp(`<${tag}\\b`, 'i').test(body);
}

export function reconcileDiagnostics(doc, html) {
  const claims = doc?.claims || [];
  const authorised = new Set(claims.flatMap(claimFigures));
  const claimIndex = new Map(claims.map((c, i) => [c?.id, i]));
  const seen = new Set();
  const out = [];

  for (const region of reconcilableRegions(html)) {
    if (isUnreliablyBounded(region.tag, region.body)) {
      out.push(normalizedDiagnostic({
        code: 'render/region-nested',
        severity: 'error',
        message: `A <${region.tag}> reconciliation region contains a nested <${region.tag}>, `
          + 'so its true boundary could not be determined and the figures inside it could not '
          + 'be verified.',
        subject: { tag: region.tag, claim: region.claimId },
        evidence: {},
        supportedFixes: [
          `remove the nested <${region.tag}> from inside this region`,
        ],
      }));
      continue;
    }

    const scannedBody = stripUnitElements(region.body);
    for (const figure of visibleFigures(scannedBody)) {
      if (authorised.has(figure) || seen.has(figure)) continue;
      seen.add(figure);

      if (region.qualitative) {
        const i = claimIndex.get(region.claimId);
        const tierPointer = i === undefined ? undefined : `/claims/${i}/tier`;
        out.push(normalizedDiagnostic({
          code: 'render/figure-untraced',
          message: `Figure ${JSON.stringify(figure)} appears in a qualitative claim's statement, `
            + 'but qualitative claims carry no authorised figures — this is an unsourced number '
            + 'on the page.',
          subject: { figure, qualitative: true, pointer: tierPointer },
          evidence: { authorised: [...authorised] },
          supportedFixes: [
            tierPointer
              ? `promote the claim by setting ${tierPointer} to "measured" or "estimated" and citing evidence for this figure`
              : 'promote the claim to "measured" or "estimated" and cite evidence for this figure',
            'reword the statement without the numeral',
          ],
        }));
        continue;
      }

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
