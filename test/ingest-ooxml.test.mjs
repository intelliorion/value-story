import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { listEntries, readEntry } from '../src/ingest/container.mjs';
import { docxText, pptxText } from '../src/ingest/ooxml.mjs';

// ---------------------------------------------------------------------------
// A minimal, zero-dependency ZIP writer, used only to build fixtures in memory.
// Nothing binary is committed and nothing is downloaded.
// ---------------------------------------------------------------------------

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

/**
 * @param {Array<{name: string, data: string|Buffer, method?: 0|8,
 *                localExtra?: Buffer, centralExtra?: Buffer}>} files
 */
function makeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const method = f.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const localExtra = f.localExtra ?? Buffer.alloc(0);
    const centralExtra = f.centralExtra ?? Buffer.alloc(0);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10); // time
    lfh.writeUInt16LE(0, 12); // date
    lfh.writeUInt32LE(crc(raw), 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(name.length, 26);
    lfh.writeUInt16LE(localExtra.length, 28);
    locals.push(lfh, name, localExtra, body);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8); // flags
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc(raw), 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(name.length, 28);
    cdh.writeUInt16LE(centralExtra.length, 30);
    cdh.writeUInt16LE(0, 32); // comment length
    cdh.writeUInt16LE(0, 34); // disk
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(offset, 42); // local header offset
    central.push(cdh, name, centralExtra);

    offset += 30 + name.length + localExtra.length + body.length;
  }

  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

const p = (...runs) => `<w:p>${runs.join('')}</w:p>`;
const wt = (s) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${p(wt('First paragraph about cycle time.'))}
${p(wt('Second paragraph: Kroger &amp; Co. &lt;internal&gt; caf&#233;'))}
${p(wt('Third'), '<w:tab/>', wt('paragraph'), '<w:br/>', wt('wrapped'))}
${p(wt('Fourth '), wt('paragraph is split across runs.'))}
</w:body></w:document>`;

const slideXml = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;

const at = (s) => `<a:p><a:r><a:t>${s}</a:t></a:r></a:p>`;

function docxFixture() {
  return makeZip([
    { name: '[Content_Types].xml', data: '<Types/>', method: 0 },
    { name: 'word/document.xml', data: DOCUMENT_XML, method: 8 },
  ]);
}

function pptxFixture() {
  const files = [
    { name: '[Content_Types].xml', data: '<Types/>', method: 0 },
    { name: 'ppt/presentation.xml', data: '<p:presentation/>', method: 8 },
  ];
  for (const n of [1, 2, 10, 3]) {
    files.push({
      name: `ppt/slides/slide${n}.xml`,
      data: slideXml(at(`Slide ${n} headline`) + at(`Body ${n} &#x2014; detail`)),
      method: n % 2 === 0 ? 0 : 8,
    });
  }
  files.push({ name: 'ppt/slides/_rels/slide1.xml.rels', data: '<Relationships/>', method: 8 });
  return makeZip(files);
}

// ---------------------------------------------------------------------------
// container.mjs
// ---------------------------------------------------------------------------

test('listEntries names every member of the archive', () => {
  const names = listEntries(docxFixture()).map((e) => e.name);
  assert.deepEqual(names, ['[Content_Types].xml', 'word/document.xml']);
});

test('readEntry reads a STORED (method 0) entry', () => {
  const zip = docxFixture();
  const entry = listEntries(zip).find((e) => e.name === '[Content_Types].xml');
  assert.equal(entry.method, 0);
  assert.equal(readEntry(zip, entry).toString('utf8'), '<Types/>');
});

test('readEntry reads a DEFLATED (method 8) entry', () => {
  const zip = docxFixture();
  const entry = listEntries(zip).find((e) => e.name === 'word/document.xml');
  assert.equal(entry.method, 8);
  assert.equal(readEntry(zip, entry).toString('utf8'), DOCUMENT_XML);
  assert.equal(readEntry(zip, entry).length, entry.uncompressedSize);
});

test('readEntry survives a local extra field longer than the central one', () => {
  const zip = makeZip([
    {
      name: 'word/document.xml',
      data: DOCUMENT_XML,
      method: 8,
      localExtra: Buffer.alloc(37, 0x41),
      centralExtra: Buffer.alloc(0),
    },
  ]);
  const [entry] = listEntries(zip);
  assert.equal(readEntry(zip, entry).toString('utf8'), DOCUMENT_XML);
});

test('a non-ZIP buffer throws a clear Error', () => {
  const junk = Buffer.from('this is plainly not a zip archive at all', 'utf8');
  assert.throws(() => listEntries(junk), /zip/i);
});

test('an empty buffer throws a clear Error', () => {
  assert.throws(() => listEntries(Buffer.alloc(0)), /zip/i);
});

test('a Zip64 archive is rejected rather than misread', () => {
  const zip = docxFixture();
  // Force the central directory's uncompressed size to the Zip64 sentinel.
  const cd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt32LE(0xffffffff, cd + 24);
  assert.throws(() => listEntries(zip), /zip64/i);
});

test('an EOCD followed by a trailing comment is still found', () => {
  const zip = docxFixture();
  zip.writeUInt16LE(11, zip.length - 2); // comment length
  const withComment = Buffer.concat([zip, Buffer.from('trailing!!!', 'utf8')]);
  assert.deepEqual(
    listEntries(withComment).map((e) => e.name),
    ['[Content_Types].xml', 'word/document.xml'],
  );
});

// ---------------------------------------------------------------------------
// ooxml.mjs — docx
// ---------------------------------------------------------------------------

test('docxText returns paragraphs in document order, one per line', () => {
  const lines = docxText(docxFixture()).split('\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[0], 'First paragraph about cycle time.');
  assert.ok(lines[3].startsWith('Fourth paragraph is split across runs.'));
});

test('docxText decodes XML entities, named and numeric', () => {
  const line = docxText(docxFixture()).split('\n')[1];
  assert.equal(line, 'Second paragraph: Kroger & Co. <internal> café');
});

test('docxText turns <w:tab/> and <w:br/> into whitespace, not nothing', () => {
  const line = docxText(docxFixture()).split('\n')[2];
  assert.ok(!/Thirdparagraph/.test(line), `tab swallowed: ${JSON.stringify(line)}`);
  assert.ok(!/paragraphwrapped/.test(line), `break swallowed: ${JSON.stringify(line)}`);
  assert.match(line, /Third\s+paragraph\s+wrapped/);
});

test('docxText throws a clear Error when word/document.xml is absent', () => {
  const zip = makeZip([{ name: 'ppt/presentation.xml', data: '<p:presentation/>' }]);
  assert.throws(() => docxText(zip), /word\/document\.xml/);
});

// ---------------------------------------------------------------------------
// ooxml.mjs — pptx
// ---------------------------------------------------------------------------

test('pptxText sorts slides NUMERICALLY — slide2 before slide10', () => {
  const lines = pptxText(pptxFixture()).split('\n').filter(Boolean);
  const order = lines.map((l) => Number(l.match(/^Slide (\d+):/)[1]));
  assert.deepEqual(order, [1, 2, 3, 10]);
});

test('pptxText prefixes each slide and concatenates its <a:t> runs', () => {
  const lines = pptxText(pptxFixture()).split('\n').filter(Boolean);
  assert.match(lines[0], /^Slide 1: /);
  assert.ok(lines[0].includes('Slide 1 headline'));
  assert.ok(lines[0].includes('Body 1 — detail'), lines[0]);
  assert.match(lines[3], /^Slide 10: /);
});

test('pptxText ignores slide rels and other non-slide parts', () => {
  const lines = pptxText(pptxFixture()).split('\n').filter(Boolean);
  assert.equal(lines.length, 4);
});

test('pptxText throws a clear Error when the archive holds no slides', () => {
  const zip = makeZip([{ name: 'word/document.xml', data: DOCUMENT_XML }]);
  assert.throws(() => pptxText(zip), /slide/i);
});
