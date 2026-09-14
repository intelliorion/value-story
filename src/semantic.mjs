import { isDriver } from './drivers.mjs';
import { normalizedDiagnostic } from './diagnostics.mjs';

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

  const evidenceRefs = new Set((doc?.evidence || []).map((e) => e?.ref).filter(Boolean));
  const claimIds = new Set(claims.map((c) => c?.id).filter(Boolean));

  const checkEvidence = (ref, pointer) => {
    if (ref && !evidenceRefs.has(ref)) {
      push({
        code: 'evidence/ref-unresolved',
        message: `Reference ${JSON.stringify(ref)} at ${pointer} does not resolve to an evidence entry.`,
        subject: { pointer, ref },
        evidence: { knownRefs: [...evidenceRefs] },
        supportedFixes: [`set ${pointer} to a ref present in /evidence`],
        suppresses: ['claim/measured-no-baseline'],
      });
    }
  };

  claims.forEach((claim, i) => {
    checkEvidence(claim?.baseline?.evidence_ref, `/claims/${i}/baseline/evidence_ref`);
    checkEvidence(claim?.current?.evidence_ref, `/claims/${i}/current/evidence_ref`);
    checkEvidence(claim?.evidence_ref, `/claims/${i}/evidence_ref`);
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
