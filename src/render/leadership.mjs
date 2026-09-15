// src/render/leadership.mjs
//
// Spec §4.8. Leadership asks five questions of the portfolio, and they are a
// DIFFERENT taxonomy from the ten drivers. Reporting driver coverage alone
// answers "which drivers do we touch", which is not what was asked -- so the
// artifact answers the five directly, including the ones it cannot answer.
//
// INTERACTIVE WITHOUT SCRIPT. The artifact carries no `<script>`: selection is
// a hidden radio group and `:checked ~` sibling rules. Every panel is in the
// DOM at all times, so the static meaning stays complete, print shows all five
// at once, and a reader with no CSS still gets every answer in reading order.
import { esc } from './html.mjs';
import { normalizeTier, formatValue } from './claim-card.mjs';
import { DRIVER_GROUPS } from '../drivers.mjs';

// A unit naming people or functions is what distinguishes a REACH claim from an
// ordinary productivity one; the driver alone cannot, because both live under
// `productivity`. Spec §4.8 names the claim shape rather than a driver.
const REACH_UNIT = /\b(person|people|employee|staff|headcount|colleague|user|team|function|department|practice)s?\b/i;

export const QUESTIONS = Object.freeze([
  { id: 'productivity', n: '01', short: 'Productivity',
    question: 'How much more productivity did we get?',
    drivers: ['productivity', 'operational-adaptability'],
    looksLike: 'throughput, cycle time, or cases per person',
    missing: 'a before-and-after on throughput or cycle time, from a system export rather than an impression' },
  { id: 'risk', n: '02', short: 'Risk',
    question: 'How much risk did we reduce?',
    drivers: ['governance-oversight', 'standardization-knowledge'],
    looksLike: 'control exceptions, error rates, or audit findings that went down',
    missing: 'a count of control exceptions, errors or audit findings, before and after' },
  { id: 'capability', n: '03', short: 'Capabilities',
    question: 'What new capabilities do we have?',
    drivers: null, // answered by qualitative claims and the capability chapter
    looksLike: 'a capability that did not exist before, with or without a number',
    missing: 'a statement of something the firm can now do that it could not do at all before' },
  { id: 'cost', n: '04', short: 'Cost avoided',
    question: 'How much cost did we avoid?',
    drivers: DRIVER_GROUPS.efficiency,
    looksLike: 'a currency figure against one of the four efficiency drivers',
    missing: 'a currency before-and-after, with whoever owns the rate named' },
  { id: 'reach', n: '05', short: 'Reach',
    question: 'How many employees and functions were enabled?',
    drivers: ['productivity', 'high-value-skills-ip'],
    looksLike: 'a headcount or a count of functions',
    missing: 'how many people or teams actually use it — the figure most often assumed rather than counted' },
]);

function claimsFor(question, doc) {
  const claims = doc?.claims || [];
  if (question.id === 'capability') {
    return claims.filter((c) => normalizeTier(c) === 'qualitative');
  }
  const matched = claims.filter((c) => (question.drivers || []).includes(c.driver));
  if (question.id !== 'reach') return matched;
  return matched.filter((c) => REACH_UNIT.test(String(c.unit || '')));
}

// The strongest tier present is what the question is ANSWERED AT, because a
// measured answer and an assumed one are not the same answer.
function strengthOf(claims, question, doc) {
  if (claims.some((c) => normalizeTier(c) === 'measured')) return 'measured';
  if (claims.some((c) => normalizeTier(c) === 'estimated')) return 'estimated';
  if (claims.length) return 'qualitative';
  if (question.id === 'capability' && doc?.arc?.capability?.novelty) return 'qualitative';
  return 'unanswered';
}

export function leadershipAnswers(doc) {
  return QUESTIONS.map((question) => {
    const claims = claimsFor(question, doc);
    return { question, claims, strength: strengthOf(claims, question, doc) };
  });
}

const MARK = Object.freeze({
  measured: '<rect x="0" y="4" width="26" height="6" rx="1" class="vs-lq__mark--fill"/>',
  estimated: '<rect x="0" y="4" width="26" height="6" rx="1" class="vs-lq__mark--band"/>',
  qualitative: '<path d="M0 5h26M0 9h16" class="vs-lq__mark--rule"/>',
  unanswered: '<rect x="0.75" y="4.75" width="24.5" height="4.5" rx="1" class="vs-lq__mark--void"/>',
});
const STRENGTH_LABEL = Object.freeze({
  measured: 'Measured', estimated: 'Estimated',
  qualitative: 'Described, not quantified', unanswered: 'Not answered',
});

// A brief claim row. It is an <article class="vs-claim"> so that every figure
// it prints is inside a region `src/reconcile.mjs` traces -- the same guarantee
// the full cards get. It must contain no nested <article>, or the region
// matcher refuses to reconcile it.
function claimRow(claim) {
  const tier = normalizeTier(claim);
  const figure = tier === 'qualitative' ? ''
    : `<span class="vs-lq__from">${esc(formatValue(claim.baseline?.value))}</span>`
      + '<span class="vs-lq__arrow" aria-hidden="true">&rarr;</span>'
      + `<span class="vs-lq__to">${esc(formatValue(claim.current?.value))}</span>`
      + `<span class="vs-claim__unit vs-lq__unit">${esc(claim.unit || '')}</span>`;
  const text = tier === 'qualitative'
    ? `<p class="vs-lq__statement">${esc(claim.statement || '')}</p>`
    : `<p class="vs-lq__metric">${esc(claim.metric || '')}</p><p class="vs-lq__figure">${figure}</p>`;
  return `<article class="vs-claim vs-lq__row vs-claim--${esc(tier)}" data-claim="${esc(claim.id || '')}">
<p class="vs-lq__tier">${esc(STRENGTH_LABEL[tier])}</p>
${text}
</article>`;
}

function panel(answer, doc) {
  const { question, claims, strength } = answer;
  if (strength === 'unanswered') {
    return `<div class="vs-lq__panel" data-q="${esc(question.id)}">
<p class="vs-lq__verdict vs-lq__verdict--none">Nothing in the evidence answers this.</p>
<p class="vs-lq__missing">What would answer it: ${esc(question.missing)}.</p>
<p class="vs-lq__missing">Saying so is the honest answer. An assumed figure here would read like the others and mean nothing.</p>
</div>`;
  }
  const novelty = question.id === 'capability' && doc?.arc?.capability?.novelty
    ? `<p class="vs-lq__missing">Capability classification: ${esc(doc.arc.capability.novelty)}.</p>` : '';
  return `<div class="vs-lq__panel" data-q="${esc(question.id)}">
<p class="vs-lq__verdict">Answered by ${claims.length} claim${claims.length === 1 ? '' : 's'}, at its strongest ${esc(STRENGTH_LABEL[strength].toLowerCase())}.</p>
${claims.map(claimRow).join('\n')}
${novelty}
</div>`;
}

export function leadership(doc) {
  const answers = leadershipAnswers(doc);
  const answered = answers.filter((a) => a.strength !== 'unanswered').length;
  // The first question that HAS an answer opens the section, so the page never
  // rests on an empty panel; if none do, the first one opens and says so.
  const openIndex = Math.max(0, answers.findIndex((a) => a.strength !== 'unanswered'));

  const radios = answers.map((a, i) => `<input type="radio" name="vs-lq" id="vs-lq-${esc(a.question.id)}" class="vs-lq__radio"${i === openIndex ? ' checked' : ''}>`).join('\n');

  const tabs = answers.map((a) => `<label class="vs-lq__tab" for="vs-lq-${esc(a.question.id)}" data-strength="${esc(a.strength)}">
<span class="vs-lq__n">${esc(a.question.n)}</span>
<svg class="vs-lq__mark" viewBox="0 0 26 14" role="img" aria-label="${esc(STRENGTH_LABEL[a.strength])}">${MARK[a.strength]}</svg>
<span class="vs-lq__short">${esc(a.question.short)}</span>
<span class="vs-lq__q">${esc(a.question.question)}</span>
<span class="vs-lq__strength">${esc(STRENGTH_LABEL[a.strength])}</span>
</label>`).join('\n');

  return `<section class="vs-lq" data-answered="${answered}">
<div class="vs-wrap">
<h2>What leadership asked</h2>
<p class="vs-lq__score"><b>${answered} of 5</b> answered by the evidence in this case${answered === 5 ? '.' : ` — the other ${5 - answered} are named below rather than filled in.`}</p>
${radios}
<div class="vs-lq__tabs">${tabs}</div>
<div class="vs-lq__panels">${answers.map((a) => panel(a, doc)).join('\n')}</div>
</div>
</section>`;
}

export const LEADERSHIP_CSS = `
.vs-lq{padding:var(--vs-chapter) 0;border-bottom:1px solid var(--vs-rule)}
.vs-lq h2{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.18em;color:var(--vs-ink-dim);margin:0}
.vs-lq__score{font-family:var(--vs-font-text);font-size:var(--vs-h2);font-weight:400;
  margin:calc(var(--vs-unit)*2) 0 0;max-width:46ch;color:var(--vs-ink-dim)}
.vs-lq__score b{color:var(--vs-ink);font-weight:600}
.vs-lq__radio{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.vs-lq__tabs{display:grid;gap:calc(var(--vs-unit)*1.5);
  grid-template-columns:repeat(auto-fit,minmax(min(100%,188px),1fr));
  margin:calc(var(--vs-unit)*4) 0 0}
.vs-lq__tab{display:block;cursor:pointer;border:1px solid var(--vs-rule);
  border-radius:var(--vs-radius);padding:calc(var(--vs-unit)*2);background:var(--vs-surface);
  transition:border-color .2s ease,background .2s ease}
.vs-lq__tab:hover{border-color:var(--vs-ink-muted)}
.vs-lq__n{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  letter-spacing:0.16em;color:var(--vs-ink-muted);display:block}
.vs-lq__mark{width:26px;height:14px;display:block;margin:calc(var(--vs-unit)*1.5) 0}
.vs-lq__mark--fill{fill:var(--vs-accent)}
.vs-lq__mark--band{fill:var(--vs-ink-muted);opacity:.45}
.vs-lq__mark--rule{stroke:var(--vs-ink-muted);stroke-width:1.6;fill:none;stroke-linecap:round}
.vs-lq__mark--void{fill:none;stroke:var(--vs-ink-faint);stroke-width:1.5;stroke-dasharray:3 3}
.vs-lq__short{font-family:var(--vs-font-display);font-size:var(--vs-body);font-weight:600;
  display:block;color:var(--vs-ink)}
.vs-lq__q{font-family:var(--vs-font-text);font-size:var(--vs-small);line-height:1.45;
  display:block;color:var(--vs-ink-dim);margin-top:calc(var(--vs-unit)*0.5)}
.vs-lq__strength{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.12em;display:block;
  margin-top:calc(var(--vs-unit)*1.5);color:var(--vs-ink-muted)}
.vs-lq__tab[data-strength="measured"] .vs-lq__strength{color:var(--vs-accent)}
.vs-lq__tab[data-strength="unanswered"]{border-style:dashed}

.vs-lq__panels{margin-top:calc(var(--vs-unit)*3)}
.vs-lq__panel{display:none;border-top:1px solid var(--vs-rule);
  padding-top:calc(var(--vs-unit)*3)}
${QUESTIONS.map((q) => `#vs-lq-${q.id}:checked ~ .vs-lq__panels .vs-lq__panel[data-q="${q.id}"]{display:block}`).join('\n')}
${QUESTIONS.map((q) => `#vs-lq-${q.id}:checked ~ .vs-lq__tabs .vs-lq__tab[for="vs-lq-${q.id}"]{border-color:var(--vs-ink);background:var(--vs-surface-raised)}`).join('\n')}
/* Keyboard selection must be visible: the radio is off-screen, so the focus
   ring has to be drawn on the label it controls. */
${QUESTIONS.map((q) => `#vs-lq-${q.id}:focus-visible ~ .vs-lq__tabs .vs-lq__tab[for="vs-lq-${q.id}"]{outline:2px solid var(--vs-accent);outline-offset:2px}`).join('\n')}

.vs-lq__verdict{font-family:var(--vs-font-text);font-size:var(--vs-body);
  color:var(--vs-ink);margin:0 0 calc(var(--vs-unit)*2)}
.vs-lq__verdict--none{color:var(--vs-ink)}
.vs-lq__missing{font-family:var(--vs-font-text);font-size:var(--vs-small);
  color:var(--vs-ink-dim);line-height:1.6;margin:calc(var(--vs-unit)*1.5) 0 0;max-width:62ch}
.vs-lq__row{border:1px solid var(--vs-rule);border-radius:var(--vs-radius);
  background:var(--vs-surface-raised);padding:calc(var(--vs-unit)*2);
  margin:0 0 calc(var(--vs-unit)*1.5)}
.vs-lq__tier{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.12em;color:var(--vs-ink-muted);margin:0}
.vs-lq__metric{font-family:var(--vs-font-display);font-size:var(--vs-small);
  font-weight:600;margin:calc(var(--vs-unit)*1) 0 0;color:var(--vs-ink)}
.vs-lq__statement{font-family:var(--vs-font-text);font-size:var(--vs-small);
  line-height:1.6;margin:calc(var(--vs-unit)*1) 0 0;color:var(--vs-ink);max-width:70ch}
.vs-lq__figure{font-family:var(--vs-font-display);font-size:var(--vs-h2);font-weight:700;
  font-variant-numeric:tabular-nums;margin:calc(var(--vs-unit)*1) 0 0;
  display:flex;align-items:baseline;gap:calc(var(--vs-unit)*1);flex-wrap:wrap}
.vs-lq__from{color:var(--vs-ink-muted);text-decoration:line-through}
.vs-lq__arrow{color:var(--vs-ink-muted);font-size:0.6em}
.vs-lq__to{color:var(--vs-ink)}
.vs-claim--measured.vs-lq__row .vs-lq__to{color:var(--vs-accent)}
.vs-lq__unit{font-family:var(--vs-font-text);font-size:var(--vs-small);
  font-weight:400;color:var(--vs-ink-dim)}
/* Forwarded and printed, every panel is open: the selection is a convenience
   on screen, never the only way to reach an answer. */
@media print{
  .vs-lq__panel{display:block !important;break-inside:avoid}
  .vs-lq__tabs{display:none}
  .vs-lq{border-bottom:1px solid var(--vs-print-rule)}
  .vs-lq__row{border:1px solid var(--vs-print-rule)}
}
`;
