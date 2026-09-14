/**
 * A minimal, zero-dependency ZIP writer used only to build `.docx` / `.pptx`
 * fixtures in memory for tests. Nothing binary is committed and nothing is
 * downloaded.
 */

import { deflateRawSync, crc32 } from 'node:zlib';

const crc = (buf) =>
  typeof crc32 === 'function'
    ? crc32(buf) >>> 0
    : (() => {
        let c = ~0;
        for (const b of buf) {
          c ^= b;
          for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
        }
        return ~c >>> 0;
      })();

/** @param {Array<{name: string, data: string|Buffer, method?: 0|8}>} files */
export function makeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const method = f.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt32LE(crc(raw), 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(name.length, 26);
    locals.push(lfh, name, body);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt32LE(crc(raw), 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(name.length, 28);
    cdh.writeUInt32LE(offset, 42);
    central.push(cdh, name);

    offset += 30 + name.length + body.length;
  }

  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

const wp = (...runs) => `<w:p>${runs.join('')}</w:p>`;
const wt = (s) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;
const at = (s) => `<a:p><a:r><a:t>${s}</a:t></a:r></a:p>`;

/** A `.docx` whose text is known exactly. */
export function docxFixture() {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${wp(wt('Cycle time fell from 14 days to 9 days.'))}
${wp(wt('Owner: Kroger &amp; Co. caf&#233;'))}
</w:body></w:document>`;
  return makeZip([
    { name: '[Content_Types].xml', data: '<Types/>', method: 0 },
    { name: 'word/document.xml', data: xml, method: 8 },
  ]);
}

/** A `.pptx` whose slide text is known exactly, deliberately out of order. */
export function pptxFixture() {
  const files = [
    { name: '[Content_Types].xml', data: '<Types/>', method: 0 },
    { name: 'ppt/presentation.xml', data: '<p:presentation/>', method: 8 },
  ];
  for (const n of [2, 10, 1]) {
    files.push({
      name: `ppt/slides/slide${n}.xml`,
      data: `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${at(`Headline ${n}`)}${at(`Detail ${n}`)}</p:spTree></p:cSld></p:sld>`,
      method: n % 2 === 0 ? 0 : 8,
    });
  }
  return makeZip(files);
}
