// src/render/delta.mjs
import { esc } from './html.mjs';
import { formatValue } from './claim-card.mjs';

export function heroDelta(claim, { headline } = {}) {
  if (!claim || claim.tier === 'qualitative') return '';
  if (claim.baseline?.value === undefined || claim.current?.value === undefined) return '';
  const tier = claim.tier === 'measured' ? 'measured' : 'estimated';
  return `<section class="vs-hero vs-hero--${tier}">
<p class="vs-hero__metric">${esc(claim.metric)}</p>
<p class="vs-hero__figures">
<span class="vs-hero__from">${esc(formatValue(claim.baseline.value))}</span>
<span class="vs-hero__arrow" aria-hidden="true">&rarr;</span>
<span class="vs-hero__to">${esc(formatValue(claim.current.value))}</span>
<span class="vs-hero__unit">${esc(claim.unit)}</span>
</p>
<h1 class="vs-hero__headline">${esc(headline)}</h1>
</section>`;
}

export const HERO_CSS = `
.vs-hero{padding:var(--vs-chapter) var(--vs-gutter);border-bottom:1px solid var(--vs-rule)}
.vs-hero__metric{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.16em;color:var(--vs-ink-dim);margin:0}
.vs-hero__figures{font-family:var(--vs-font-display);font-size:var(--vs-hero);
  font-weight:700;letter-spacing:-0.045em;line-height:1;font-variant-numeric:tabular-nums;
  margin:calc(var(--vs-unit)*2) 0 0;display:flex;align-items:baseline;
  gap:calc(var(--vs-unit)*2);flex-wrap:wrap}
.vs-hero__from{color:var(--vs-ink-faint)}
.vs-hero__arrow{color:var(--vs-ink-faint);font-size:0.5em}
.vs-hero__unit{font-family:var(--vs-font-text);font-size:calc(var(--vs-hero)*0.18);
  color:var(--vs-ink-dim)}
.vs-hero__headline{font-family:var(--vs-font-text);font-size:var(--vs-h1);
  font-weight:400;line-height:1.2;margin:calc(var(--vs-unit)*4) 0 0;max-width:24ch}
.vs-hero--measured .vs-hero__to{color:var(--vs-accent)}
.vs-hero--estimated .vs-hero__to{color:var(--vs-ink)}
.vs-hero--estimated .vs-hero__figures{opacity:0.92}

@keyframes vs-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.vs-hero__figures,.vs-hero__headline{animation:vs-rise var(--vs-duration) var(--vs-ease) both forwards}
.vs-hero__headline{animation-delay:140ms}

@media (prefers-reduced-motion: reduce){
  .vs-hero__figures,.vs-hero__headline{animation:none}
}
@media print{
  .vs-hero__figures,.vs-hero__headline{animation:none}
  .vs-hero{break-inside:avoid}
}
`;
