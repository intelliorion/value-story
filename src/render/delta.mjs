// src/render/delta.mjs
import { esc } from './html.mjs';
import { formatValue, normalizeTier } from './claim-card.mjs';

const TIER_LABEL = Object.freeze({ measured: 'Measured', estimated: 'Estimated' });

// The hero claim's own citation, resolved against the document's evidence
// registry. Never invent a source: when the ref does not resolve, the line
// carries the tier alone.
function citeLine(claim, tier, evidence) {
  const ref = claim?.baseline?.evidence_ref
    || claim?.current?.evidence_ref
    || claim?.evidence_ref
    || '';
  const source = ref
    ? (evidence || []).find((e) => e && e.ref === ref)
    : undefined;
  const label = TIER_LABEL[tier];
  if (!source || !source.title) return esc(label);
  const date = source.date ? `, ${esc(source.date)}` : '';
  return `${esc(label)} &middot; ${esc(source.title)}${date}`;
}

// The provenance line sits OUTSIDE the traced <section class="vs-hero">, as a
// sibling inside the band wrapper. src/reconcile.mjs scans every numeral inside
// a traced region against the claim's authorised figures, and an evidence date
// ("2026-08-31") is not an authorised figure — keeping the citation outside the
// region means the hallucination guard stays exactly as strict as it was for
// every figure the hero actually renders.
export function heroDelta(claim, { headline, evidence } = {}) {
  if (!claim) return '';
  const tier = normalizeTier(claim);
  if (tier === 'qualitative') return '';
  if (claim.baseline?.value === undefined || claim.current?.value === undefined) return '';
  return `<div class="vs-hero__band vs-hero__band--${tier}">
<section class="vs-hero vs-hero--${tier}">
<div class="vs-wrap vs-hero__grid">
<div class="vs-hero__lead">
<p class="vs-hero__metric">${esc(claim.metric)}</p>
<p class="vs-hero__figures">
<span class="vs-hero__from">${esc(formatValue(claim.baseline.value))}</span>
<span class="vs-hero__arrow" aria-hidden="true">&rarr;</span>
<span class="vs-hero__to">${esc(formatValue(claim.current.value))}</span>
<span class="vs-hero__unit">${esc(claim.unit)}</span>
</p>
</div>
<div class="vs-hero__aside">
<h1 class="vs-hero__headline">${esc(headline)}</h1>
</div>
</div>
</section>
<p class="vs-hero__cite vs-wrap">${citeLine(claim, tier, evidence)}</p>
</div>`;
}

export const HERO_CSS = `
.vs-hero__band{padding-bottom:calc(var(--vs-chapter)*1.1);
  border-bottom:1px solid var(--vs-rule)}
.vs-hero{padding:var(--vs-chapter) 0 0}
.vs-hero__grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,0.85fr);
  gap:calc(var(--vs-unit)*7);align-items:end}
.vs-hero__metric{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.18em;color:var(--vs-ink-dim);margin:0}
.vs-hero__figures{font-family:var(--vs-font-display);font-size:var(--vs-hero);
  font-weight:700;letter-spacing:-0.045em;line-height:0.92;font-variant-numeric:tabular-nums;
  margin:calc(var(--vs-unit)*2) 0 0;display:flex;align-items:baseline;
  gap:calc(var(--vs-unit)*2.5);flex-wrap:wrap}
.vs-hero__from{color:var(--vs-ink-muted);text-decoration:line-through;
  text-decoration-thickness:0.045em}
.vs-hero__arrow{color:var(--vs-ink-muted);font-size:0.34em;
  transform:translateY(-0.22em)}
/* D1: the unit is sized on its own rem clamp, not scaled off the numeral, and
   sits on the numeral's baseline so a long unit label cannot collide. */
.vs-hero__unit{font-family:var(--vs-font-text);font-size:var(--vs-hero-unit);
  font-weight:400;letter-spacing:0;color:var(--vs-ink-dim);
  align-self:flex-end;padding-bottom:0.55em;white-space:nowrap}
.vs-hero__headline{font-family:var(--vs-font-text);font-size:var(--vs-h1);
  font-weight:400;line-height:1.18;margin:0;max-width:20ch}
.vs-hero__cite{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  letter-spacing:0.14em;text-transform:uppercase;color:var(--vs-ink-dim);
  margin:calc(var(--vs-unit)*3) auto 0}
.vs-hero--measured .vs-hero__to{color:var(--vs-accent)}
.vs-hero__band--measured .vs-hero__cite{color:var(--vs-accent)}
.vs-hero--estimated .vs-hero__to{color:var(--vs-ink)}
.vs-hero--estimated .vs-hero__figures{opacity:0.92}

@keyframes vs-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.vs-hero__figures,.vs-hero__headline{animation:vs-rise var(--vs-duration) var(--vs-ease) both forwards}
.vs-hero__headline{animation-delay:140ms}

@media (max-width:900px){
  .vs-hero__grid{grid-template-columns:minmax(0,1fr);gap:calc(var(--vs-unit)*4)}
}
@media (prefers-reduced-motion: reduce){
  .vs-hero__figures,.vs-hero__headline{animation:none}
}
@media print{
  .vs-hero__figures,.vs-hero__headline{animation:none}
  .vs-hero{break-inside:avoid}
  .vs-hero__band{break-inside:avoid;border-bottom:1px solid var(--vs-print-rule)}
}
`;
