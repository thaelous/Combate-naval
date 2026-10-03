import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function generateNavalIconPNG(size, isMaskable = false) {
  const width = size;
  const height = size;

  // Raw image data: filter byte (0) + width * 4 bytes per scanline
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(scanlineLength * height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = isMaskable ? width * 0.40 : width * 0.46;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Deep dark navy ocean background
      let r = 4;
      let g = 13;
      let b = 26;
      let a = 255;

      // Outer radar ring
      if (Math.abs(dist - radius * 0.88) < (size * 0.015)) {
        r = 0; g = 240; b = 255; a = 220; // Cyan radar ring
      } else if (Math.abs(dist - radius * 0.58) < (size * 0.01)) {
        r = 0; g = 240; b = 255; a = 120; // Inner radar ring
      } else if (dist < radius) {
        // Subtle radial gradient
        const t = dist / radius;
        r = Math.floor(4 + (1 - t) * 8);
        g = Math.floor(13 + (1 - t) * 22);
        b = Math.floor(26 + (1 - t) * 45);
      }

      // Crosshair lines
      if ((Math.abs(dx) < size * 0.01 && dist < radius * 0.95) ||
          (Math.abs(dy) < size * 0.01 && dist < radius * 0.95)) {
        r = 0; g = 240; b = 255; a = 180;
      }

      // Battleship silhouette in center (sharp metallic warship shape)
      // Bow pointing up (dy < 0), Stern at bottom (dy > 0)
      const shipLen = radius * 1.1;
      const shipHalfW = radius * 0.28;
      if (dy > -shipLen * 0.55 && dy < shipLen * 0.45) {
        let wAtY = shipHalfW;
        if (dy < -shipLen * 0.1) {
          // Bow tapering to point
          const prog = (dy - (-shipLen * 0.1)) / (-shipLen * 0.45 - (-shipLen * 0.1));
          wAtY = shipHalfW * (1 - prog);
        } else if (dy > shipLen * 0.3) {
          // Stern slight taper
          wAtY = shipHalfW * 0.85;
        }

        if (Math.abs(dx) <= wAtY) {
          // Ship hull color: steel gunmetal
          r = 71; g = 85; b = 105; a = 255;

          // Armor edge highlight
          if (Math.abs(Math.abs(dx) - wAtY) < size * 0.012) {
            r = 0; g = 240; b = 255; // Neon cyan outline
          }
          // Center superstructure
          if (Math.abs(dx) < shipHalfW * 0.45 && dy > -shipLen * 0.2 && dy < shipLen * 0.2) {
            r = 148; g = 163; b = 184; // Light superstructure
          }
          // Bridge command node
          if (Math.abs(dx) < shipHalfW * 0.25 && dy > -shipLen * 0.05 && dy < shipLen * 0.08) {
            r = 0; g = 240; b = 255; // Bright radar bridge
          }
        }
      }

      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT Chunk (zlib compressed)
  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate PNG icons
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generateNavalIconPNG(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generateNavalIconPNG(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generateNavalIconPNG(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generateNavalIconPNG(180, false));

// Generate SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#040d1a" rx="100"/>
  <circle cx="256" cy="256" r="210" fill="none" stroke="#00f0ff" stroke-width="6" stroke-opacity="0.6"/>
  <circle cx="256" cy="256" r="140" fill="none" stroke="#00f0ff" stroke-width="3" stroke-opacity="0.4" stroke-dasharray="8 6"/>
  <circle cx="256" cy="256" r="70" fill="none" stroke="#00f0ff" stroke-width="2" stroke-opacity="0.3"/>
  <line x1="256" y1="46" x2="256" y2="466" stroke="#00f0ff" stroke-width="3" stroke-opacity="0.5"/>
  <line x1="46" y1="256" x2="466" y2="256" stroke="#00f0ff" stroke-width="3" stroke-opacity="0.5"/>
  <!-- Battleship vector -->
  <polygon points="256,90 286,220 286,390 226,390 226,220" fill="#334155" stroke="#00f0ff" stroke-width="4"/>
  <polygon points="256,120 274,210 274,370 238,370 238,210" fill="#64748b"/>
  <rect x="242" y="210" width="28" height="60" rx="4" fill="#94a3b8" stroke="#00f0ff" stroke-width="2"/>
  <circle cx="256" cy="240" r="6" fill="#00f0ff"/>
  <circle cx="256" cy="180" r="10" fill="#1e293b" stroke="#facc15" stroke-width="2"/>
  <circle cx="256" cy="320" r="10" fill="#1e293b" stroke="#facc15" stroke-width="2"/>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
console.log('Icons generated successfully in /public');
