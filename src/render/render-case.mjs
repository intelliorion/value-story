import { page, esc } from './html.mjs';
import { tokensToCss } from './tokens.mjs';
import { CLAIM_CARD_CSS } from './claim-card.mjs';
import { heroDelta, HERO_CSS } from './delta.mjs';
import { constellation, CONSTELLATION_CSS } from './constellation.mjs';
import { chapters, CHAPTERS_CSS } from './chapters.mjs';

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--vs-bg);color:var(--vs-ink);
  font-family:var(--vs-font-text);font-size:var(--vs-body);
  -webkit-font-smoothing:antialiased}
.vs-meta{padding:calc(var(--vs-unit)*4) var(--vs-gutter) 0;
  font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.16em;color:var(--vs-ink-dim)}
.vs-evidence{padding:var(--vs-chapter) var(--vs-gutter)}
.vs-evidence h2{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.16em;color:var(--vs-ink-dim);
  margin:0 0 calc(var(--vs-unit)*3)}
.vs-evidence ol{margin:0;padding-left:1.2em;color:var(--vs-ink-dim);
  font-size:var(--vs-micro);line-height:1.9}
@media print{body{background:var(--vs-print-bg);color:var(--vs-print-ink)}}
`;

function evidenceList(evidence = []) {
  if (!evidence.length) return '';
  const items = evidence.map((e) => `<li id="ev-${esc(e.ref)}">
<strong>${esc(e.title)}</strong> &mdash; ${esc(e.kind)}, ${esc(e.date)}${e.locator ? `, ${esc(e.locator)}` : ''}
</li>`).join('\n');
  return `<section class="vs-evidence"><h2>Evidence</h2><ol>${items}</ol></section>`;
}

function pickHeroClaim(doc, claimsById) {
  const refs = doc?.arc?.outcome?.claim_refs || [];
  const referenced = refs.map((r) => claimsById.get(r)).filter(Boolean);
  return referenced.find((c) => c.tier === 'measured')
    || referenced.find((c) => c.tier === 'estimated')
    || null;
}

export function renderCase(doc) {
  const claimsById = new Map((doc.claims || []).map((c) => [c.id, c]));
  const hero = pickHeroClaim(doc, claimsById);
  const styles = [
    tokensToCss(), BASE_CSS, HERO_CSS, CHAPTERS_CSS, CLAIM_CARD_CSS, CONSTELLATION_CSS,
  ].join('\n');

  const body = `<main>
<p class="vs-meta">${esc(doc.initiative?.name)} &middot; ${esc(doc.meta?.period)}</p>
${heroDelta(hero, { headline: doc.arc?.outcome?.headline })}
${chapters(doc.arc, claimsById)}
${constellation(doc.drivers)}
${evidenceList(doc.evidence)}
</main>`;

  return page({ title: doc.meta?.title || doc.initiative?.name || 'Value Story', styles, body });
}
