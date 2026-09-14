import { createHash } from 'node:crypto';
import { writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { validateCase } from './validate.mjs';
import { renderCase } from './render/render-case.mjs';
import { normalizedDiagnostic } from './diagnostics.mjs';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// A failure to WRITE the artifact is an output fault, not an input fault.
// Left to the crash boundary it would be classified by fallbackDiagnostic()
// as `input/read` with an empty subject and a fix pointing at the input
// file -- three wrong answers at once, plus a leaked `.candidate` path that
// names nothing the agent wrote. Classify it here, where the real output
// destination is in scope.
function outputWriteDiagnostic(error, outputPath) {
  const reason = String(error?.message || error || 'unknown error')
    // The temp file is an implementation detail of the atomic commit; the
    // agent can only act on the destination it actually asked for.
    .replaceAll(`${outputPath}.candidate`, outputPath);
  return normalizedDiagnostic({
    code: 'output/write',
    message: `The artifact could not be written to ${outputPath}: ${reason}`,
    subject: { output: outputPath },
    evidence: { systemCode: error?.code || 'unknown', errorName: error?.name || 'Error' },
    supportedFixes: [
      `supply an output path in an existing, writable directory instead of ${outputPath}`,
    ],
  });
}

/**
 * @param {object} doc the value case
 * @param {string} outputPath where the artifact is committed
 * @param {{manifest?: object}} [options] an evidence manifest from `readManifest`
 *
 * The receipt carries `citationsVerified`. It is TRUE only when a manifest was
 * supplied and every citation was checked against it; with no manifest it is
 * FALSE, because the tool performed no such verification and must not imply
 * one. A hand-authored case still delivers -- it just delivers unverified, and
 * says so.
 */
export function deliverCase(doc, outputPath, options = {}) {
  const citationsVerified = Boolean(options.manifest);
  const result = validateCase(doc, options);
  if (!result.ok) {
    return { ok: false, artifact: null, citationsVerified, diagnostics: result.diagnostics };
  }

  const candidate = `${outputPath}.candidate`;
  const html = renderCase(doc);
  const spec = JSON.stringify(doc);

  try {
    writeFileSync(candidate, html, 'utf8');
    renameSync(candidate, outputPath);
  } catch (error) {
    try {
      if (existsSync(candidate)) unlinkSync(candidate);
    } catch {
      // Cleanup is best-effort; the original write failure is the one to report.
    }
    return {
      ok: false,
      artifact: null,
      citationsVerified,
      diagnostics: [outputWriteDiagnostic(error, outputPath)],
    };
  }

  return {
    ok: true,
    artifact: outputPath,
    citationsVerified,
    specSha256: sha256(spec),
    artifactSha256: sha256(html),
    bytes: { spec: Buffer.byteLength(spec), artifact: Buffer.byteLength(html) },
    diagnostics: [],
  };
}
