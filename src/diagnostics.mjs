import fs from 'node:fs';

const recorded = [];
const recordedMessages = new Set();
let suppressionDepth = 0;
let boundaryInstalled = false;

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function stringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((v) => String(v).trim()).filter(Boolean))]
    : [];
}

export function normalizedDiagnostic(diagnostic) {
  return {
    code: String(diagnostic?.code || 'internal/unclassified'),
    severity: diagnostic?.severity === 'warning' ? 'warning' : 'error',
    message: String(diagnostic?.message || 'Unclassified failure.').trim(),
    subject: plainObject(diagnostic?.subject),
    evidence: plainObject(diagnostic?.evidence),
    supportedFixes: stringList(diagnostic?.supportedFixes),
    ...(Array.isArray(diagnostic?.suppresses)
      ? { suppresses: stringList(diagnostic.suppresses) } : {}),
  };
}

export function recordDiagnostic(diagnostic) {
  if (suppressionDepth > 0) return;
  const normalized = normalizedDiagnostic(diagnostic);
  if (recordedMessages.has(normalized.message)) return;
  recordedMessages.add(normalized.message);
  recorded.push(normalized);
}

export function collected() {
  return [...recorded];
}

export function resetDiagnostics() {
  recorded.length = 0;
  recordedMessages.clear();
  suppressionDepth = 0;
}

export function withRecordingSuppressed(callback) {
  suppressionDepth += 1;
  try {
    return callback();
  } finally {
    suppressionDepth = Math.max(0, suppressionDepth - 1);
  }
}

export function applySuppression(diagnostics) {
  // Build a lookup of code → its suppresses list (Guard 1 preparation)
  const suppressMap = new Map();
  for (const d of diagnostics) {
    suppressMap.set(d.code, d.suppresses || []);
  }

  const suppressed = new Set();
  for (const d of diagnostics) {
    for (const code of d.suppresses || []) {
      // Guard 1: ignore reciprocal edges (A→B only if B doesn't also suppress A)
      const targetSuppresses = suppressMap.get(code) || [];
      if (code !== d.code && !targetSuppresses.includes(d.code)) {
        suppressed.add(code);
      }
    }
  }

  const filtered = diagnostics.filter((d) => !suppressed.has(d.code));
  // Guard 2: non-empty backstop (if result is empty but input wasn't, return input unchanged)
  return filtered.length > 0 || diagnostics.length === 0 ? filtered : diagnostics;
}

export function throwDiagnosticError(message, diagnostics) {
  const normalized = (diagnostics || []).map(normalizedDiagnostic);
  for (const d of normalized) recordDiagnostic(d);
  // Dedupe by message and apply suppression to match collected()
  const deduped = [];
  const seen = new Set();
  for (const d of normalized) {
    if (!seen.has(d.message)) {
      seen.add(d.message);
      deduped.push(d);
    }
  }
  const error = new Error(message);
  error.vsDiagnostics = applySuppression(deduped);
  throw error;
}

export function fallbackDiagnostic(error, input) {
  if (error instanceof SyntaxError) {
    return normalizedDiagnostic({
      code: 'input/json-parse',
      message: `Input JSON could not be parsed: ${error.message}`,
      subject: { input },
      evidence: { reason: error.message },
      supportedFixes: ['repair the JSON syntax and run validation again'],
    });
  }
  if (['ENOENT', 'EACCES', 'EISDIR'].includes(error?.code)) {
    return normalizedDiagnostic({
      code: 'input/read',
      message: `Input could not be read: ${error.message}`,
      subject: { input },
      evidence: { systemCode: error.code },
      supportedFixes: ['provide one readable JSON input file'],
    });
  }
  return normalizedDiagnostic({
    code: 'internal/unclassified',
    message: error?.message || 'Renderer failed without a diagnostic.',
    subject: { input },
    evidence: { errorName: error?.name || 'Error' },
    supportedFixes: ['this failure could not be automatically classified; report the input document and this message'],
  });
}

export function installDiagnosticBoundary() {
  if (boundaryInstalled) return;
  boundaryInstalled = true;
  process.on('uncaughtException', (error) => {
    const payload = JSON.stringify({
      schemaVersion: 1, ok: false, source: 'renderer',
      error: error?.message || 'Renderer failed without a diagnostic.',
      diagnostics: collected().length ? collected() : [fallbackDiagnostic(error)],
    });
    try {
      fs.writeSync(process.stderr.fd, `${payload}\n`);
    } catch {
      // Already failing; do not mask the real error with a stream failure.
    }
    process.exit(1);
  });
}
