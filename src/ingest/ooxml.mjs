/**
 * Text extraction from OOXML documents (`.docx`, `.pptx`).
 *
 * The goal is readable text an agent can quote from — not a faithful
 * re-rendering of the document. Paragraph and slide boundaries are preserved
 * because they are what a citation points at; formatting is discarded.
 */

import { listEntries, readEntry } from './container.mjs';

const DOCUMENT_PART = 'word/document.xml';
const SLIDE_PART = /^ppt\/slides\/slide(\d+)\.xml$/;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode the XML entities OOXML actually emits, named and numeric. */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body];
    return named === undefined ? whole : named;
  });
}

/** Collapse runs of whitespace so one paragraph stays on one line. */
const tidy = (text) => text.replace(/\s+/g, ' ').trim();

function part(buffer, name) {
  const entry = listEntries(buffer).find((e) => e.name === name);
  if (!entry) throw new Error(`This archive has no ${name} part, so it is not a readable .docx.`);
  return readEntry(buffer, entry).toString('utf8');
}

/**
 * Walk a fragment's text-bearing tags in document order, so that whitespace
 * tags such as <w:tab/> land BETWEEN the runs they separate rather than being
 * stripped and fusing two words together.
 *
 * @param {string} xml
 * @param {RegExp} pattern a global regex whose first capture group is text
 *   content and whose other alternatives are whitespace-producing empty tags
 */
function runsToText(xml, pattern) {
  let out = '';
  for (const m of xml.matchAll(pattern)) {
    out += m[1] === undefined ? ' ' : decodeEntities(m[1]);
  }
  return out;
}

const W_RUNS = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:tab|br|cr)\b[^>]*\/?>/g;
const W_PARAGRAPH = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;

const A_RUNS = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?>/g;
const A_PARAGRAPH = /<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>|<a:p(?:\s[^>]*)?\/>/g;

/**
 * @param {Buffer|Uint8Array} buffer a `.docx` archive
 * @returns {string} paragraph text in document order, one paragraph per line
 */
export function docxText(buffer) {
  const xml = part(buffer, DOCUMENT_PART);
  const lines = [];
  for (const m of xml.matchAll(W_PARAGRAPH)) {
    const line = tidy(runsToText(m[1] ?? '', W_RUNS));
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

/**
 * @param {Buffer|Uint8Array} buffer a `.pptx` archive
 * @returns {string} slide text in NUMERIC slide order, each line `Slide N: ...`
 */
export function pptxText(buffer) {
  const slides = [];
  for (const entry of listEntries(buffer)) {
    const m = SLIDE_PART.exec(entry.name);
    // Numeric, not lexical: slide10 must not sort before slide2.
    if (m) slides.push({ number: Number(m[1]), entry });
  }
  if (slides.length === 0) {
    throw new Error('This archive has no ppt/slides/slideN.xml parts, so it is not a readable .pptx.');
  }
  slides.sort((a, b) => a.number - b.number);

  const lines = [];
  for (const { number, entry } of slides) {
    const xml = readEntry(buffer, entry).toString('utf8');
    const paragraphs = [];
    for (const m of xml.matchAll(A_PARAGRAPH)) {
      const text = tidy(runsToText(m[1] ?? '', A_RUNS));
      if (text) paragraphs.push(text);
    }
    lines.push(`Slide ${number}: ${paragraphs.join(' ')}`.trimEnd());
  }
  return lines.join('\n');
}
