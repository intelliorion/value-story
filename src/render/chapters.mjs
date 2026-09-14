import { esc } from './html.mjs';
import { claimCard } from './claim-card.mjs';

export const ARC_SLOTS = Object.freeze(['problem', 'capability', 'outcome', 'significance']);

const SLOT_EYEBROW = Object.freeze({
  problem: 'What problem existed',
  capability: 'What capability AI unlocked',
  outcome: 'What outcome changed',
  significance: 'Why it matters to the firm',
});

function chapter(slot, node, claimsById) {
  if (!node) return '';
  const claims = slot === 'outcome'
    ? (node.claim_refs || []).map((r) => claimsById.get(r)).filter(Boolean).map(claimCard).join('\n')
    : '';
  const detail = slot === 'outcome' || !node.detail
    ? ''
    : `<p class="vs-chapter__detail">${esc(node.detail)}</p>`;
  return `<section class="vs-chapter" data-chapter="${esc(slot)}">
<p class="vs-chapter__eyebrow">${esc(SLOT_EYEBROW[slot])}</p>
<h2 class="vs-chapter__headline">${esc(node.headline)}</h2>
${detail}
${claims ? `<div class="vs-chapter__claims">${claims}</div>` : ''}
</section>`;
}

export function chapters(arc = {}, claimsById = new Map()) {
  return ARC_SLOTS.map((slot) => chapter(slot, arc[slot], claimsById)).join('\n');
}

export const CHAPTERS_CSS = `
.vs-chapter{padding:var(--vs-chapter) var(--vs-gutter);
  border-bottom:1px solid var(--vs-rule)}
.vs-chapter__eyebrow{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.16em;color:var(--vs-ink-dim);margin:0}
.vs-chapter__headline{font-family:var(--vs-font-text);font-size:var(--vs-h1);
  font-weight:400;line-height:1.2;margin:calc(var(--vs-unit)*2) 0 0;max-width:22ch}
.vs-chapter__detail{font-family:var(--vs-font-text);font-size:var(--vs-body);
  line-height:1.65;color:var(--vs-ink-dim);margin:calc(var(--vs-unit)*3) 0 0;max-width:62ch}
.vs-chapter__claims{display:grid;gap:calc(var(--vs-unit)*2);
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  margin-top:calc(var(--vs-unit)*5)}
@media print{.vs-chapter{break-inside:avoid;border-bottom:1px solid #ccc}}
`;
