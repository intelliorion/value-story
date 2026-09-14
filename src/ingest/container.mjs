/**
 * A minimal ZIP reader, built only on `node:zlib`.
 *
 * `.docx` and `.pptx` are ZIP archives of XML, so reading them needs nothing
 * more than the central directory walk below and `inflateRawSync`. This module
 * imports no npm package and never will.
 */

import { inflateRawSync } from 'node:zlib';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;

const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_SENTINEL = 0xffffffff;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

function asBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Not a ZIP archive: expected a Buffer or Uint8Array.');
}

/**
 * Locate the End of Central Directory record. It sits at the end of the file
 * but may be followed by a variable-length comment, so it is not simply the
 * last 22 bytes — scan backwards for the signature and confirm the declared
 * comment length accounts for whatever trails it.
 */
function findEndOfCentralDirectory(buf) {
  if (buf.length < EOCD_MIN_SIZE) {
    throw new Error('Not a ZIP archive: the buffer is too small to hold a ZIP end-of-central-directory record.');
  }
  const floor = Math.max(0, buf.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN_SIZE; i >= floor; i--) {
    if (buf.readUInt32LE(i) !== SIG_EOCD) continue;
    const commentLength = buf.readUInt16LE(i + 20);
    if (i + EOCD_MIN_SIZE + commentLength !== buf.length) continue;
    return i;
  }
  throw new Error('Not a ZIP archive: no ZIP end-of-central-directory signature was found.');
}

function rejectZip64(buf, eocd) {
  const locator = eocd - 20;
  if (locator >= 0 && buf.readUInt32LE(locator) === SIG_ZIP64_LOCATOR) {
    throw new Error('Unsupported archive: this is a Zip64 ZIP, which this reader does not support.');
  }
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || cdSize === ZIP64_SENTINEL || cdOffset === ZIP64_SENTINEL) {
    throw new Error('Unsupported archive: this is a Zip64 ZIP, which this reader does not support.');
  }
  return { entryCount, cdSize, cdOffset };
}

/**
 * @param {Buffer|Uint8Array} input
 * @returns {Array<{name: string, offset: number, compressedSize: number,
 *                  uncompressedSize: number, method: number}>}
 */
export function listEntries(input) {
  const buf = asBuffer(input);
  const eocd = findEndOfCentralDirectory(buf);
  const { entryCount, cdOffset } = rejectZip64(buf, eocd);

  if (cdOffset > buf.length) {
    throw new Error('Corrupt ZIP archive: the central directory offset lies past the end of the buffer.');
  }

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new Error(`Corrupt ZIP archive: expected a central directory header for entry ${i + 1} of ${entryCount}.`);
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);

    if (
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL ||
      offset === ZIP64_SENTINEL
    ) {
      throw new Error('Unsupported archive: this is a Zip64 ZIP, which this reader does not support.');
    }

    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    entries.push({ name, offset, compressedSize, uncompressedSize, method });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * @param {Buffer|Uint8Array} input
 * @param {{name: string, offset: number, compressedSize: number,
 *          uncompressedSize: number, method: number}} entry
 * @returns {Buffer}
 */
export function readEntry(input, entry) {
  const buf = asBuffer(input);
  if (!entry || typeof entry.offset !== 'number') {
    throw new TypeError('readEntry expects an entry from listEntries().');
  }
  const { offset, method, name } = entry;
  if (offset + 30 > buf.length || buf.readUInt32LE(offset) !== SIG_LOCAL) {
    throw new Error(`Corrupt ZIP archive: no local file header for ${JSON.stringify(name)}.`);
  }

  // The LOCAL header carries its own name and extra field lengths; they may
  // differ from the central directory's, so the data offset must be computed
  // from the local header and never from the central one.
  const nameLength = buf.readUInt16LE(offset + 26);
  const extraLength = buf.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;

  // With a data descriptor (general purpose bit 3) the local header's sizes are
  // zero; the central directory's sizes, which we carry on the entry, are the
  // authoritative ones.
  const declared = entry.compressedSize;
  const end =
    declared > 0 ? start + declared : method === METHOD_DEFLATE ? buf.length : start + entry.uncompressedSize;

  if (start > buf.length || end > buf.length) {
    throw new Error(`Corrupt ZIP archive: the data for ${JSON.stringify(name)} runs past the end of the buffer.`);
  }
  const body = buf.subarray(start, end);

  if (method === METHOD_STORED) return Buffer.from(body);
  if (method === METHOD_DEFLATE) {
    try {
      return inflateRawSync(body);
    } catch (cause) {
      throw new Error(`Corrupt ZIP archive: could not inflate ${JSON.stringify(name)}.`, { cause });
    }
  }
  throw new Error(
    `Unsupported ZIP compression method ${method} for ${JSON.stringify(name)}; only stored (0) and deflate (8) are supported.`,
  );
}

/**
 * Convenience: read one named entry, or throw if the archive has no such part.
 * @param {Buffer|Uint8Array} input
 * @param {string} name
 * @returns {Buffer}
 */
export function readEntryByName(input, name) {
  const entry = listEntries(input).find((e) => e.name === name);
  if (!entry) throw new Error(`This archive has no ${name} part.`);
  return readEntry(input, entry);
}
