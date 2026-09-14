import { esc } from './html.mjs';

export function formatValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  const [int, frac] = String(rounded).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function claimFigures(claim) {
  if (!claim || claim.tier === 'qualitative') return [];
  const out = [];
  if (claim.baseline && claim.baseline.value !== undefined) out.push(formatValue(claim.baseline.value));
  if (claim.current && claim.current.value !== undefined) out.push(formatValue(claim.current.value));
  return out.filter(Boolean);
}

function deltaRow(claim) {
  const from = formatValue(claim.baseline?.value);
  const to = formatValue(claim.current?.value);
  const dir = claim.direction === 'decrease' ? 'down' : 'up';
  return `<p class="vs-claim__delta" data-direction="${esc(dir)}">
<span class="vs-claim__from">${esc(from)}</span>
<span class="vs-claim__arrow" aria-hidden="true">&rarr;</span>
<span class="vs-claim__to">${esc(to)}</span>
<span class="vs-claim__unit">${esc(claim.unit)}</span>
</p>`;
}

export function claimCard(claim) {
  const tier = claim?.tier === 'measured' || claim?.tier === 'estimated'
    ? claim.tier : 'qualitative';
  const evidence = claim?.baseline?.evidence_ref || claim?.evidence_ref || '';
  const attrs = [
    `class="vs-claim vs-claim--${tier}"`,
    `data-claim="${esc(claim?.id)}"`,
    evidence ? `data-evidence="${esc(evidence)}"` : '',
  ].filter(Boolean).join(' ');

  if (tier === 'qualitative') {
    return `<article ${attrs}>
<p class="vs-claim__statement">${esc(claim.statement)}</p>
<p class="vs-claim__tier">Capability</p>
</article>`;
  }

  const assumption = tier === 'estimated' && claim.assumption
    ? `<p class="vs-claim__assumption">${esc(claim.assumption.statement)}</p>
<p class="vs-claim__owner">Estimated by ${esc(claim.assumption.owner)}</p>`
    : '';

  return `<article ${attrs}>
<h3 class="vs-claim__metric">${esc(claim.metric)}</h3>
${deltaRow(claim)}
<p class="vs-claim__tier">${tier === 'measured' ? 'Measured' : 'Estimated'}</p>
${assumption}
</article>`;
}

export const CLAIM_CARD_CSS = `
.vs-claim{padding:calc(var(--vs-unit)*3);border-radius:var(--vs-radius);
  background:var(--vs-surface);border:1px solid var(--vs-rule)}
.vs-claim__metric{font-family:var(--vs-font-display);font-size:var(--vs-h2);
  font-weight:600;letter-spacing:-0.02em;margin:0 0 calc(var(--vs-unit)*2)}
.vs-claim__delta{font-family:var(--vs-font-display);font-size:var(--vs-h1);
  font-variant-numeric:tabular-nums;letter-spacing:-0.03em;margin:0;
  display:flex;align-items:baseline;gap:calc(var(--vs-unit)*1.5);flex-wrap:wrap}
.vs-claim__from{color:var(--vs-ink-faint);text-decoration:line-through;
  text-decoration-thickness:1px}
.vs-claim__arrow{color:var(--vs-ink-faint)}
.vs-claim__unit{font-family:var(--vs-font-text);font-size:var(--vs-body);
  color:var(--vs-ink-dim)}
.vs-claim__tier{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.12em;color:var(--vs-ink-dim);
  margin:calc(var(--vs-unit)*2) 0 0}
.vs-claim__assumption,.vs-claim__owner{font-family:var(--vs-font-text);
  font-size:var(--vs-micro);color:var(--vs-ink-dim);margin:calc(var(--vs-unit)) 0 0}
.vs-claim__statement{font-family:var(--vs-font-text);font-size:var(--vs-h2);
  line-height:1.4;margin:0}

/* measured: solid, accented, confident */
.vs-claim--measured{border-color:var(--vs-rule);background:var(--vs-surface-raised)}
.vs-claim--measured .vs-claim__to{color:var(--vs-accent)}
.vs-claim--measured .vs-claim__tier{color:var(--vs-accent)}

/* estimated: hairline dashed containment, never accented */
.vs-claim--estimated{border-style:dashed;border-color:var(--vs-ink-faint);
  background:transparent}
.vs-claim--estimated .vs-claim__to{color:var(--vs-ink)}

/* qualitative: a different mark entirely, no numerals */
.vs-claim--qualitative{border:none;background:transparent;
  border-left:2px solid var(--vs-ink-faint);border-radius:0;
  padding-left:calc(var(--vs-unit)*3)}
`;
