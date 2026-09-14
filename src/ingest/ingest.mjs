/**
 * Documents in, readable text and honest manifest rows out.
 *
 * This module does not decide what a document MEANS — that is the agent's
 * job. It turns a file into text the agent can read, and records exactly what
 * was read, so that a later step can refuse any citation naming a source that
 * was never opened.
 *
 * Two consequences follow, and both are deliberate:
 *
 * - `sha256` is taken over the FILE BYTES, never the extracted text. The
 *   manifest must keep identifying the same document even if extraction later
 *   improves.
 * - A document that cannot be read is a SKIP with a reason, never an empty
 *   document. Silence is the one outcome that would let an agent cite a
 *   source it never saw.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

import { docxText, pptxText } from './ooxml.mjs';
import { plainText, emlDocument } from './plain.mjs';
import { externalText, DEFAULT_TOOLS, EXTERNAL_EXTENSIONS } from './external.mjs';

const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.tsv'];
const OOXML_EXTENSIONS = ['.docx', '.pptx'];

export const SUPPORTED_EXTENSIONS = [
  ...TEXT_EXTENSIONS,
  '.eml',
  ...OOXML_EXTENSIONS,
  ...EXTERNAL_EXTENSIONS,
].sort();

/**
 * Map an extension to the `evidence[].kind` enum.
 *
 * Conservative on purpose: `interview` is NEVER inferred, because nothing in
 * a file extension justifies claiming someone was interviewed. The agent
 * corrects the kind when it authors the case.
 */
export function kindFor(ext) {
  if (ext === '.eml') return 'email';
  if (ext === '.csv' || ext === '.tsv') return 'dataset';
  return 'doc';
}

/**
 * A readable default title: the filename without its extension, separators
 * turned into spaces. This is a convenience, not a claim about the document —
 * the agent may override it when authoring.
 */
export function titleFor(path) {
  const stem = basename(path, extname(path));
  const spaced = stem.replace(/[_.\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced || stem || basename(path);
}

/**
 * A deterministic, collision-safe output filename for a source path.
 *
 * The readable stem is for a human scanning the output directory; the hash of
 * the ABSOLUTE source path is what guarantees that two files both named
 * `report.docx`, in different folders, never overwrite one another. Every
 * character outside `[A-Za-z0-9._-]` is replaced, so a filename containing a
 * space or a quote cannot produce a surprising path.
 */
export function outputName(path) {
  const stem = basename(path, extname(path)).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const digest = createHash('sha256').update(resolve(path)).digest('hex').slice(0, 12);
  return `${stem || 'document'}-${digest}.txt`;
}

const skip = (path, reason) => ({ path, skipped: true, reason });

/**
 * Read one document.
 *
 * @param {string} path
 * @param {{tools?: object, env?: object}} [options] injection points for the
 *   optional external converters; tests use them to simulate a missing binary
 * @returns {{path: string, title: string, kind: string, sha256: string,
 *            bytes: number, ingested_at: string, text: string, warnings: string[]}
 *          |{path: string, skipped: true, reason: string}}
 *   A SKIP is returned, not thrown, whenever the file is real but unreadable:
 *   an unsupported extension, a corrupt archive, or an absent converter.
 *   Callers must check `skipped` before trusting `text`.
 */
export function ingestFile(path, options = {}) {
  const ext = extname(path).toLowerCase();
  const stats = statSync(path); // a path that is not there is the caller's error, and throws
  if (stats.isDirectory()) throw new Error(`${path} is a directory; use ingestDir.`);

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return skip(path, `${ext || 'a file with no extension'} is not a supported document format. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}.`);
  }

  const buffer = readFileSync(path);
  // Over the BYTES, never the extracted text.
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  const warnings = [];
  let text;
  let title = titleFor(path);

  try {
    if (TEXT_EXTENSIONS.includes(ext)) {
      text = plainText(buffer, warnings, path);
    } else if (ext === '.eml') {
      const message = emlDocument(buffer);
      text = message.text;
      if (message.title) title = message.title;
      warnings.push(...message.warnings);
    } else if (ext === '.docx') {
      text = docxText(buffer);
    } else if (ext === '.pptx') {
      text = pptxText(buffer);
    } else {
      const result = externalText(path, ext, options);
      if (!result.ok) return skip(path, result.reason);
      text = result.text;
      warnings.push(...(result.warnings ?? []));
    }
  } catch (error) {
    return skip(path, `${path} could not be read: ${error.message}`);
  }

  if (text.trim() === '') {
    warnings.push('Extraction produced empty text. Treat this document as unread rather than as evidence of nothing.');
  }

  // Stamped HERE, per document, at the moment this document was read.
  // Taking one timestamp for the whole run and copying it onto every row made
  // `ingested_at` per-run in meaning while being per-document in shape -- a
  // field that looks like it answers "when was THIS read?" and does not.
  const ingestedAt = new Date().toISOString();

  return {
    path, title, kind: kindFor(ext), sha256, bytes: stats.size, ingested_at: ingestedAt, text, warnings,
  };
}

/** Every file in a directory, sorted, optionally recursing. Dotfiles are ignored. */
function filesIn(dir, recursive) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) found.push(...filesIn(path, recursive));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Read every document in a directory.
 *
 * Documents come back sorted by path so that two runs over the same directory
 * produce the same manifest in the same order. An unreadable file lands in
 * `skipped` with a reason; it never aborts the run and never appears as an
 * empty document.
 *
 * @param {string} dir
 * @param {{recursive?: boolean, tools?: object, env?: object}} [options]
 * @returns {{documents: object[], skipped: {path: string, reason: string}[]}}
 */
export function ingestDir(dir, options = {}) {
  const documents = [];
  const skipped = [];
  for (const path of filesIn(dir, options.recursive === true).sort()) {
    let result;
    try {
      result = ingestFile(path, options);
    } catch (error) {
      skipped.push({ path, reason: `${path} could not be opened: ${error.message}` });
      continue;
    }
    if (result.skipped) skipped.push({ path: result.path, reason: result.reason });
    else documents.push(result);
  }
  return { documents, skipped };
}
