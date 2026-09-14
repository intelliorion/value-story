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
