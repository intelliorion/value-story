import { esc } from './html.mjs';
import { claimCard } from './claim-card.mjs';

export const ARC_SLOTS = Object.freeze(['problem', 'capability', 'outcome', 'significance']);

const SLOT_EYEBROW = Object.freeze({
  problem: 'What problem existed',
  capability: 'What capability AI unlocked',
  outcome: 'What outcome changed',
  significance: 'Why it matters to the firm',
});

// `novelty` is in the schema and has never been displayed. It is a property of
// the capability, so it rides with the capability chapter's headline as a small
// outlined tag. It is deliberately NOT accented: the accent marks measured
// evidence only, and novelty is an editorial classification, not a measurement.
function noveltyTag(slot, node) {
  if (slot !== 'capability' || !node.novelty) return '';
  return `<p class="vs-chapter__novelty">${esc(node.novelty)}</p>`;
}

// The outcome chapter carries the actual value claims, so it is the peak of the
// page rather than another two-column prose spread: its own band, its own
// rhythm, and the claim cards across the full measure.
function outcomeChapter(node, claimsById, options) {
  const claims = (node.claim_refs || [])
    .map((r) => claimsById.get(r)).filter(Boolean).map(claimCard).join('\n');
  // The outcome headline is the frame that must land first, so the hero
  // carries it. When the hero has already set it in the <h1>, the outcome
  // chapter must not repeat it -- the same sentence twice on one page reads
  // as a rendering fault. The eyebrow and the claim cards stay either way,
  // and the headline stays in the IR: this suppresses a duplicate render,
  // not the field. When there is no hero (no measured or estimated claim
  // referenced by the outcome), the chapter keeps the headline, so the
  // sentence is never lost.
  const headline = options?.outcomeHeadlineInHero
    ? ''
    : `<h2 class="vs-chapter__headline vs-chapter__headline--outcome">${esc(node.headline)}</h2>`;
  return `<section class="vs-chapter vs-chapter--outcome" data-chapter="outcome">
<div class="vs-wrap">
<p class="vs-chapter__eyebrow">${esc(SLOT_EYEBROW.outcome)}</p>
${headline}
${claims ? `<div class="vs-chapter__claims">${claims}</div>` : ''}
</div>
</section>`;
}

function chapter(slot, node, claimsById, options) {
  if (!node) return '';
  if (slot === 'outcome') return outcomeChapter(node, claimsById, options);
  const detail = node.detail ? `<p class="vs-chapter__detail">${esc(node.detail)}</p>` : '';
  return `<section class="vs-chapter" data-chapter="${esc(slot)}">
<div class="vs-wrap vs-chapter__grid">
<div class="vs-chapter__lead">
<p class="vs-chapter__eyebrow">${esc(SLOT_EYEBROW[slot])}</p>
<h2 class="vs-chapter__headline">${esc(node.headline)}</h2>
${noveltyTag(slot, node)}
</div>
<div class="vs-chapter__body">
${detail}
</div>
</div>
</section>`;
}

export function chapters(arc = {}, claimsById = new Map(), options = {}) {
  return ARC_SLOTS.map((slot) => chapter(slot, arc[slot], claimsById, options)).join('\n');
}

export const CHAPTERS_CSS = `
.vs-chapter{padding:var(--vs-chapter) 0;border-bottom:1px solid var(--vs-rule)}
/* D2: headline left, supporting detail right, so a wide viewport carries the
   page instead of leaving half of it empty. */
.vs-chapter__grid{display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  gap:calc(var(--vs-unit)*8);align-items:start}
.vs-chapter__eyebrow{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.18em;color:var(--vs-ink-dim);margin:0}
.vs-chapter__headline{font-family:var(--vs-font-text);font-size:var(--vs-h1);
  font-weight:400;line-height:1.18;margin:calc(var(--vs-unit)*1.5) 0 0;max-width:17ch}
.vs-chapter__headline--outcome{max-width:24ch;margin-top:calc(var(--vs-unit)*2)}
.vs-chapter__detail{font-family:var(--vs-font-text);font-size:var(--vs-body);
  line-height:1.7;color:var(--vs-ink-dim);margin:calc(var(--vs-unit)*1.5) 0 0;max-width:52ch}
.vs-chapter__novelty{display:inline-block;font-family:var(--vs-font-display);
  font-size:var(--vs-micro);text-transform:uppercase;letter-spacing:0.14em;
  color:var(--vs-ink-dim);border:1px solid var(--vs-ink-faint);border-radius:100px;
  padding:0.35em 0.85em;margin:calc(var(--vs-unit)*3) 0 0}
/* D3: the outcome is the peak of the page -- its own lighter band, more air,
   and the largest cards on the page. */
.vs-chapter--outcome{padding:calc(var(--vs-chapter)*1.25) 0;
  background:linear-gradient(180deg,var(--vs-surface) 0%,var(--vs-bg) 100%)}
.vs-chapter__claims{display:grid;gap:calc(var(--vs-unit)*2.5);
  grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));
  align-items:stretch;margin-top:calc(var(--vs-unit)*6)}
/* F2: the qualitative claim's statement is its whole content, so it takes two
   tracks once there is more than one track to take. */
@media (min-width:900px){
  .vs-chapter__claims .vs-claim--qualitative{grid-column:span 2}
}
@media (max-width:900px){
  .vs-chapter__grid{grid-template-columns:minmax(0,1fr);gap:calc(var(--vs-unit)*3)}
}
@media print{.vs-chapter{break-inside:avoid;border-bottom:1px solid var(--vs-print-rule)}}
`;
