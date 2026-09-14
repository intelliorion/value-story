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

const BOM = '\uFEFF';

/**
 * Decode a buffer as UTF-8 and drop a leading byte-order mark.
 *
 * Decoding is FATAL first. `Buffer.toString('utf8')` silently rewrites every
 * invalid byte as U+FFFD, so a single Windows-1252 byte — the commonest
 * artifact of an Excel or Word export — would produce well-formed text that
 * is not what the document said, with nothing to show for it. Text that looks
 * like evidence but is not is worse than text that is missing: every
 * downstream check passes and the agent quotes the corruption verbatim.
 *
 * So: decode strictly; on failure fall back to the lossy decode so the run
 * continues, but say so, naming the file.
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {string[]} [warnings] collected, never thrown
 * @param {string} [name] what to call this file in a warning
 */
export function plainText(buffer, warnings = [], name = 'This file') {
  const bytes = Buffer.from(buffer);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = bytes.toString('utf8');
    warnings.push(`${name} is not valid UTF-8. It was decoded lossily, so some characters are wrong or were replaced with U+FFFD — do not quote it without checking the original.`);
  }
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

function decodeTransfer(raw, encoding, warnings = []) {
  const enc = (encoding || '7bit').trim().toLowerCase();
  if (enc === 'base64') {
    const packed = raw.replace(/\s+/g, '');
    // Node's base64 decoder discards anything outside the alphabet without a
    // word, which can silently drop or shift the text. Say so instead.
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(packed)) {
      warnings.push('This message declares base64 but its body contains characters outside the base64 alphabet. They were discarded, so the decoded text may be incomplete or shifted.');
    }
    return Buffer.from(packed, 'base64');
  }
  if (enc === 'quoted-printable') return decodeQuotedPrintable(raw);
  if (!['7bit', '8bit', 'binary', ''].includes(enc)) {
    warnings.push(`This message declares an unsupported transfer encoding "${enc}"; its body was read as raw bytes and may be unreadable.`);
  }
  return Buffer.from(raw, 'binary');
}

/**
 * Decode bytes with the charset the part declared.
 *
 * Both failure modes are reported rather than absorbed: a charset label this
 * runtime cannot decode (`x-mac-japanese` is real, and ICU does not have it),
 * and bytes that do not conform to a label it does know. Either way a lossy
 * decode is returned so the run continues — but never silently.
 */
function decodeCharset(buffer, charset, warnings = []) {
  const label = (charset || 'utf-8').trim().toLowerCase().replace(/^["']|["']$/g, '');
  let strict;
  try {
    strict = new TextDecoder(label, { fatal: true });
  } catch {
    warnings.push(`This message declares charset "${label}", which this runtime cannot decode. It was read as UTF-8 instead, so some characters may be wrong.`);
    return buffer.toString('utf8');
  }
  try {
    return strict.decode(buffer);
  } catch {
    warnings.push(`This message declares charset "${label}" but its bytes are not valid ${label}. It was decoded lossily, so some characters are wrong or were replaced with U+FFFD.`);
    return new TextDecoder(label).decode(buffer);
  }
}

// ---------------------------------------------------------------------------
// headers
// ---------------------------------------------------------------------------

/** RFC 2047 encoded-words, e.g. `=?UTF-8?B?Q2Fmw6k=?=`, in a header value. */
/**
 * Headers are read as latin1 so their bytes survive intact (see emlDocument).
 * That is right for a 7-bit header, but real mail does carry raw UTF-8 in a
 * Subject (RFC 6532), and latin1 would turn `Café` into `CafÃ©` — well-formed,
 * quotable, and wrong. So: if a header carries any 8-bit byte, try UTF-8
 * strictly first, and only keep the latin1 reading, with a warning, if the
 * bytes are not UTF-8 after all.
 */
function reinterpretHeaderBytes(value, warnings) {
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  const bytes = Buffer.from(value, 'binary');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    warnings.push('A header in this message carries 8-bit bytes that are neither an RFC 2047 encoded-word nor valid UTF-8; it was read as ISO-8859-1 and some characters may be wrong.');
    return value;
  }
}

function decodeEncodedWords(value, warnings = []) {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset, scheme, body) => {
    try {
      const bytes = scheme.toUpperCase() === 'B'
        ? Buffer.from(body, 'base64')
        // In the Q scheme `_` stands for a space.
        : decodeQuotedPrintable(body.replace(/_/g, ' '));
      return decodeCharset(bytes, charset, warnings);
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
    let plain = null;
    let html = null;
    let dropped = 0;
    for (const part of splitParts(body, boundary)) {
      const inner = splitMessage(part);
      const got = entityText(inner.headers, inner.body, warnings);
      // A part this tool cannot read is an attachment. Dropping one without
      // saying so is the same silent loss as an empty extraction.
      if (!got) { dropped++; continue; }
      if (!got.html) { if (!plain) plain = got; } else if (!html) html = got;
    }
    if (dropped > 0) {
      warnings.push(`This message has ${dropped} attachment(s) or non-text part(s) that were NOT extracted; ingest them separately if they matter.`);
    }
    // text/plain always wins; html is only ever a fallback.
    if (plain) return plain;
    if (html) warnings.push('This message offered no text/plain part; its text/html part was stripped to text, which loses structure.');
    return html;
  }

  const decoded = decodeCharset(
    decodeTransfer(body, headers.get('content-transfer-encoding'), warnings),
    charset,
    warnings,
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
    if (value) shown.push(`${label}: ${decodeEncodedWords(reinterpretHeaderBytes(value, warnings), warnings)}`);
  }

  const got = entityText(headers, body, warnings);
  if (!got) warnings.push('No readable text part was found in this message; only its headers were extracted.');
  else if (got.text.trim() === '') {
    warnings.push('This message has headers but no body text: it was sent empty, rather than having had a body dropped.');
  }

  // The subject is re-read for the title; its header warnings were already
  // raised when the same value was rendered above, so they are not repeated.
  const headerWarnings = [];
  const subject = headers.get('subject');
  // Mail is CRLF on the wire; the extracted text is for reading, so line
  // endings are normalised rather than left to surface inside a quotation.
  const normalise = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return {
    text: normalise([shown.join('\n'), got ? got.text : ''].filter(Boolean).join('\n\n')),
    title: subject ? decodeEncodedWords(reinterpretHeaderBytes(subject, headerWarnings), warnings).trim() || null : null,
    warnings,
  };
}
