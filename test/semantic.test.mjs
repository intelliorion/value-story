import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { semanticDiagnostics } from '../src/semantic.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const codes = (doc) => semanticDiagnostics(doc).map((d) => d.code);

test('the fixture is semantically clean', () => {
  assert.deepEqual(semanticDiagnostics(good()), []);
});

test('flags a claim on an undeclared driver', () => {
  const doc = good();
  doc.claims[0].driver = 'differentiation';
  assert.ok(codes(doc).includes('claim/driver-undeclared'));
});

test('flags a primary driver with no claim', () => {
  const doc = good();
  doc.claims = doc.claims.filter((c) => c.driver !== doc.drivers.primary);
  assert.ok(codes(doc).includes('driver/primary-no-claim'));
});

test('flags a secondary driver duplicating the primary', () => {
  const doc = good();
  doc.drivers.secondary = [doc.drivers.primary];
  assert.ok(codes(doc).includes('driver/secondary-shadows-primary'));
});

test('flags an unresolved evidence reference', () => {
  const doc = good();
  doc.claims[0].baseline.evidence_ref = 'e999';
  assert.ok(codes(doc).includes('evidence/ref-unresolved'));
});

test('flags an unresolved claim reference from the outcome chapter', () => {
  const doc = good();
  doc.arc.outcome.claim_refs.push('c999');
  assert.ok(codes(doc).includes('evidence/ref-unresolved'));
});

test('supportedFixes are JSON Pointers into the offending location', () => {
  const doc = good();
  doc.claims[0].driver = 'differentiation';
  const d = semanticDiagnostics(doc).find((x) => x.code === 'claim/driver-undeclared');
  assert.match(d.supportedFixes[0], /\/claims\/0\//);
  assert.equal(d.subject.index, 0);
});

test('an unknown driver suppresses the undeclared-driver cascade', () => {
  const doc = good();
  doc.drivers.primary = 'not-a-driver';
  const d = semanticDiagnostics(doc).find((x) => x.code === 'driver/unknown');
  assert.ok(d.suppresses.includes('claim/driver-undeclared'));
});

// --- Required addition: the suppression graph this module can emit must be acyclic. ---
//
// applySuppression() (src/diagnostics.mjs) does last-write-wins style lookups keyed by
// code. Because duplicate codes are normal here (one claim/driver-undeclared per bad
// claim, for instance), a MUTUAL suppression edge (A suppresses B *and* B suppresses A)
// is the one shape that can pick the wrong instance. src/semantic.mjs is the only place
// that authors suppresses[] arrays, so this test collects every (code, suppresses[])
// pair semanticDiagnostics() can actually emit and proves the resulting directed graph
// has no cycle.

function collectSuppressionEdges() {
  // Deliberately broken documents, each chosen to trigger at least one diagnostic that
  // carries a non-empty `suppresses` array, plus the diagnostics it is meant to suppress.
  const brokenDocs = [];

  // Triggers driver/unknown (suppresses claim/driver-undeclared, driver/primary-no-claim)
  // and, incidentally, claim/driver-undeclared for claims on the (now bogus) primary.
  const unknownPrimary = good();
  unknownPrimary.drivers.primary = 'not-a-driver';
  brokenDocs.push(unknownPrimary);

  // Triggers evidence/ref-unresolved (suppresses claim/measured-no-baseline).
  const badEvidenceRef = good();
  badEvidenceRef.claims[0].baseline.evidence_ref = 'e999';
  brokenDocs.push(badEvidenceRef);

  // Triggers claim/driver-undeclared directly (in case it ever grows its own
  // suppresses[] — the graph must still resolve without a cycle).
  const undeclaredDriver = good();
  undeclaredDriver.claims[0].driver = 'differentiation';
  brokenDocs.push(undeclaredDriver);

  // Triggers driver/primary-no-claim directly.
  const primaryNoClaim = good();
  primaryNoClaim.claims = primaryNoClaim.claims.filter(
    (c) => c.driver !== primaryNoClaim.drivers.primary,
  );
  brokenDocs.push(primaryNoClaim);

  // Triggers driver/secondary-shadows-primary.
  const shadowedSecondary = good();
  shadowedSecondary.drivers.secondary = [shadowedSecondary.drivers.primary];
  brokenDocs.push(shadowedSecondary);

  // Triggers evidence/ref-unresolved via the outcome chapter's claim_refs.
  const badClaimRef = good();
  badClaimRef.arc.outcome.claim_refs.push('c999');
  brokenDocs.push(badClaimRef);

  // A single maximally-broken document, so any interaction between simultaneously
  // emitted diagnostics is also captured.
  const everythingBroken = good();
  everythingBroken.drivers.primary = 'not-a-driver';
  everythingBroken.drivers.secondary = [everythingBroken.drivers.primary];
  everythingBroken.claims[0].driver = 'differentiation';
  everythingBroken.claims[0].baseline.evidence_ref = 'e999';
  everythingBroken.arc.outcome.claim_refs.push('c999');
  brokenDocs.push(everythingBroken);

  const edges = new Map(); // code -> Set(suppressed codes)
  for (const doc of brokenDocs) {
    for (const diag of semanticDiagnostics(doc)) {
      if (!edges.has(diag.code)) edges.set(diag.code, new Set());
      for (const target of diag.suppresses || []) {
        edges.get(diag.code).add(target);
      }
    }
  }
  return edges;
}

// Repeated-removal (Kahn's algorithm) cycle check: repeatedly strip nodes with no
// outgoing edges among the remaining nodes; if nodes remain when nothing more can be
// stripped, a cycle exists.
function hasCycle(edges) {
  const nodes = new Set(edges.keys());
  for (const targets of edges.values()) {
    for (const t of targets) nodes.add(t);
  }
  const remaining = new Set(nodes);
  let progress = true;
  while (progress && remaining.size > 0) {
    progress = false;
    for (const node of [...remaining]) {
      const outgoing = [...(edges.get(node) || [])].filter((t) => remaining.has(t));
      if (outgoing.length === 0) {
        remaining.delete(node);
        progress = true;
      }
    }
  }
  return remaining.size > 0;
}

test('the suppression graph this module emits is acyclic', () => {
  const edges = collectSuppressionEdges();

  // Sanity: we actually exercised at least one non-trivial suppresses[] edge, otherwise
  // this test would trivially pass without proving anything.
  const totalEdges = [...edges.values()].reduce((n, s) => n + s.size, 0);
  assert.ok(totalEdges > 0, 'expected at least one suppression edge to be collected');

  assert.equal(hasCycle(edges), false, 'suppression graph must not contain a cycle');

  // Falsification check: prove the cycle detector actually rejects a reciprocal edge,
  // by temporarily injecting a fake mutual pair into a COPY of the collected graph.
  const poisoned = new Map([...edges].map(([k, v]) => [k, new Set(v)]));
  const [codeA] = poisoned.keys();
  const codeB = '__fake-reciprocal-target__';
  if (!poisoned.has(codeA)) poisoned.set(codeA, new Set());
  poisoned.get(codeA).add(codeB);
  if (!poisoned.has(codeB)) poisoned.set(codeB, new Set());
  poisoned.get(codeB).add(codeA);

  assert.equal(
    hasCycle(poisoned),
    true,
    'cycle detector failed to catch an injected reciprocal edge',
  );
  // poisoned was a copy; the real, collected edge set (`edges`) was never mutated.
});

// --- Fix 1: a `measured` claim must carry evidence on both points. ---
//
// Spec 4.6 invariant 4 and the 4.3 tier table. Enforced here rather than in
// the schema so the diagnostic can name the claim and emit a real pointer;
// a schema error on an optional property would be generic.

test('a measured claim with no baseline evidence_ref is rejected', () => {
  const doc = good();
  delete doc.claims[0].baseline.evidence_ref;
  const d = semanticDiagnostics(doc).find((x) => x.code === 'claim/measured-no-evidence');
  assert.ok(d, 'a measured claim with an uncited baseline must be rejected');
  assert.equal(d.subject.pointer, '/claims/0/baseline/evidence_ref');
  assert.equal(d.subject.id, 'c1');
  assert.ok(d.supportedFixes.some((f) => f.includes('/claims/0/baseline/evidence_ref')));
});

test('a measured claim with no current evidence_ref is rejected', () => {
  const doc = good();
  delete doc.claims[0].current.evidence_ref;
  const d = semanticDiagnostics(doc).find((x) => x.code === 'claim/measured-no-evidence');
  assert.ok(d, 'a measured claim with an uncited current must be rejected');
  assert.equal(d.subject.pointer, '/claims/0/current/evidence_ref');
});

test('a measured claim citing evidence on both points is clean', () => {
  assert.ok(!codes(good()).includes('claim/measured-no-evidence'));
});

test('an estimated claim without an evidence_ref does NOT fire measured-no-evidence', () => {
  const doc = good();
  // c2 is estimated: its points carry no evidence_ref by design. Spec 4.3
  // requires assumption.statement and assumption.owner for that tier, not a
  // citation.
  assert.equal(doc.claims[1].tier, 'estimated');
  assert.equal(doc.claims[1].baseline.evidence_ref, undefined);
  assert.ok(!codes(doc).includes('claim/measured-no-evidence'));
});

// --- Fix 7: claim/direction-mismatch ---

test('a stated direction contradicting the figures is flagged', () => {
  const doc = good();
  doc.claims[0].direction = 'increase'; // c1 falls 72 -> 9
  const d = semanticDiagnostics(doc).find((x) => x.code === 'claim/direction-mismatch');
  assert.ok(d, 'a rising label on a falling number must be rejected');
  assert.equal(d.subject.pointer, '/claims/0/direction');
  assert.equal(d.evidence.actualDirection, 'decrease');
  assert.ok(d.supportedFixes.some((f) => f.includes('"decrease"')));
});

test('the fixture’s directions agree with its figures', () => {
  assert.ok(!codes(good()).includes('claim/direction-mismatch'));
});

test('equal baseline and current are not a direction mismatch either way', () => {
  // No movement contradicts neither "increase" nor "decrease", so neither
  // is an assertion the figures disprove. Reporting one would demand a
  // change with no truthful answer.
  for (const direction of ['increase', 'decrease']) {
    const doc = good();
    doc.claims[0].direction = direction;
    doc.claims[0].current.value = doc.claims[0].baseline.value;
    assert.ok(!codes(doc).includes('claim/direction-mismatch'),
      `equal values must not fire for direction ${direction}`);
  }
});

// --- Fix 11: duplicate ids silently drop claims ---

test('a duplicate claim id is flagged at the later occurrence', () => {
  const doc = good();
  doc.claims[1].id = 'c1';
  const d = semanticDiagnostics(doc).find((x) => x.code === 'claim/duplicate-id');
  assert.ok(d, 'a duplicate claim id must be rejected — the renderer keeps only the last');
  assert.equal(d.subject.pointer, '/claims/1/id');
  assert.equal(d.evidence.firstIndex, 0);
});

test('three claims sharing one id do not validate clean', () => {
  const doc = good();
  for (const c of doc.claims) c.id = 'c1';
  doc.arc.outcome.claim_refs = ['c1'];
  const fired = codes(doc).filter((c) => c === 'claim/duplicate-id');
  assert.equal(fired.length, 2, 'both later duplicates must be named');
});

test('a duplicate evidence ref is flagged at the later occurrence', () => {
  const doc = good();
  doc.evidence[1].ref = 'e1';
  const d = semanticDiagnostics(doc).find((x) => x.code === 'evidence/duplicate-ref');
  assert.ok(d, 'a duplicate evidence ref must be rejected');
  assert.equal(d.subject.pointer, '/evidence/1/ref');
  assert.equal(d.evidence.firstIndex, 0);
});

// A rubric score is the failure this domain is shaped to produce: a real
// number, in a document that really was read, that is a prioritisation
// judgement rather than a measurement. Every other check passes it.
const rubricCase = (metric, unit, baseline, current) => ({
  schema_version: 1,
  meta: { title: 'case', period: '2026-01' },
  initiative: { id: 'i', name: 'n' },
  drivers: { primary: 'productivity' },
  arc: { problem: { headline: 'h' }, capability: { headline: 'h' },
    outcome: { headline: 'h', claim_refs: ['x'] }, significance: { headline: 'h' } },
  claims: [{ id: 'x', tier: 'measured', driver: 'productivity', metric, unit, direction: 'increase',
    baseline: { value: baseline, asof: '2026-01', evidence_ref: 'e' },
    current: { value: current, asof: '2026-06', evidence_ref: 'e' } }],
  evidence: [{ ref: 'e', kind: 'doc', title: 't', date: '2026-01-01' }],
});
const rubricCodes = (...args) => semanticDiagnostics(rubricCase(...args))
  .filter((d) => d.code.startsWith('claim/measured-from'));

test('a rubric score cannot be tiered measured', () => {
  for (const [metric, unit, from, to] of [
    ['Effectiveness rating', 'rubric points', 0, 4],
    ['Effectiveness', 'points', 2, 4],
    ['Priority Score', 'pts', 48, 58],
    ['Integration complexity', '', 2, 3],
  ]) {
    const found = rubricCodes(metric, unit, from, to);
    assert.equal(found.length, 1, `${metric} / ${unit} must be refused`);
    assert.equal(found[0].code, 'claim/measured-from-rubric');
    assert.equal(found[0].severity, 'error');
  }
});

// The guard is only worth having if it does not refuse real metrics. Blocking
// every unit containing "score" would take NPS and safety scores with it.
test('legitimate measured metrics are not refused', () => {
  for (const [metric, unit, from, to] of [
    ['Median days to first draft', 'days', 9, 4],
    ['Net promoter score', 'score', 32, 48],
    ['Safety observation score', 'score', 78, 91],
    ['Control exceptions', 'count', 18, 3],
    // The rubric-dimension match is anchored to the whole field, so a real
    // metric that merely contains the word survives.
    ['Effectiveness of triage routing', 'cases/week', 40, 62],
  ]) {
    assert.deepEqual(rubricCodes(metric, unit, from, to), [],
      `${metric} / ${unit} is a real metric and must pass`);
  }
});

test('a small-integer rating warns but never refuses', () => {
  const found = rubricCodes('Maturity level', 'level', 2, 4);
  assert.equal(found.length, 1);
  assert.equal(found[0].code, 'claim/measured-from-rating');
  assert.equal(found[0].severity, 'warning', 'a maturity level may be the honest metric; that is a human call');
});

test('the rubric fixes never suggest rewording, which is a prohibited repair', () => {
  const fixes = rubricCodes('Effectiveness', 'rubric points', 0, 4)[0].supportedFixes.join(' ');
  assert.doesNotMatch(fixes, /reword|rephrase|rename the metric/i);
  assert.match(fixes, /not yet quantified/);
});

test('only measured claims are checked: an estimated rubric figure is a different problem', () => {
  const doc = rubricCase('Effectiveness', 'rubric points', 0, 4);
  doc.claims[0].tier = 'estimated';
  doc.claims[0].assumption = { statement: 'assessor judgement', owner: 'Portfolio office' };
  assert.deepEqual(semanticDiagnostics(doc).filter((d) => d.code === 'claim/measured-from-rubric'), []);
});
