import schemaValidate from '../generated/validate-value-case.mjs';
import { semanticDiagnostics } from './semantic.mjs';
import { reconcileDiagnostics } from './reconcile.mjs';
import { manifestDiagnostics } from './manifest.mjs';
import { renderCase } from './render/render-case.mjs';
import { normalizedDiagnostic, applySuppression } from './diagnostics.mjs';

// Map Ajv failures onto the named codes in spec 5.1, so the agent sees a
// domain diagnostic rather than a generic schema error.
function codeFor(error) {
  const p = error.instancePath || '';
  const missing = error.params?.missingProperty;

  if (p === '/arc' && missing) return 'arc/slot-missing';
  if (/^\/arc\/\w+$/.test(p) && missing === 'headline') return 'arc/slot-empty';
  if (p === '/arc/outcome' && error.keyword === 'additionalProperties') {
    return 'arc/outcome-inline-number';
  }
  if (/^\/claims\/\d+$/.test(p)) {
    if (missing === 'tier') return 'claim/tier-missing';
    if (missing === 'baseline' || missing === 'current') return 'claim/measured-no-baseline';
    if (missing === 'assumption') return 'claim/estimated-no-assumption';
    if (missing === 'unit') return 'claim/unit-missing';
    if (error.keyword === 'not') return 'claim/qualitative-has-number';
  }
  if (/^\/claims\/\d+\/assumption$/.test(p) && missing === 'owner') {
    return 'claim/estimated-no-owner';
  }
  if (/\/driver$|\/drivers\/(primary|secondary)/.test(p) && error.keyword === 'enum') {
    return 'driver/unknown';
  }
  // Deliberately NO special case for /evidence/N. `locator` is optional in
  // the schema, so a schema error on an evidence item is never a missing
  // locator -- it is a missing `ref`, `kind`, `title` or `date`, or a
  // malformed one. Asserting a false cause is worse than a generic code: the
  // generic diagnostic still carries the exact pointer and Ajv's own message.
  return 'schema/invalid';
}

function schemaDiagnostics(doc) {
  if (schemaValidate(doc)) return [];
  return (schemaValidate.errors || []).map((error) => {
    const pointer = error.instancePath || '/';
    const missing = error.params?.missingProperty;
    const target = missing ? `${pointer}/${missing}` : pointer;
    return normalizedDiagnostic({
      code: codeFor(error),
      message: `${target} ${error.message}.`,
      subject: { pointer: target, keyword: error.keyword },
      evidence: error.params || {},
      supportedFixes: [missing
        ? `set ${target} — it is required here`
        : `correct ${target} to satisfy: ${error.message}`],
    });
  });
}

/**
 * @param {object} doc the value case
 * @param {{manifest?: object}} [options] an evidence manifest, already read and
 *   validated by `readManifest`. Omitted, the manifest check does not run --
 *   see `src/manifest.mjs`, and note that the DELIVERY RECEIPT records whether
 *   one was supplied, so silence here is never mistaken for verification.
 */
export function validateCase(doc, options = {}) {
  const schema = schemaDiagnostics(doc);
  // The manifest check sits AFTER the schema short-circuit, with semantic and
  // reconciliation, for the same reason they do: it reads `/evidence/N/title`,
  // and in a schema-invalid document that field may be absent, empty or not a
  // string. A "citation not in the manifest" reported against a title the
  // schema has already rejected is noise -- worse than noise, since it invites
  // the agent to invent a title to satisfy it. Repair the shape first.
  if (schema.length) return { ok: false, diagnostics: applySuppression(schema) };

  const semantic = semanticDiagnostics(doc);
  // Manifest diagnostics run ALONGSIDE the semantic ones rather than behind
  // them: a fabricated citation is an independent fact about the document, not
  // a consequence of any semantic fault, and hiding it behind an unrelated
  // driver or claim error would cost an extra repair round for no gain.
  const manifest = manifestDiagnostics(doc, options.manifest);
  // Reconciliation stays gated on semantic diagnostics alone: it is derived
  // from rendered output, which manifest faults do not affect.
  const reconcile = semantic.length ? [] : reconcileDiagnostics(doc, renderCase(doc));
  const diagnostics = applySuppression([...semantic, ...manifest, ...reconcile]);
  return { ok: diagnostics.every((d) => d.severity === 'warning'), diagnostics };
}
