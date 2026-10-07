const fs = require("fs"), zlib = require("zlib");
fs.mkdirSync("assets", { recursive: true });
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(file, size, bg, fg, ratio) {
  const raw = Buffer.alloc(size * (size * 4 + 1)), r = size * ratio / 2, m = size / 2;
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) {
    const o = y * (size * 4 + 1) + 1 + x * 4, d = Math.hypot(x - m, y - m);
    const col = d <= r * 0.55 ? [255, 255, 255, 255] : d <= r ? fg : bg;
    raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = col[3]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
const teal = [20, 184, 166, 255], navy = [16, 22, 44, 255], none = [0, 0, 0, 0];
png("assets/icon.png", 1024, navy, teal, 0.7);
png("assets/adaptive-icon.png", 1024, none, teal, 0.55);
png("assets/splash-icon.png", 512, none, teal, 0.9);
console.log("Created assets");
