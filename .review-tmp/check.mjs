import { renderCase } from '../src/render/render-case.mjs';

function log(label, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label); }

// CHECK 1: outcome.detail leak
{
  const doc = {
    meta: { title: 'T' }, initiative: { name: 'I' },
    drivers: { primary: 'labor-cost-efficiency', secondary: [] },
    arc: {
      problem: { headline: 'P' }, capability: { headline: 'C' },
      outcome: { headline: 'O', claim_refs: ['c1'], detail: 'we cut 40 hours' },
      significance: { headline: 'S' },
    },
    claims: [{ id: 'c1', driver: 'labor-cost-efficiency', metric: 'm', unit: 'h', tier: 'measured', direction: 'decrease',
      baseline: { value: 10, asof: '2026-01' }, current: { value: 5, asof: '2026-08' } }],
    evidence: [],
  };
  const html = renderCase(doc);
  log('CHECK1 outcome.detail NOT leaked', !html.includes('we cut 40 hours'));
}

// CHECK 2: escaping - script in chapter headline, evidence title, evidence locator
{
  const xss = '<script>alert(1)</script>';
  const doc = {
    meta: { title: 'T' }, initiative: { name: 'I' },
    drivers: { primary: 'labor-cost-efficiency', secondary: [] },
    arc: {
      problem: { headline: xss }, capability: { headline: 'C' },
      outcome: { headline: 'O', claim_refs: [] },
      significance: { headline: 'S' },
    },
    claims: [],
    evidence: [{ ref: 'e1', kind: 'doc', title: xss, date: '2026-01-01', locator: xss }],
  };
  const html = renderCase(doc);
  log('CHECK2 no raw <script> anywhere', !html.includes('<script>alert(1)</script>'));
  log('CHECK2 no /<script/ regex match', !/<script/.test(html));
}

// CHECK 3a: missing arc entirely
{
  const doc = { meta: {}, initiative: {}, claims: [], evidence: [] };
  try { renderCase(doc); log('CHECK3a missing arc entirely', true); }
  catch (e) { log('CHECK3a missing arc entirely: ' + e.message, false); }
}
// CHECK 3b: missing individual chapters
{
  const doc = { meta: {}, initiative: {}, arc: { outcome: { headline: 'O', claim_refs: [] } }, claims: [], evidence: [] };
  try { renderCase(doc); log('CHECK3b missing individual chapters', true); }
  catch (e) { log('CHECK3b missing individual chapters: ' + e.message, false); }
}
// CHECK 3c: claims: []
{
  const doc = { meta: {}, initiative: {}, arc: { outcome: { headline: 'O', claim_refs: [] } }, claims: [], evidence: [] };
  try { renderCase(doc); log('CHECK3c claims empty', true); }
  catch (e) { log('CHECK3c claims empty: ' + e.message, false); }
}
// CHECK 3d: evidence: []
{
  const doc = { meta: {}, initiative: {}, arc: { outcome: { headline: 'O', claim_refs: [] } }, claims: [], evidence: [] };
  try { renderCase(doc); log('CHECK3d evidence empty', true); }
  catch (e) { log('CHECK3d evidence empty: ' + e.message, false); }
}
// CHECK 3e: missing meta
{
  const doc = { initiative: {}, arc: { outcome: { headline: 'O', claim_refs: [] } }, claims: [], evidence: [] };
  try { renderCase(doc); log('CHECK3e missing meta', true); }
  catch (e) { log('CHECK3e missing meta: ' + e.message, false); }
}
// CHECK 3f: missing initiative
{
  const doc = { meta: {}, arc: { outcome: { headline: 'O', claim_refs: [] } }, claims: [], evidence: [] };
  try { renderCase(doc); log('CHECK3f missing initiative', true); }
  catch (e) { log('CHECK3f missing initiative: ' + e.message, false); }
}
// CHECK 3g: outcome.claim_refs pointing at nonexistent ids
{
  const doc = { meta: {}, initiative: {}, arc: { outcome: { headline: 'O', claim_refs: ['nope', 'also-nope'] } }, claims: [], evidence: [] };
  try { const h = renderCase(doc); log('CHECK3g claim_refs nonexistent ids', true); }
  catch (e) { log('CHECK3g claim_refs nonexistent ids: ' + e.message, false); }
}
// CHECK 3h: missing outcome chapter itself (no arc.outcome at all)
{
  const doc = { meta: {}, initiative: {}, arc: { problem: { headline: 'P' } }, claims: [], evidence: [] };
  try { renderCase(doc); log('CHECK3h missing outcome chapter', true); }
  catch (e) { log('CHECK3h missing outcome chapter: ' + e.message, false); }
}
// CHECK 3i: totally empty doc {}
{
  try { renderCase({}); log('CHECK3i empty doc {}', true); }
  catch (e) { log('CHECK3i empty doc {}: ' + e.message, false); }
}

// CHECK 4: hero selection - qualitative first, measured second
{
  const doc = {
    meta: {}, initiative: {},
    drivers: { primary: 'labor-cost-efficiency', secondary: [] },
    arc: { outcome: { headline: 'O', claim_refs: ['q1', 'm1'] } },
    claims: [
      { id: 'q1', driver: 'productivity', tier: 'qualitative', statement: 'qual stmt' },
      { id: 'm1', driver: 'labor-cost-efficiency', metric: 'metric-m1', unit: 'h', tier: 'measured', direction: 'decrease',
        baseline: { value: 100, asof: '2026-01' }, current: { value: 50, asof: '2026-08' } },
    ],
    evidence: [],
  };
  const html = renderCase(doc);
  const heroSection = html.slice(html.lastIndexOf('<section class="vs-hero'), html.indexOf('</section>', html.lastIndexOf('<section class="vs-hero')));
  log('CHECK4 hero picks measured (metric-m1) not qualitative', heroSection.includes('metric-m1'));
  log('CHECK4 hero does not include qual stmt', !heroSection.includes('qual stmt'));
}
// CHECK 4b: no measured/estimated at all -> hero renders nothing
{
  const doc = {
    meta: {}, initiative: {},
    drivers: { primary: 'labor-cost-efficiency', secondary: [] },
    arc: { outcome: { headline: 'O', claim_refs: ['q1'] } },
    claims: [{ id: 'q1', driver: 'productivity', tier: 'qualitative', statement: 'qual stmt' }],
    evidence: [],
  };
  const html = renderCase(doc);
  log('CHECK4b no hero markup when only qualitative referenced', !html.includes('<section class="vs-hero'));
}

// CHECK 5: CSS assembly order - tokens first
{
  const doc = {
    meta: {}, initiative: {},
    drivers: { primary: 'labor-cost-efficiency', secondary: [] },
    arc: { outcome: { headline: 'O', claim_refs: [] } },
    claims: [], evidence: [],
  };
  const html = renderCase(doc);
  const rootIdx = html.indexOf(':root{');
  const chapterCssIdx = html.indexOf('.vs-chapter{');
  const heroCssIdx = html.indexOf('.vs-hero{');
  log('CHECK5 :root tokens appear before .vs-chapter CSS', rootIdx >= 0 && rootIdx < chapterCssIdx);
  log('CHECK5 :root tokens appear before .vs-hero CSS', rootIdx >= 0 && rootIdx < heroCssIdx);
}
