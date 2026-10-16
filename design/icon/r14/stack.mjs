// r14: refining r13 candidate 4 「一叠封面」 — three covers fanned on a sage tile, a title slip on the front one.
// node stack.mjs <out.png> '<json overrides>'   (writes the .svg next to it)
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

export const DEF = {
  // tile
  tileA: '#A3C2B1', tileB: '#7FA390', sheen: 0.18,
  // covers, back to front: colour, angle, centre
  covers: [
    { c: '#22304D', a: -8, x: 415, y: 410 },
    { c: '#D9A441', a: 2, x: 515, y: 480 },
    { c: '#C8442C', a: 9, x: 605, y: 560 },
  ],
  w: 330, h: 440, rx: 44, light: 0,          // light: top-left sheen on each cover (0 = flat)
  shadow: { blur: 14, dx: 0, dy: 12, o: 0.22, col: '#000' }, // shadow under each cover
  slip: { x: 56, y: 50, w: 64, h: 210, rx: 16, c: '#FBF6EC' }, // relative to the front cover's top-left
  shift: [0, 0], scale: 1,
};

const merge = (a, b) => { const o = { ...a }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k]; return o; };

/** the stack alone, on a 1024 grid (no tile); ids are prefixed so it can sit in another svg */
export function stackBody(p, id = 's') {
  const { w, h, rx, shadow: S } = p;
  const defs = `<filter id="${id}sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${S.blur}"/></filter>` +
    (p.light ? `<linearGradient id="${id}lt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${p.light}"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient>` : '');
  const one = (cv, i) => {
    const t = `rotate(${cv.a} ${cv.x} ${cv.y})`, x = cv.x - w / 2, y = cv.y - h / 2;
    const sh = S.o ? `<rect x="${x + S.dx}" y="${y + S.dy}" width="${w}" height="${h}" rx="${rx}" fill="${S.col}" opacity="${S.o}" filter="url(#${id}sh)" transform="${t}"/>` : '';
    const body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${cv.c}" transform="${t}"/>`;
    const lt = p.light ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#${id}lt)" transform="${t}"/>` : '';
    let slip = '';
    if (i === p.covers.length - 1 && p.slip) {
      const s = p.slip;
      slip = `<rect x="${x + s.x}" y="${y + s.y}" width="${s.w}" height="${s.h}" rx="${s.rx}" fill="${s.c}" transform="${t}"/>`;
    }
    return sh + body + lt + slip;
  };
  const inner = p.covers.map(one).join('');
  const [sx, sy] = p.shift;
  return { defs, body: `<g transform="translate(${512 + sx} ${512 + sy}) scale(${p.scale}) translate(-512 -512)">${inner}</g>` };
}

export function tileSvg(o = {}) {
  const p = merge(DEF, o);
  const { defs, body } = stackBody(p);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.tileA}"/><stop offset="1" stop-color="${p.tileB}"/></linearGradient>
  <radialGradient id="sheen" cx="0.3" cy="0.12" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="${p.sheen}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>${defs}</defs>
  <rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#sheen)"/>${body}</svg>`;
}

if (process.argv[1] && process.argv[1].endsWith('stack.mjs') && process.argv[2]) {
  const out = process.argv[2], o = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  const s = tileSvg(o); writeFileSync(out.replace(/\.png$/, '.svg'), s);
  await sharp(Buffer.from(s), { density: 144 }).resize(1024, 1024).png().toFile(out);
}
