import { isDriver } from './drivers.mjs';
import { normalizedDiagnostic } from './diagnostics.mjs';
// normalizeTier is the single authority on what a claim's tier IS; comparing
// `claim.tier` raw here would re-derive the same semantics in a second place.
import { normalizeTier } from './render/claim-card.mjs';

export function semanticDiagnostics(doc) {
  const out = [];
  const push = (d) => out.push(normalizedDiagnostic(d));

  const primary = doc?.drivers?.primary;
  const secondary = Array.isArray(doc?.drivers?.secondary) ? doc.drivers.secondary : [];
  const declared = new Set([primary, ...secondary].filter(Boolean));

  if (primary && !isDriver(primary)) {
    push({
      code: 'driver/unknown',
      message: `Primary driver ${JSON.stringify(primary)} is not one of the ten value drivers.`,
      subject: { pointer: '/drivers/primary', value: primary },
      evidence: { closedEnumeration: true },
      supportedFixes: ['set /drivers/primary to one of the ten driver ids'],
      suppresses: ['claim/driver-undeclared', 'driver/primary-no-claim'],
    });
  }

  secondary.forEach((id, i) => {
    if (id === primary) {
      push({
        code: 'driver/secondary-shadows-primary',
        message: `Secondary driver ${JSON.stringify(id)} repeats the primary driver.`,
        subject: { pointer: `/drivers/secondary/${i}`, value: id },
        evidence: { primary },
        supportedFixes: [`remove /drivers/secondary/${i}`],
      });
    }
  });

  const claims = Array.isArray(doc?.claims) ? doc.claims : [];
  claims.forEach((claim, i) => {
    if (claim?.driver && !declared.has(claim.driver)) {
      push({
        code: 'claim/driver-undeclared',
        message: `Claim ${JSON.stringify(claim.id)} names driver ${JSON.stringify(claim.driver)}, which the initiative does not declare.`,
        subject: { collection: 'claims', index: i, id: claim.id, driver: claim.driver },
        evidence: { declared: [...declared] },
        supportedFixes: [
          `set /claims/${i}/driver to a declared driver`,
          `add ${JSON.stringify(claim.driver)} to /drivers/secondary`,
        ],
      });
    }
  });

  if (primary && isDriver(primary) && !claims.some((c) => c?.driver === primary)) {
    push({
      code: 'driver/primary-no-claim',
      message: `Primary driver ${JSON.stringify(primary)} has no claim behind it.`,
      subject: { pointer: '/drivers/primary', value: primary },
      evidence: { claimCount: claims.length },
      supportedFixes: [`add a claim to /claims whose driver is ${JSON.stringify(primary)}`],
    });
  }

  // Invariant: ids address claims and evidence. A duplicate id is not a
  // cosmetic problem -- the renderer keys claims by id in a Map, so every
  // claim after the first with a given id silently replaces its predecessor
  // and vanishes from the artifact. Name the later occurrence, since the
  // first is the one the rest of the document most likely means.
  const seenClaimId = new Map();
  claims.forEach((claim, i) => {
    const id = claim?.id;
    if (!id) return;
    if (seenClaimId.has(id)) {
      push({
        code: 'claim/duplicate-id',
        message: `Claim id ${JSON.stringify(id)} is used more than once; only one claim with this id can be addressed or rendered.`,
        subject: { pointer: `/claims/${i}/id`, collection: 'claims', index: i, id },
        evidence: { firstIndex: seenClaimId.get(id) },
        supportedFixes: [`set /claims/${i}/id to an id no other claim uses`],
      });
      return;
    }
    seenClaimId.set(id, i);
  });

  const evidenceItems = Array.isArray(doc?.evidence) ? doc.evidence : [];
  const seenEvidenceRef = new Map();
  evidenceItems.forEach((entry, i) => {
    const ref = entry?.ref;
    if (!ref) return;
    if (seenEvidenceRef.has(ref)) {
      push({
        code: 'evidence/duplicate-ref',
        message: `Evidence ref ${JSON.stringify(ref)} is used more than once; a citation to it cannot name a single source.`,
        subject: { pointer: `/evidence/${i}/ref`, collection: 'evidence', index: i, ref },
        evidence: { firstIndex: seenEvidenceRef.get(ref) },
        supportedFixes: [`set /evidence/${i}/ref to a ref no other evidence entry uses`],
      });
      return;
    }
    seenEvidenceRef.set(ref, i);
  });

  const evidenceRefs = new Set(evidenceItems.map((e) => e?.ref).filter(Boolean));
  const claimIds = new Set(claims.map((c) => c?.id).filter(Boolean));

  const checkEvidence = (ref, pointer) => {
    if (ref && !evidenceRefs.has(ref)) {
      push({
        code: 'evidence/ref-unresolved',
        message: `Reference ${JSON.stringify(ref)} at ${pointer} does not resolve to an evidence entry.`,
        subject: { pointer, ref },
        evidence: { knownRefs: [...evidenceRefs] },
        supportedFixes: [`set ${pointer} to a ref present in /evidence`],
      });
    }
  };

  claims.forEach((claim, i) => {
    checkEvidence(claim?.baseline?.evidence_ref, `/claims/${i}/baseline/evidence_ref`);
    checkEvidence(claim?.current?.evidence_ref, `/claims/${i}/current/evidence_ref`);
    checkEvidence(claim?.evidence_ref, `/claims/${i}/evidence_ref`);
  });

  // Spec 4.6 invariant 4 and the 4.3 tier table: a `measured` claim's
  // baseline and current must EACH resolve to real evidence. The schema can
  // only say `evidence_ref` is optional on a point, because `estimated`
  // claims legitimately carry points without one (they carry an assumption
  // owner instead). So the requirement lives here, where the claim's tier is
  // in scope and the diagnostic can name the exact pointer that is missing.
  // Deliberately NOT applied to `estimated`.
  claims.forEach((claim, i) => {
    if (claim?.tier !== 'measured') return;
    for (const side of ['baseline', 'current']) {
      const point = claim?.[side];
      if (!point || typeof point !== 'object') continue; // absent point: claim/measured-no-baseline
      if (point.evidence_ref) continue;
      const pointer = `/claims/${i}/${side}/evidence_ref`;
      push({
        code: 'claim/measured-no-evidence',
        message: `Measured claim ${JSON.stringify(claim.id)} cites no evidence for its ${side}. `
          + 'A measured claim asserts a real before and after from a cited source; without a '
          + 'citation it is an estimate wearing the measured treatment.',
        subject: { pointer, collection: 'claims', index: i, id: claim.id, tier: 'measured', side },
        evidence: { knownRefs: [...evidenceRefs] },
        supportedFixes: [
          `set ${pointer} to the ref of the evidence entry that records this ${side}`,
          `set /claims/${i}/tier to "estimated" and add /claims/${i}/assumption with a statement and a named owner, if no source measures this`,
        ],
      });
    }
  });

  // Spec 5.1 `claim/direction-mismatch`: the stated direction must not
  // contradict the movement the numbers actually describe, or the renderer
  // marks a rising number as a fall. Equal values are NOT a mismatch --
  // neither direction is contradicted by no movement -- so they pass.
  claims.forEach((claim, i) => {
    const direction = claim?.direction;
    if (direction !== 'increase' && direction !== 'decrease') return;
    const from = claim?.baseline?.value;
    const to = claim?.current?.value;
    if (typeof from !== 'number' || typeof to !== 'number') return;
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    if (from === to) return;
    const actual = to > from ? 'increase' : 'decrease';
    if (actual === direction) return;
    push({
      code: 'claim/direction-mismatch',
      message: `Claim ${JSON.stringify(claim.id)} states direction ${JSON.stringify(direction)}, `
        + `but ${from} to ${to} is an ${actual}.`,
      subject: {
        pointer: `/claims/${i}/direction`,
        collection: 'claims',
        index: i,
        id: claim.id,
        value: direction,
      },
      evidence: { baseline: from, current: to, actualDirection: actual },
      supportedFixes: [
        `set /claims/${i}/direction to ${JSON.stringify(actual)} if the figures are right`,
        `correct /claims/${i}/baseline/value or /claims/${i}/current/value if a figure is wrong`,
      ],
    });
  });

  // A RUBRIC SCORE IS NOT A BUSINESS RESULT.
  //
  // This is the failure this domain is shaped to produce. A portfolio record
  // carries `effectiveness 4`, `efficiency 2` -- real numbers, in a document
  // that really was read, so every other check passes. They are a
  // prioritisation judgement about what to build next, not a measurement of
  // what changed. Promoting one manufactures a business result out of a
  // routing decision, and it does it while looking perfectly sourced.
  //
  // The check is deliberately HIGH PRECISION and low recall. Blocking every
  // unit containing "score" would refuse legitimate measured metrics -- safety
  // scores, NPS, audit scores are real things a firm measures. So the error
  // fires only on vocabulary that is unambiguously a scoring rubric, and the
  // softer signal is a warning that asks a human to look rather than refusing.
  const RUBRIC_WORD = /\brubrics?\b|\b(priority|routing)\s+score\b|\bweighted\s+(pts|points)\b/i;
  // The dimensions of the stakeholders' own rubric. As a METRIC these name a
  // judgement; as part of a longer metric ("effectiveness of triage") they do
  // not, so the match is anchored to the whole field.
  const RUBRIC_DIMENSION = /^\s*(effectiveness|efficiency|priority|urgency|user\s*scale|effort(\s*complexity)?|impact\s*of\s*failure|data\s*sensitivity|integration\s*complexity)(\s*(score|rating|level))?\s*$/i;
  const RATING_UNIT = /\b(score|rating|points?|pts|level|band|grade)\b/i;

  claims.forEach((claim, i) => {
    if (normalizeTier(claim) !== 'measured') return;
    const metric = String(claim?.metric || '');
    const unit = String(claim?.unit || '');
    const hit = [metric, unit].find((v) => RUBRIC_WORD.test(v))
      || (RUBRIC_DIMENSION.test(metric) ? metric : undefined);

    if (hit !== undefined) {
      push({
        code: 'claim/measured-from-rubric',
        message: `Claim ${JSON.stringify(claim.id)} is tiered "measured" but ${JSON.stringify(hit)} names a scoring rubric. `
          + 'A rubric score is a prioritisation judgement about what to build next, not a measurement of what changed. '
          + 'It is a real number in a real document, which is exactly why nothing else here catches it.',
        subject: { pointer: `/claims/${i}/tier`, collection: 'claims', index: i, id: claim.id, matched: hit },
        evidence: { metric, unit, tier: 'measured' },
        supportedFixes: [
          `set /claims/${i}/metric and the figures to the business outcome the rubric was scoring, if that outcome was measured`,
          `remove this claim from /claims and say in the report that the benefit is not yet quantified`,
        ],
      });
      return;
    }

    // A judgement dressed as a measurement: a rating-like unit moving between
    // small integers. NPS and CSAT sit outside this range, which is why the
    // bound is there. A warning, never a refusal -- a maturity level really
    // may be the honest metric, and that is a human call.
    const from = claim?.baseline?.value;
    const to = claim?.current?.value;
    const smallInteger = (v) => Number.isInteger(v) && v >= 0 && v <= 10;
    if (RATING_UNIT.test(unit) && smallInteger(from) && smallInteger(to)) {
      push({
        code: 'claim/measured-from-rating',
        severity: 'warning',
        message: `Claim ${JSON.stringify(claim.id)} is tiered "measured" on a unit of ${JSON.stringify(unit)} moving ${from} to ${to}. `
          + 'A small-integer rating is often a judgement rather than a measurement. Confirm the source REPORTS this as an observation.',
        subject: { pointer: `/claims/${i}/tier`, collection: 'claims', index: i, id: claim.id },
        evidence: { unit, baseline: from, current: to, range: '0-10 integers' },
        supportedFixes: [
          `confirm the cited source reports ${JSON.stringify(unit)} as an observation, and leave /claims/${i}/tier as "measured"`,
          `set /claims/${i}/tier to "estimated" and name an owner in /claims/${i}/assumption/owner, if it is a judgement somebody made`,
        ],
      });
    }
  });

  for (const slot of ['problem', 'capability', 'significance']) {
    (doc?.arc?.[slot]?.evidence_refs || []).forEach((ref, i) => {
      checkEvidence(ref, `/arc/${slot}/evidence_refs/${i}`);
    });
  }

  (doc?.arc?.outcome?.claim_refs || []).forEach((ref, i) => {
    if (!claimIds.has(ref)) {
      push({
        code: 'evidence/ref-unresolved',
        message: `Outcome references claim ${JSON.stringify(ref)}, which does not exist.`,
        subject: { pointer: `/arc/outcome/claim_refs/${i}`, ref },
        evidence: { knownClaims: [...claimIds] },
        supportedFixes: [`set /arc/outcome/claim_refs/${i} to an id present in /claims`],
      });
    }
  });

  return out;
}
