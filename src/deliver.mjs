import { createHash } from 'node:crypto';
import { writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { validateCase } from './validate.mjs';
import { renderCase } from './render/render-case.mjs';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

export function deliverCase(doc, outputPath) {
  const result = validateCase(doc);
  if (!result.ok) {
    return { ok: false, artifact: null, diagnostics: result.diagnostics };
  }

  const candidate = `${outputPath}.candidate`;
  const html = renderCase(doc);
  const spec = JSON.stringify(doc);

  try {
    writeFileSync(candidate, html, 'utf8');
    renameSync(candidate, outputPath);
  } catch (error) {
    if (existsSync(candidate)) unlinkSync(candidate);
    throw error;
  }

  return {
    ok: true,
    artifact: outputPath,
    specSha256: sha256(spec),
    artifactSha256: sha256(html),
    bytes: { spec: Buffer.byteLength(spec), artifact: Buffer.byteLength(html) },
    diagnostics: [],
  };
}
