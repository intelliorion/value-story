/**
 * The evidence manifest: the record of what was actually read.
 *
 * The principal risk in this domain is not a layout bug. It is an agent
 * inventing an `evidence[]` entry to satisfy a dangling reference -- easier
 * than admitting a gap, and undetectable downstream. This module is the check
 * that makes that impossible, and it enforces exactly one rule:
 *
 *                   YOU CANNOT CITE WHAT YOU DID NOT READ.
 *
 * Four decisions in here are load-bearing, and each is deliberate:
 *
 * 1. The check is OPT-IN. With no manifest supplied nothing fires, because a
 *    hand-authored case remains legitimate. The honesty is preserved instead
 *    by the DELIVERY RECEIPT, which records whether a manifest was supplied --
 *    so "citations were verified" is never claimed when nothing was verified.
 *
 * 2. Matching is EXACT. A title differing only in case or spacing is a
 *    CANDIDATE, never a pass. Auto-resolving a near match is precisely the
 *    behaviour this module exists to prevent: it would let a plausible-looking
 *    invented title attach itself to a real document.
 *
 * 3. A manifest listing documents the case does not cite is FINE. Reading more
 *    than you cite is normal and good practice, so an uncited row is silent --
 *    including when the file behind it has since changed.
 *
 * 4. Staleness is checked only for CITED documents, and only for files still
 *    on disk. A file that has moved or been deleted is a softer condition: the
 *    document genuinely was read, and deleting it afterwards does not un-read
 *    it. That is a WARNING; changed bytes under a live citation is an ERROR,
 *    because the quote or locator may no longer say what the case claims.
 *
 * 5. A title matching MORE THAN ONE row NEVER resolves. Nothing in the
 *    manifest format makes a title unique -- two `.eml` files exported from
 *    one thread share a `Subject:`, which is the norm rather than an edge
 *    case -- so first-wins resolution would hash the wrong row and then
 *    CONFIRM it. `evidence/ambiguous-citation` names every matching path
 *    instead, because the honest answer to "which of these did you read?" is
 *    a question back to the author, never a guess.
 *
 * 6. A cited row whose extraction produced NO CHARACTERS is an ERROR. The row
 *    records that the file was opened; it does not record that anything was
 *    read out of it. Citing it is exactly "citing what you did not read",
 *    which is the one rule this module exists to enforce.
 *
 * 7. A cited row carrying an extraction WARNING -- a lossy decode, an unknown
 *    charset, an 8-bit header, a converter's own complaint, a dropped
 *    attachment -- is reported at WARNING severity. The text may well be
 *    fine, so it does not block delivery; but silently-wrong text quoted as
 *    a source is the failure mode this whole pipeline is built against, so it
 *    must reach the receipt where an agent can act on it.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import schemaValidate from '../generated/validate-evidence-manifest.mjs';
import {
  normalizedDiagnostic, throwDiagnosticError, fallbackDiagnostic,
} from './diagnostics.mjs';

const MAX_CANDIDATES = 3;
/** Above this, a candidate is worth naming in the message as "the closest". */
const NEAR = 0.6;

/** Case- and whitespace-insensitive form, used ONLY for ranking candidates. */
const normalize = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Classic Levenshtein distance, two-row form. Titles are short; this is cheap. */
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** Sorensen-Dice over word tokens: catches reordering that edit distance punishes. */
function tokenOverlap(a, b) {
  const left = new Set(a.split(' ').filter(Boolean));
  const right = new Set(b.split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return (2 * shared) / (left.size + right.size);
}

/**
 * How alike two titles are, in [0, 1]. The better of a character-level and a
 * word-level measure, so neither a typo nor a reordering hides a real match.
 */
export function similarity(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const ratio = 1 - editDistance(left, right) / Math.max(left.length, right.length);
  return Math.max(ratio, tokenOverlap(left, right));
}

/**
 * The manifest titles closest to `title`, best first.
 *
 * Always returns something when the manifest is non-empty: the repair is to
 * choose a title that IS in the manifest, so the agent needs the shortlist
 * even when nothing is especially close. The score is reported alongside so a
 * caller can tell "you meant this one" from "nothing here resembles it".
 */
export function closestTitles(title, manifestTitles, limit = MAX_CANDIDATES) {
  return [...new Set(manifestTitles)]
    .map((candidate) => ({ title: candidate, score: similarity(title, candidate) }))
    .sort((a, b) => (b.score - a.score) || (a.title < b.title ? -1 : 1))
    .slice(0, limit);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Read and validate an evidence manifest.
 *
 * Every failure -- absent file, malformed JSON, schema violation -- leaves as
 * a thrown Error carrying `vsDiagnostics`, never as a crash: the caller gets a
 * receipt it can print, and the agent never sees a stack trace.
 *
 * @param {string} path
 * @returns {{documents: Array<{path: string, title: string, kind: string,
 *            sha256: string, bytes: number, ingested_at: string}>}}
 */
export function readManifest(path) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    // fallbackDiagnostic already separates a parse failure (input/json-parse)
    // from an unreadable path (input/read) and attaches real supportedFixes.
    throwDiagnosticError(`The evidence manifest ${path} could not be read.`,
      [fallbackDiagnostic(error, path)]);
  }

  if (!schemaValidate(manifest)) {
    const diagnostics = (schemaValidate.errors || []).map((error) => {
      const pointer = error.instancePath || '/';
      const missing = error.params?.missingProperty;
      const target = missing ? `${pointer}/${missing}` : pointer;
      return normalizedDiagnostic({
        // `schema/invalid` rather than a manifest-specific code: the fault is
        // exactly what that code already means -- a document failing its
        // schema -- and `subject.manifest` says WHICH document. Inventing a
        // code the spec does not list would be worse than the one that fits.
        code: 'schema/invalid',
        message: `Evidence manifest ${path}: ${target} ${error.message}.`,
        subject: { manifest: path, pointer: target, keyword: error.keyword },
        evidence: error.params || {},
        supportedFixes: [
          missing
            ? `set ${target} in ${path} — it is required in every manifest document`
            : `correct ${target} in ${path} to satisfy: ${error.message}`,
          'regenerate the manifest with `vs ingest` rather than editing it by hand',
        ],
      });
    });
    throwDiagnosticError(`The evidence manifest ${path} is not a valid evidence manifest.`,
      diagnostics);
  }

  return manifest;
}

/**
 * Check every citation against the record of what was read.
 *
 * @param {object} doc a SCHEMA-VALID value case
 * @param {object} [manifest] a validated evidence manifest, or null/undefined
 * @returns {Array<object>} diagnostics, in `evidence[]` order
 */
export function manifestDiagnostics(doc, manifest) {
  // No manifest is not a failure; it is the absence of any claim to have
  // verified anything. The delivery receipt is where that absence is recorded.
  if (!manifest) return [];

  const documents = Array.isArray(manifest.documents) ? manifest.documents : [];
  // title -> EVERY row carrying it. A Map of the first row per title is what
  // let a duplicated `Subject:` resolve to the wrong document and then pass
  // its own staleness check. See decision 5 in the header.
  const byTitle = new Map();
  for (const document of documents) {
    const rows = byTitle.get(document.title);
    if (rows) rows.push(document);
    else byTitle.set(document.title, [document]);
  }
  const titles = documents.map((d) => d.title);

  const evidence = Array.isArray(doc?.evidence) ? doc.evidence : [];
  const out = [];

  evidence.forEach((entry, i) => {
    const title = entry?.title;
    // EXACT match, deliberately. See decision 2 in the header.
    const matches = byTitle.get(title) || [];

    if (matches.length === 0) {
      const ranked = closestTitles(title, titles);
      const best = ranked[0];
      out.push(normalizedDiagnostic({
        code: 'evidence/not-in-manifest',
        message: `Evidence ${JSON.stringify(entry?.ref)} cites ${JSON.stringify(title)}, which is not among the `
          + `${documents.length} document(s) actually read. `
          + (best
            ? `${best.score >= NEAR ? 'The closest document read was' : 'Nothing read resembles it; the nearest title is'} `
              + `${JSON.stringify(best.title)}. A close title is a candidate to choose from, never a match.`
            : 'The manifest records no documents at all.'),
        subject: {
          pointer: `/evidence/${i}/title`, collection: 'evidence', index: i,
          ref: entry?.ref, title,
        },
        evidence: {
          candidates: ranked.map((c) => c.title),
          similarity: ranked.map((c) => Number(c.score.toFixed(3))),
          documentsInManifest: documents.length,
        },
        supportedFixes: [
          `set /evidence/${i}/title to a document present in the manifest`,
          ...(best
            ? [`set /evidence/${i}/title to ${JSON.stringify(best.title)} if that is the document meant`]
            : []),
          'or ingest the real source with `vs ingest` so it enters the manifest, then cite it',
        ],
      }));
      return;
    }

    if (matches.length > 1) {
      // The title is the join key, and it identifies more than one document.
      // Resolving to any of them would attach the citation to a source the
      // author may never have meant, and the staleness check below would then
      // confirm that wrong source as fresh. Refuse instead.
      const paths = matches.map((m) => m.path);
      out.push(normalizedDiagnostic({
        code: 'evidence/ambiguous-citation',
        message: `Evidence ${JSON.stringify(entry?.ref)} cites ${JSON.stringify(title)}, which names `
          + `${matches.length} different documents in the manifest: ${paths.map((p) => JSON.stringify(p)).join(', ')}. `
          + 'A title that identifies more than one document identifies none of them: nothing here can say which was read, '
          + 'so the citation is refused rather than resolved to the first row.',
        subject: {
          pointer: `/evidence/${i}/title`, collection: 'evidence', index: i,
          ref: entry?.ref, title,
        },
        evidence: {
          condition: 'duplicate-title',
          matchingPaths: paths,
          matchingSha256: matches.map((m) => m.sha256),
          matches: matches.length,
          documentsInManifest: documents.length,
        },
        supportedFixes: [
          `give the documents distinct titles AT THE SOURCE — a title comes from inside the document (for \`.eml\`, the \`Subject:\` header), so renaming the file does not change it; edit the title in a copy of the document, ingest again, then set /evidence/${i}/title to the one actually read`,
          `if only one of ${paths.map((p) => JSON.stringify(p)).join(' or ')} was read, ingest that file alone and cite its unique title`,
        ],
      }));
      return;
    }

    const source = matches[0];

    // An extraction that produced nothing is a row saying the file was OPENED,
    // not that anything was READ out of it. See decision 6 in the header.
    if (source.characters === 0) {
      out.push(normalizedDiagnostic({
        code: 'evidence/empty-extraction',
        message: `Evidence ${JSON.stringify(entry?.ref)} cites ${JSON.stringify(title)}, read from ${source.path}, `
          + 'whose extraction produced NO text at all. The file was opened; nothing was read out of it. '
          + 'A row with zero characters is a record of an unread document, not evidence of anything it might contain.',
        subject: {
          pointer: `/evidence/${i}`, collection: 'evidence', index: i,
          ref: entry?.ref, title, path: source.path,
        },
        evidence: {
          condition: 'empty-extraction',
          path: source.path,
          characters: 0,
          bytes: source.bytes,
          warnings: Array.isArray(source.warnings) ? source.warnings : [],
        },
        supportedFixes: [
          `remove /evidence/${i} and every reference to ${JSON.stringify(entry?.ref)}, then state the gap rather than citing an unread document`,
          `or extract ${source.path} by another route (export it to a supported format and re-run \`vs ingest\`), confirm the text is really there, and cite it then`,
        ],
      }));
    }

    // Decode warnings. The empty-extraction warning is already reported above
    // as its own error; repeating it here would charge one fault twice.
    const warnings = (Array.isArray(source.warnings) ? source.warnings : [])
      .filter((w) => !String(w).startsWith('Extraction produced empty text'));
    if (warnings.length > 0) {
      out.push(normalizedDiagnostic({
        code: 'evidence/source-warning',
        // A WARNING, not an error. See decision 7 in the header: the text may
        // be perfectly fine, and blocking delivery on a suspicion would teach
        // an agent to strip citations to get past the gate. What it must not
        // do is stay silent.
        severity: 'warning',
        message: `Evidence ${JSON.stringify(entry?.ref)} cites ${JSON.stringify(title)}, read from ${source.path}, `
          + `whose extraction recorded ${warnings.length} warning(s): ${warnings.join(' ')} `
          + 'The extracted text may not say what the original says. Verify this source against the original document '
          + 'before quoting or paraphrasing it.',
        subject: {
          pointer: `/evidence/${i}`, collection: 'evidence', index: i,
          ref: entry?.ref, title, path: source.path,
        },
        evidence: {
          condition: 'extraction-warning',
          path: source.path,
          warnings,
          characters: source.characters,
        },
        supportedFixes: [
          `open ${source.path} itself and confirm the text quoted or located by /evidence/${i} is really what the document says`,
          `if it is not, remove /evidence/${i} and the claims resting on it rather than quoting an unreliable extraction`,
        ],
      }));
    }

    // Staleness: only for a CITED document, and only against a file still on
    // disk. An uncited row whose file changed is nobody's problem.
    let actual;
    try {
      actual = sha256File(source.path);
    } catch (error) {
      out.push(normalizedDiagnostic({
        code: 'evidence/manifest-stale',
        // A WARNING, not an error. The document was read; the manifest records
        // its hash. A file moved or deleted afterwards cannot be re-verified,
        // but neither does its absence make the citation a fabrication.
        severity: 'warning',
        message: `Evidence ${JSON.stringify(entry?.ref)} cites ${JSON.stringify(title)}, read from ${source.path}, `
          + 'which is no longer there. The citation stands on the manifest\'s record; its content could not be re-verified.',
        subject: {
          pointer: `/evidence/${i}`, collection: 'evidence', index: i,
          ref: entry?.ref, title, path: source.path,
        },
        evidence: {
          condition: 'file-missing',
          path: source.path,
          recordedSha256: source.sha256,
          systemCode: error?.code || 'unknown',
        },
        supportedFixes: [
          `restore ${source.path}, or re-run \`vs ingest\` over the document's new location and regenerate the manifest`,
        ],
      }));
      return;
    }

    if (actual !== source.sha256) {
      out.push(normalizedDiagnostic({
        code: 'evidence/manifest-stale',
        message: `Evidence ${JSON.stringify(entry?.ref)} cites ${JSON.stringify(title)}, but ${source.path} has changed `
          + 'since it was read. What the citation quotes or locates may no longer be in the document.',
        subject: {
          pointer: `/evidence/${i}`, collection: 'evidence', index: i,
          ref: entry?.ref, title, path: source.path,
        },
        evidence: {
          condition: 'content-changed',
          path: source.path,
          recordedSha256: source.sha256,
          actualSha256: actual,
        },
        supportedFixes: [
          `re-run \`vs ingest\` over ${source.path}, regenerate the manifest, then confirm /evidence/${i} still describes what the document says`,
        ],
      }));
    }
  });

  return out;
}
