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
    suppressionDepth -= 1;
  }
}

export function applySuppression(diagnostics) {
  const suppressed = new Set();
  for (const d of diagnostics) {
    for (const code of d.suppresses || []) {
      if (code !== d.code) suppressed.add(code);
    }
  }
  return diagnostics.filter((d) => !suppressed.has(d.code));
}

export function throwDiagnosticError(message, diagnostics) {
  for (const d of diagnostics || []) recordDiagnostic(d);
  const error = new Error(message);
  error.vsDiagnostics = (diagnostics || []).map(normalizedDiagnostic);
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
