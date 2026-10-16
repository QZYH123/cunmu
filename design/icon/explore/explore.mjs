// Icon directions for 存目 (r10). node explore.mjs <out.png> [ids]
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const G = JSON.parse(readFileSync(new URL('./glyphs.json', import.meta.url), 'utf8'));
export const INK = '#141413', PAPER = '#F8F7F5', NIGHT = '#0F0F0E', CIN = '#C4432B', GREY = '#5F5D59', PALE = '#D3CFC7';
const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`;
const tileBg = (fill = INK) => `<rect width="1024" height="1024" rx="224" fill="${fill}"/>`;
/** a glyph placed so its bounds' centre sits at (cx,cy) with height h */
const glyph = (key, cx, cy, h, fill) => {
  const g = G[key]; const [x0, y0, x1, y1] = g.bounds; const s = h / (y1 - y0);
  return `<path d="${g.d}" fill="${fill}" transform="translate(${cx} ${cy}) scale(${s}) translate(${-(x0 + x1) / 2} ${-(y0 + y1) / 2})"/>`;
};
export const D = {
  // A. 目录页 with 朱丝栏: a page, ruled columns, one entry ticked in cinnabar
  A1: () => svg(tileBg() + `<rect x="272" y="196" width="480" height="632" rx="10" fill="${PAPER}"/>` +
    [0, 1, 2, 3, 4].map((i) => `<rect x="${332 + i * 82}" y="262" width="14" height="${[420, 300, 500, 360, 260][i]}" fill="${INK}"/>`).join('') +
    `<circle cx="${339 + 2 * 82}" cy="236" r="0" fill="${CIN}"/><rect x="${325 + 2 * 82}" y="262" width="28" height="500" fill="${CIN}"/>`),
  A2: () => svg(tileBg() + `<rect x="272" y="196" width="480" height="632" rx="10" fill="${PAPER}"/>` +
    // 朱丝栏: cinnabar column rules; ink entries in two of the columns
    [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${296 + i * 86}" y="236" width="6" height="552" fill="${CIN}" opacity=".85"/>`).join('') +
    `<rect x="${296 + 86 * 4 + 30}" y="276" width="26" height="380" fill="${INK}"/><rect x="${296 + 86 * 3 + 30}" y="276" width="26" height="250" fill="${INK}"/>`),
  // B. 线装书 with 题签: dark cover, stitches on the right, a slip at the top left
  B1: () => svg(tileBg(PAPER) + `<rect x="272" y="176" width="480" height="672" rx="10" fill="${INK}"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="${668}" y="${236 + i * 176}" width="84" height="12" fill="${PAPER}"/>`).join('') +
    `<rect x="656" y="176" width="10" height="672" fill="${PAPER}" opacity=".18"/>` +
    `<rect x="316" y="226" width="96" height="340" fill="${PAPER}"/><rect x="340" y="262" width="48" height="48" fill="${CIN}"/>`),
  B2: () => svg(tileBg() + `<rect x="272" y="176" width="480" height="672" rx="10" fill="${PAPER}"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="${672}" y="${236 + i * 176}" width="80" height="14" fill="${INK}"/>`).join('') +
    `<rect x="652" y="176" width="10" height="672" fill="${PALE}"/>` +
    `<rect x="320" y="228" width="100" height="360" fill="${CIN}"/>`),
  // C. 存 in a refined serif
  C1: () => svg(tileBg() + glyph('bold:存', 512, 512, 560, PAPER)),
  C2: () => svg(tileBg(PAPER) + glyph('bold:存', 512, 500, 520, INK) + `<rect x="712" y="736" width="64" height="64" fill="${CIN}"/>`),
  C3: () => svg(`<rect width="1024" height="1024" rx="224" fill="${CIN}"/>` + glyph('bold:存', 512, 512, 560, PAPER)),
  // D. 目 as a list: a frame with two rules = three entries; one kept in cinnabar
  D1: () => svg(tileBg() + `<path fill-rule="evenodd" fill="${PAPER}" d="M332 176h360v672H332Z M392 236v152h240V236Z M392 448v152h240V448Z M392 660v128h240V660Z"/>` +
    `<rect x="392" y="448" width="240" height="152" fill="${CIN}"/>`),
  D2: () => svg(tileBg() + `<rect x="352" y="180" width="320" height="664" fill="${PAPER}"/>` +
    `<rect x="352" y="390" width="320" height="40" fill="${INK}"/><rect x="352" y="604" width="320" height="40" fill="${INK}"/>` +
    `<rect x="352" y="180" width="320" height="210" fill="${CIN}"/>`),
  D3: () => svg(tileBg() + glyph('bold:目', 512, 512, 600, PAPER)),
  // E. spines where only the label plates remain
  E1: () => svg(tileBg() + [[300, 236, 300], [420, 196, 380], [540, 256, 260], [660, 216, 340]].map(([x, y, h], i) =>
    `<rect x="${x}" y="${y}" width="64" height="${h}" rx="4" fill="${i === 2 ? CIN : PAPER}"/>`).join('') + `<rect x="260" y="820" width="504" height="10" fill="${GREY}"/>`),
  // B, round 2. Book 288..736 × 168..856 (0.65), bound on the right: holes on a line, threads round the edge
  B3: () => svg(tileBg() + book({})),
  B4: () => svg(tileBg() + book({ slipW: 84, slipH: 400 })),
  B5: () => svg(tileBg(PAPER) + book({ cover: INK, stitch: PAPER, rule: '#3A3936' })),
  B6: () => svg(tileBg() + book({ thread: true })),
  B7: () => svg(tileBg() + book({ outline: true })),
  B8: () => svg(tileBg() + book({ slipW: 84, slipH: 400, thread: true })),
  B9: () => svg(tileBg() + book({ slipW: 96, slipH: 420, thread: true, text: true })),
  B10: () => svg(tileBg() + book({ slipW: 84, slipH: 400, thread: true, slipFill: PAPER, frame: true })),
};
function book({ cover = PAPER, stitch = INK, rule = PALE, slipW = 100, slipH = 360, thread = false, outline = false, text = false, slipFill = CIN, frame = false } = {}) {
  const x = 288, y = 168, w = 448, h = 688, sx = 652;   // sx: the hole line
  const holes = [0.1, 0.37, 0.63, 0.9].map((t) => y + h * t);
  const body = outline
    ? `<path fill-rule="evenodd" fill="${PALE}" d="M${x} ${y}h${w}v${h}h${-w}Z M${x + 22} ${y + 22}v${h - 44}h${w - 44}v${-h + 44}Z"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${cover}"/>`;
  const sti = holes.map((hy) => `<rect x="${sx}" y="${hy - 7}" width="${x + w - sx}" height="14" fill="${outline ? PALE : stitch}"/>`).join('') +
    (thread ? `<rect x="${sx - 3}" y="${holes[0]}" width="6" height="${holes[3] - holes[0]}" fill="${stitch}"/>` : `<rect x="${sx - 26}" y="${y}" width="8" height="${h}" fill="${outline ? PALE : rule}"/>`);
  const sxL = x + 44, syT = y + 52;
  let slip = `<rect x="${sxL}" y="${syT}" width="${slipW}" height="${slipH}" fill="${slipFill}"/>`;
  if (frame) slip += `<rect x="${sxL}" y="${syT}" width="${slipW}" height="${slipH}" fill="none" stroke="${INK}" stroke-width="10"/><rect x="${sxL + 26}" y="${syT + 40}" width="${slipW - 52}" height="${slipW - 52}" fill="${CIN}"/>`;
  if (text) slip += glyph('regular:存', sxL + slipW / 2, syT + 120, 64, PAPER) + glyph('regular:目', sxL + slipW / 2, syT + 210, 64, PAPER);
  return body + sti + slip;
}
const _unused = {
};
const NAMES = { A1: '目录页，一条朱笔', A2: '朱丝栏页面', B1: '线装书 · 纸底墨书', B2: '线装书 · 题签', B3: '线装书 · 宽题签', B4: '线装书 · 细长题签', B5: '墨色书衣', B6: '线装书 · 穿线', B7: '只剩轮廓与题签', B8: '细长题签 + 穿线', B9: '题签上写「存目」', B10: '纸题签 + 小朱印', C1: '「存」字 · 宋体', C2: '「存」+ 朱点', C3: '朱底「存」(印章)', D1: '「目」作清单，一格朱', D2: '三格，顶格朱', D3: '「目」字', E1: '只剩书签的书脊' };
const out = process.argv[2]; const ids = (process.argv[3] ?? Object.keys(D).join(',')).split(',');
if (out) {
  const png = (s, size) => sharp(Buffer.from(s), { density: Math.max(72, 72 * size * 2 / 1024) }).resize(size, size).png().toBuffer();
  const circ = (s) => s.replace(/(<svg[^>]*>)/, '$1<clipPath id="c"><circle cx="512" cy="512" r="400"/></clipPath><g clip-path="url(#c)">').replace('</svg>', '</g></svg>').replace(/rx="224"/, '');
  const ROW = 300, W = 1500;
  const CHOSEN = 'B8';
  const cells = [];
  let y = 20;
  for (const id of ids) {
    const s = D[id]();
    let x = 40;
    for (const [sz, dy] of [[256, 0]]) { cells.push({ input: await png(s, sz), left: x, top: y + dy }); x += sz + 30; }
    cells.push({ input: await png(s, 256), left: x, top: y }); x += 256 + 30;   // on dark half (placed over dark band below)
    for (const sz of [96, 64, 32, 16]) { cells.push({ input: await png(s, sz), left: x, top: y + 256 - sz }); x += sz + 24; }
    cells.push({ input: await png(circ(s), 160), left: x, top: y + 96 }); x += 190;
    const name = NAMES[id] ?? '';
    cells.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="90"><text x="0" y="30" font-size="28" font-family="Noto Sans CJK SC, sans-serif" fill="${id === CHOSEN ? CIN : '#777'}">${id}${id === CHOSEN ? ' · 选定' : ''}</text><text x="0" y="70" font-size="22" font-family="Noto Sans CJK SC, sans-serif" fill="#777">${name}</text></svg>`), left: x + 10, top: y + 90 });
    y += ROW;
  }
  const H = y;
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/><rect x="316" width="276" height="${H}" fill="${NIGHT}"/></svg>`;
  await sharp(Buffer.from(base)).composite(cells).png().toFile(out);
  console.log(out);
}
