// QR SVG/PNG helpers — wraps vendored MIT qrcode-svg (Kazuhiko Arase / papnkukn).
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const QRCode = require('./vendor/qrcode-svg.cjs');

/** @returns {{ modules: boolean[][], size: number }} */
export function qrMatrix(text, { ecl = 'M' } = {}) {
  const q = new QRCode({
    content: String(text),
    padding: 0,
    width: 1,
    height: 1,
    ecl,
    join: false,
  });
  const modules = q.qrcode.modules;
  const size = q.qrcode.moduleCount;
  return { modules, size };
}

/** SVG document (no external deps). */
export function qrSvg(text, { size = 240, margin = 2, ecl = 'M', dark = '#0b1022', light = '#ffffff' } = {}) {
  const q = new QRCode({
    content: String(text),
    padding: margin,
    width: size,
    height: size,
    color: dark,
    background: light,
    ecl,
    join: true,
    pretty: false,
    xmlDeclaration: false,
    container: 'svg-viewbox',
  });
  return q.svg({ container: 'svg-viewbox' });
}

/** data:image/svg+xml;base64,… for img src (CSP allows data: on img-src). */
export function qrSvgDataUri(text, opts) {
  const svg = qrSvg(text, opts);
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

/** Minimal greyscale PNG of the QR matrix (for decode tests / optional PNG data URI). */
export function qrPngBuffer(text, { scale = 6, margin = 2, ecl = 'M' } = {}) {
  const { modules, size } = qrMatrix(text, { ecl });
  const dim = (size + margin * 2) * scale;
  // Greyscale 8-bit, filter none
  const raw = Buffer.alloc((dim + 1) * dim);
  for (let y = 0; y < dim; y++) {
    const row = y * (dim + 1);
    raw[row] = 0; // filter
    const my = Math.floor(y / scale) - margin;
    for (let x = 0; x < dim; x++) {
      const mx = Math.floor(x / scale) - margin;
      let dark = false;
      if (my >= 0 && my < size && mx >= 0 && mx < size) dark = !!modules[my][mx];
      raw[row + 1 + x] = dark ? 0 : 255;
    }
  }
  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])) >>> 0, 0);
    return Buffer.concat([len, typeB, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0);
  ihdr.writeUInt32BE(dim, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

export function qrPngDataUri(text, opts) {
  return 'data:image/png;base64,' + qrPngBuffer(text, opts).toString('base64');
}

/* CRC32 for PNG */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
