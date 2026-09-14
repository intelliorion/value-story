/**
 * Text extraction for the formats that are already text: `.txt`, `.md`,
 * `.csv`, `.tsv` — and `.eml`, which is text wrapped in enough envelope that
 * it has to be unwrapped before an agent can read it.
 *
 * Nothing here decides what a document MEANS. The goal is a faithful,
 * quotable rendering of what the file says, plus the headers that say who
 * wrote it and when.
 */

import { decodeEntities } from './ooxml.mjs';

const BOM = '﻿';

/** Decode a buffer as UTF-8 and drop a leading byte-order mark. */
export function plainText(buffer) {
  const text = Buffer.from(buffer).toString('utf8');
  return text.startsWith(BOM) ? text.slice(1) : text;
}

// ---------------------------------------------------------------------------
// transfer encodings
// ---------------------------------------------------------------------------

/**
 * RFC 2045 quoted-printable. A trailing `=` before a line break is a SOFT
 * break: it must disappear entirely, or one sentence becomes two fragments.
 */
export function decodeQuotedPrintable(text) {
  const joined = text.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    // The source of a quoted-printable body is 7-bit ASCII, but tolerate a
    // non-conforming 8-bit byte rather than losing the character.
    const code = joined.charCodeAt(i);
    if (code < 0x100) bytes.push(code);
    else bytes.push(...Buffer.from(ch, 'utf8'));
  }
  return Buffer.from(bytes);
}

function decodeTransfer(raw, encoding) {
  const enc = (encoding || '7bit').trim().toLowerCase();
  if (enc === 'base64') return Buffer.from(raw.replace(/\s+/g, ''), 'base64');
  if (enc === 'quoted-printable') return decodeQuotedPrintable(raw);
  return Buffer.from(raw, 'binary');
}

/** Decode bytes with the charset the part declared, falling back to UTF-8. */
function decodeCharset(buffer, charset) {
  const label = (charset || 'utf-8').trim().toLowerCase().replace(/^["']|["']$/g, '');
  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

// ---------------------------------------------------------------------------
// headers
// ---------------------------------------------------------------------------

/** RFC 2047 encoded-words, e.g. `=?UTF-8?B?Q2Fmw6k=?=`, in a header value. */
function decodeEncodedWords(value) {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset, scheme, body) => {
    try {
      const bytes = scheme.toUpperCase() === 'B'
        ? Buffer.from(body, 'base64')
        // In the Q scheme `_` stands for a space.
        : decodeQuotedPrintable(body.replace(/_/g, ' '));
      return decodeCharset(bytes, charset);
    } catch {
      return whole;
    }
  });
}

/**
 * Split a message into headers and body, unfolding continuation lines so a
 * folded Subject is not truncated at the fold.
 *
 * @returns {{headers: Map<string, string>, body: string}}
 */
function splitMessage(text) {
  const blank = text.search(/\r?\n\r?\n/);
  const head = blank === -1 ? text : text.slice(0, blank);
  const body = blank === -1 ? '' : text.slice(blank + text.slice(blank).match(/^\r?\n\r?\n/)[0].length);

  const headers = new Map();
  let current = null;
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && current) {
      headers.set(current, `${headers.get(current)} ${line.trim()}`);
      continue;
    }
    const m = /^([!-9;-~]+):[ \t]*(.*)$/.exec(line);
    if (!m) continue;
    current = m[1].toLowerCase();
    // First occurrence wins; a repeated header is a rewrite, not a correction.
    if (!headers.has(current)) headers.set(current, m[2].trim());
  }
  return { headers, body };
}

function contentType(headers) {
  const raw = headers.get('content-type') || 'text/plain';
  const [type] = raw.split(';');
  const charset = /charset\s*=\s*("[^"]*"|'[^']*'|[^;\s]+)/i.exec(raw);
  const boundary = /boundary\s*=\s*("[^"]*"|'[^']*'|[^;\s]+)/i.exec(raw);
  const unquote = (s) => (s ? s.replace(/^["']|["']$/g, '') : undefined);
  return {
    type: type.trim().toLowerCase(),
    charset: unquote(charset?.[1]),
    boundary: unquote(boundary?.[1]),
  };
}

// ---------------------------------------------------------------------------
// html fallback
// ---------------------------------------------------------------------------

/**
 * Strip HTML to readable text. Used ONLY when an email offers no text/plain
 * alternative — a lossy last resort, never a preference.
 */
export function stripHtml(html) {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, '\n')
      .replace(/<(br|hr)\b[^>]*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// message bodies
// ---------------------------------------------------------------------------

/** Split a multipart body on its boundary, ignoring preamble and epilogue. */
function splitParts(body, boundary) {
  const delimiter = `--${boundary}`;
  const parts = [];
  const lines = body.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (line.trimEnd() === delimiter) {
      if (current) parts.push(current.join('\n'));
      current = [];
      continue;
    }
    if (line.trimEnd() === `${delimiter}--`) {
      if (current) parts.push(current.join('\n'));
      current = null;
      break;
    }
    if (current) current.push(line);
  }
  if (current) parts.push(current.join('\n'));
  return parts;
}

/**
 * Reduce one MIME entity to text.
 *
 * @returns {{text: string, html: boolean}|null} `html: true` marks text that
 *   came from a text/html part, so a caller holding both can prefer the plain
 *   one. `null` means the entity carried no readable text at all.
 */
function entityText(headers, body, warnings) {
  const { type, charset, boundary } = contentType(headers);

  if (type.startsWith('multipart/')) {
    if (!boundary) {
      warnings.push('This message declares a multipart body but names no boundary; it was read as plain text.');
      return { text: body.trim(), html: false };
    }
    let html = null;
    for (const part of splitParts(body, boundary)) {
      const inner = splitMessage(part);
      const got = entityText(inner.headers, inner.body, warnings);
      if (!got) continue;
      // text/plain wins the moment it is found; html is only ever a fallback.
      if (!got.html) return got;
      if (!html) html = got;
    }
    if (html) warnings.push('This message offered no text/plain part; its text/html part was stripped to text, which loses structure.');
    return html;
  }

  const decoded = decodeCharset(
    decodeTransfer(body, headers.get('content-transfer-encoding')),
    charset,
  );

  if (type === 'text/html') return { text: stripHtml(decoded), html: true };
  if (type === 'text/plain' || type.startsWith('text/')) return { text: decoded.trim(), html: false };
  return null; // an attachment: real content, but not text this tool can read.
}

const SHOWN_HEADERS = [['Subject', 'subject'], ['From', 'from'], ['To', 'to'], ['Date', 'date']];

/**
 * Read an `.eml` message.
 *
 * The parsed headers are prepended to the body so that an agent reading the
 * extracted text can see who wrote it and when — a quote without an author is
 * not citable.
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {{text: string, title: string|null, warnings: string[]}}
 */
export function emlDocument(buffer) {
  const warnings = [];
  // Headers are ASCII and bodies carry their own charset, so the envelope is
  // read as latin1 (byte-preserving) and each part decoded on its own terms.
  const raw = Buffer.from(buffer).toString('binary');
  const { headers, body } = splitMessage(raw);

  const shown = [];
  for (const [label, key] of SHOWN_HEADERS) {
    const value = headers.get(key);
    if (value) shown.push(`${label}: ${decodeEncodedWords(value)}`);
  }

  const got = entityText(headers, body, warnings);
  if (!got) warnings.push('No readable text part was found in this message; only its headers were extracted.');

  const subject = headers.get('subject');
  // Mail is CRLF on the wire; the extracted text is for reading, so line
  // endings are normalised rather than left to surface inside a quotation.
  const normalise = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return {
    text: normalise([shown.join('\n'), got ? got.text : ''].filter(Boolean).join('\n\n')),
    title: subject ? decodeEncodedWords(subject).trim() || null : null,
    warnings,
  };
}
