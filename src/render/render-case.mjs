import { page, esc } from './html.mjs';
import { tokensToCss } from './tokens.mjs';
import { CLAIM_CARD_CSS, normalizeTier } from './claim-card.mjs';
import { heroDelta, HERO_CSS } from './delta.mjs';
import { constellation, CONSTELLATION_CSS } from './constellation.mjs';
import { chapters, CHAPTERS_CSS } from './chapters.mjs';
import { MOTION_CSS, MOTION_OFF_CSS, motionProfile } from './motion.mjs';

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--vs-bg);color:var(--vs-ink);
  font-family:var(--vs-font-text);font-size:var(--vs-body);
  -webkit-font-smoothing:antialiased}
/* D2: one centred measure. Sections stay full-bleed so a band can span the
   viewport; everything readable sits inside a .vs-wrap. */
.vs-wrap{width:100%;max-width:var(--vs-measure);margin:0 auto;
  padding:0 var(--vs-gutter)}
.vs-meta{padding:calc(var(--vs-unit)*4) 0 0}
.vs-meta__row{display:flex;justify-content:space-between;align-items:baseline;
  gap:calc(var(--vs-unit)*3);flex-wrap:wrap;
  border-bottom:1px solid var(--vs-rule);padding-bottom:calc(var(--vs-unit)*2)}
.vs-meta__item{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.18em;color:var(--vs-ink-dim);margin:0}
.vs-drivers{padding:var(--vs-chapter) 0;border-bottom:1px solid var(--vs-rule)}
.vs-drivers h2{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.18em;color:var(--vs-ink-dim);margin:0}
.vs-evidence{padding:var(--vs-chapter) 0 calc(var(--vs-chapter)*1.4)}
.vs-evidence h2{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.18em;color:var(--vs-ink-dim);margin:0}
.vs-evidence ol{list-style:none;margin:calc(var(--vs-unit)*3) 0 0;padding:0;
  display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));
  gap:0 calc(var(--vs-unit)*8)}
.vs-evidence li{border-top:1px solid var(--vs-rule);
  padding:calc(var(--vs-unit)*2) 0;font-size:var(--vs-small);
  color:var(--vs-ink-dim);line-height:1.55}
.vs-evidence strong{color:var(--vs-ink);font-weight:600}
@media print{
  body{background:var(--vs-print-bg);color:var(--vs-print-ink)}
  .vs-evidence li{border-top:1px solid var(--vs-print-rule)}
}
`;

function evidenceList(evidence = []) {
  if (!evidence.length) return '';
  const items = evidence.map((e) => `<li id="ev-${esc(e.ref)}">
<strong>${esc(e.title)}</strong> &mdash; ${esc(e.kind)}, ${esc(e.date)}${e.locator ? `, ${esc(e.locator)}` : ''}
</li>`).join('\n');
  return `<section class="vs-evidence"><div class="vs-wrap">
<h2>Evidence</h2><ol>${items}</ol>
</div></section>`;
}

function metaRow(doc) {
  const left = [doc?.initiative?.name, doc?.initiative?.function]
    .filter(Boolean).map(esc).join(' &middot; ');
  const right = [doc?.meta?.period ? `Period ${doc.meta.period}` : '', doc?.initiative?.status]
    .filter(Boolean).map(esc).join(' &middot; ');
  return `<div class="vs-meta"><div class="vs-wrap vs-meta__row">
<p class="vs-meta__item">${left}</p>
<p class="vs-meta__item">${right}</p>
</div></div>`;
}

function pickHeroClaim(doc, claimsById) {
  const refs = doc?.arc?.outcome?.claim_refs || [];
  const referenced = refs.map((r) => claimsById.get(r)).filter(Boolean);
  // normalizeTier is the single authority on what a claim's tier IS; every
  // other renderer routes through it, and comparing `c.tier` raw here would
  // re-derive the same semantics in a second place.
  return referenced.find((c) => normalizeTier(c) === 'measured')
    || referenced.find((c) => normalizeTier(c) === 'estimated')
    || null;
}

export function renderCase(doc) {
  const claimsById = new Map((doc.claims || []).map((c) => [c.id, c]));
  const hero = pickHeroClaim(doc, claimsById);
  const styles = [
    tokensToCss(), BASE_CSS, HERO_CSS, CHAPTERS_CSS, CLAIM_CARD_CSS, CONSTELLATION_CSS,
    // A `static` profile omits the entry animations AND disables whatever any
    // other stylesheet declared, so the promise does not depend on compliance.
    motionProfile(doc) === 'static' ? MOTION_OFF_CSS : MOTION_CSS,
  ].join('\n');

  const heroHtml = heroDelta(hero, {
    headline: doc.arc?.outcome?.headline,
    evidence: doc.evidence,
  });

  const body = `<main>
${metaRow(doc)}
${heroHtml}
${chapters(doc.arc, claimsById, { outcomeHeadlineInHero: heroHtml !== '' })}
<section class="vs-drivers"><div class="vs-wrap">
<h2>Value drivers claimed</h2>
${constellation(doc.drivers)}
</div></section>
${evidenceList(doc.evidence)}
</main>`;

  return page({ title: doc.meta?.title || doc.initiative?.name || 'Value Story', styles, body });
}
