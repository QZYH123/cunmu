// r13 minimal-flat candidates. node design.mjs <id> <out.png> [json opts]   (id = all → sketch sheet)
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const [, , id, out, js] = process.argv; const o = js ? JSON.parse(js) : {};
const C = { red: '#C8442C', red2: '#B23A24', redL: '#D85A40', paper: '#F4ECDF', paper2: '#EADFCC', ink: '#22304D', ink2: '#1A253D',
  ochre: '#D9A441', sage: '#8DB09E', cream: '#FBF6EC', char: '#2A2522' };
const grad = (id, a, b, x2 = 0.25, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const base = (bgA, bgB, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${grad('bg', bgA, bgB)}
  <radialGradient id="sheen" cx="0.3" cy="0.15" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="${o.sheen ?? 0.18}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="drop" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="${o.blur ?? 14}"/><feOffset dy="${o.dy ?? 12}"/><feComponentTransfer><feFuncA type="linear" slope="${o.shadow ?? 0.22}"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  ${extra}</defs><rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#sheen)"/>${body}</svg>`;

const D = {
  // 1 目 + ribbon: the character 目 (a frame, three openings) with a bookmark ribbon laid over it
  mu: () => {
    const scheme = o.scheme || 'red';
    const S = { red: [C.redL, C.red2, C.cream, C.ink], ink: ['#2B3A5C', C.ink2, C.cream, C.red], paper: [C.paper, C.paper2, C.ink, C.red] }[scheme];
    const [A, B, F, R] = S;
    const w = o.w ?? 400, h = o.h ?? 560, x = 512 - w / 2 - (o.shift ?? 20), y = o.y ?? 210, t = o.t ?? 70, t2 = o.t2 ?? 58, rx = o.rx ?? 70, irx = o.irx ?? 18;
    const ih = (h - 2 * t - 2 * t2) / 3;
    const holes = [0, 1, 2].map(i => `<rect x="${x + t}" y="${y + t + i * (ih + t2)}" width="${w - 2 * t}" height="${ih}" rx="${irx}" fill="#000"/>`).join('');
    const rw = o.rw ?? 84, rx0 = x + w - t - rw - (o.rin ?? 40), ry0 = y - (o.rtop ?? 26), rh = h + (o.rlen ?? 120), notch = o.notch ?? 44;
    return base(A, B, `
      <mask id="m"><rect width="1024" height="1024" fill="#fff"/>${holes}</mask>
      <g filter="url(#drop)">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${F}" mask="url(#m)"/>
        <path d="M${rx0} ${ry0 + 14} q0 -14 14 -14 h${rw - 28} q14 0 14 14 v${rh} l${-rw / 2} ${-notch} l${-rw / 2} ${notch} z" fill="${R}"/>
      </g>`);
  },
  // 2 three covers in a cascade; the front one carries a title slip
  covers: () => base(o.bgA || C.paper, o.bgB || C.paper2, `
    <g filter="url(#drop)">
      <rect x="250" y="190" width="330" height="440" rx="44" fill="${C.ink}" transform="rotate(-8 415 410)"/>
      <rect x="350" y="260" width="330" height="440" rx="44" fill="${C.ochre}" transform="rotate(2 515 480)"/>
      <rect x="440" y="340" width="330" height="440" rx="44" fill="${C.red}" transform="rotate(9 605 560)"/>
    </g>
    <rect x="496" y="390" width="64" height="210" rx="16" fill="${C.cream}" transform="rotate(9 605 560)"/>`),
  // 3 a geometric 存 (round-ended strokes, one width), the 子's crossbar in cinnabar
  cun: () => {
    const sw = o.sw ?? 72, ink = o.dark ? C.cream : C.char, red = o.redc || C.red;
    const st = (c) => `stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    const k = o.k ?? 1, cx = 512, cy = 520;
    const T = (p) => p;  // coordinates drawn on a 1024 grid, scaled about the centre below
    return base(o.dark ? '#2B3A5C' : C.paper, o.dark ? C.ink2 : C.paper2, `<g filter="url(#drop)"><g transform="translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})">
      <path d="M250 352 H786" ${st(ink)}/>
      <path d="M546 226 C 500 380 420 520 270 650" ${st(ink)}/>
      <path d="M394 540 V818" ${st(ink)}/>
      <path d="M514 492 H754 L640 600" ${st(ink)}/>
      <path d="M640 600 V770 Q640 828 584 828 H560" ${st(ink)}/>
      <path d="M494 676 H800" ${st(red)}/>
    </g></g>`);
  },
  // 4 a stack of spines, lying flat; one of them is cinnabar and sticks out
  spines: () => {
    const bars = o.bars || [[260, 700, C.ink], [300, 640, C.ochre], [236, 590, C.red], [290, 660, C.sage], [270, 620, C.char]];
    const h = o.h ?? 92, gap = o.gap ?? 14, n = bars.length, y0 = 512 - (n * h + (n - 1) * gap) / 2;
    return base(C.paper, C.paper2, `<g filter="url(#drop)">${bars.map(([x, w, c], i) =>
      `<rect x="${x}" y="${y0 + i * (h + gap)}" width="${w - x + 260}" height="${h}" rx="${h / 2.4}" fill="${c}"/>`).join('')}</g>`);
  },
  // 5 《 》 the marks that hold a title in Chinese, holding nothing but a cinnabar dot
  shu: () => {
    const sw = o.sw ?? 76, ink = o.ink || C.char, h = o.h ?? 196, dx = o.dx ?? 108, gap = o.gap ?? 88, inner = o.inner ?? 112;
    const st = `stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    const L = (x) => `<path d="M${x} ${512 - h} L${x - dx} 512 L${x} ${512 + h}" ${st}/>`;
    const R = (x) => `<path d="M${x} ${512 - h} L${x + dx} 512 L${x} ${512 + h}" ${st}/>`;
    const iL = 512 - inner, iR = 512 + inner;
    return base(o.bgA || C.paper, o.bgB || C.paper2, `<g filter="url(#drop)">
      ${L(iL - gap)}${L(iL)}${R(iR)}${R(iR + gap)}
      ${o.dot === false ? '' : `<circle cx="512" cy="512" r="${o.r ?? 54}" fill="${o.dotc || C.red}"/>`}
    </g>`);
  },
  // 6 a title slip on indigo with one cinnabar dot: the name, kept
  slip: () => base(C.ink, C.ink2, `<g filter="url(#drop)">
      <rect x="402" y="176" width="220" height="672" rx="40" fill="${C.cream}"/>
      <circle cx="512" cy="700" r="46" fill="${C.red}"/>
      <rect x="452" y="260" width="120" height="22" rx="11" fill="${C.ink}" opacity="0.18"/>
    </g>`),
};
const render = async (k, file, size = 1024) => {
  const s = D[k](); writeFileSync(file.replace(/\.png$/, '.svg'), s);
  await sharp(Buffer.from(s), { density: 144 }).resize(size, size).png().toFile(file);
};
if (id === 'all') {
  const ids = Object.keys(D), cell = 300, comps = [];
  for (const [i, k] of ids.entries()) {
    const buf = await sharp(Buffer.from(D[k]())).resize(cell, cell).png().toBuffer();
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}"><rect width="${cell}" height="${cell}" rx="${cell * 0.225}" fill="#fff"/></svg>`);
    comps.push({ input: await sharp(buf).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(), left: 30 + i * (cell + 30), top: 30 });
    for (const [j, s] of [60, 40, 29, 16].entries()) comps.push({ input: await sharp(Buffer.from(D[k]())).resize(s, s).png().toBuffer(), left: 30 + i * (cell + 30) + j * 72, top: 360 });
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="50"><text x="0" y="36" font-family="Noto Sans CJK SC" font-size="30" fill="#333">${i + 1} ${k}</text></svg>`), left: 30 + i * (cell + 30), top: 440 });
  }
  await sharp({ create: { width: 30 + ids.length * (cell + 30), height: 500, channels: 3, background: '#EDEAE4' } }).composite(comps).png().toFile(out);
} else await render(id, out);
console.log(out);
