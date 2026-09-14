import schemaValidate from '../generated/validate-value-case.mjs';
import { semanticDiagnostics } from './semantic.mjs';
import { reconcileDiagnostics } from './reconcile.mjs';
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
  if (/\/evidence\/\d+$/.test(p)) return 'evidence/locator-missing';
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

export function validateCase(doc) {
  const schema = schemaDiagnostics(doc);
  if (schema.length) return { ok: false, diagnostics: applySuppression(schema) };

  const semantic = semanticDiagnostics(doc);
  const reconcile = semantic.length ? [] : reconcileDiagnostics(doc, renderCase(doc));
  const diagnostics = applySuppression([...semantic, ...reconcile]);
  return { ok: diagnostics.every((d) => d.severity === 'warning'), diagnostics };
}
