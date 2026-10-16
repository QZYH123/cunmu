// The app mark for 存目: a small stack of covers — the things you've read, watched, played and listened to,
// laid one on another — on a sage tile. The front cover is cinnabar and carries only its title slip (题签):
// what is kept is the name. Ink-indigo, ochre and cinnabar; flat, with a soft tinted shadow under each cover
// and a faint light from the top left. Refined in design/icon/r14 (from r13 candidate 4).
// Everything is drawn on a 1024 grid; the platform files are made from these by scripts/make-icons.mjs.
export const PAPER = '#F8F7F5';    // --bg (light)
export const NIGHT = '#0F0F0E';    // --bg (dark)
export const SAGE_A = '#AACDB9';   // tile, top
export const SAGE_B = '#7BA691';   // tile, bottom
export const SAGE = '#93BBA6';     // the tile as one colour (pixel favicons, Android background fallback)

const W = 330, H = 440, RX = 30;
// back to front: colour, angle, centre. Even steps (about 95 across, 50 down, 10°) so the two slivers match.
const COVERS = [
  { c: '#263656', a: -12, x: 404, y: 446 },
  { c: '#E0AA45', a: -2, x: 498, y: 496 },
  { c: '#C8442C', a: 8, x: 600, y: 548 },
];
const SLIP = { x: 52, y: 46, w: 58, h: 196, rx: 12, c: '#FBF6EC' }; // on the front cover, from its top-left
// the stack's own scale and offset so it sits optically centred in the tile (contrast-weighted centre ≈ 510,518)
const STACK = { scale: 0.95, dx: 6, dy: 24 };

const placed = (scale, body) => {
  return `<g transform="translate(512 512) scale(${scale}) translate(-512 -512) translate(${512 + STACK.dx} ${512 + STACK.dy}) scale(${STACK.scale}) translate(-512 -512)">${body}</g>`;
};
const rot = (cv) => `rotate(${cv.a} ${cv.x} ${cv.y})`;
const box = (cv, grow = 0) => `x="${cv.x - W / 2 - grow}" y="${cv.y - H / 2 - grow}" width="${W + 2 * grow}" height="${H + 2 * grow}" rx="${RX + grow}"`;
const slipBox = (cv) => `x="${cv.x - W / 2 + SLIP.x}" y="${cv.y - H / 2 + SLIP.y}" width="${SLIP.w}" height="${SLIP.h}" rx="${SLIP.rx}"`;

/** the stack in colour (ids prefixed so several can share one document) */
export function stack(scale = 1, id = 'k') {
  const defs = `<defs><filter id="${id}s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>` +
    `<linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.1"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
  const body = COVERS.map((cv, i) =>
    `<rect ${box(cv)} transform="translate(5 10) ${rot(cv)}" fill="#16302A" opacity="0.24" filter="url(#${id}s)"/>` +
    `<rect ${box(cv)} transform="${rot(cv)}" fill="${cv.c}"/><rect ${box(cv)} transform="${rot(cv)}" fill="url(#${id}l)"/>` +
    (i === COVERS.length - 1 ? `<rect ${slipBox(cv)} transform="${rot(cv)}" fill="${SLIP.c}"/>` : '')).join('');
  return defs + placed(scale, body);
}

/** one colour (Android themed icons): the three covers, each cut apart from the one under it, the slip cut out */
export function stackMono(scale = 1, fill = '#000') {
  const gap = 18;
  const m = COVERS.map((cv, i) => (i ? `<rect ${box(cv, gap)} transform="${rot(cv)}" fill="#000"/>` : '') + `<rect ${box(cv)} transform="${rot(cv)}" fill="#fff"/>`).join('') +
    `<rect ${slipBox(COVERS[COVERS.length - 1])} transform="${rot(COVERS[COVERS.length - 1])}" fill="#000"/>`;
  return `<mask id="mm" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#000"/>${placed(scale, m)}</mask>` +
    `<rect width="1024" height="1024" fill="${fill}" mask="url(#mm)"/>`;
}

/** the sage ground: a gentle top-to-bottom gradient and a faint light from the top left */
export const ground = (rx = 0, id = 'g') => `<defs><linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SAGE_A}"/><stop offset="1" stop-color="${SAGE_B}"/></linearGradient>` +
  `<radialGradient id="${id}b" cx="0.3" cy="0.12" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
  `<rect width="1024" height="1024" rx="${rx}" fill="url(#${id}a)"/><rect width="1024" height="1024" rx="${rx}" fill="url(#${id}b)"/>`;

const doc = (inner, size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${inner}</svg>`;

/** full-bleed square, no transparency (iOS; PWA maskable with a smaller scale) */
export const square = (scale = 1) => doc(ground() + stack(scale));
/** a rounded tile with transparent corners (Windows, web, launch screens) */
export const tile = (scale = 1, rx = 224) => doc(ground(rx) + stack(scale));
/** Android adaptive icon, 108dp canvas: the ground fills it; the stack sits as on the 72dp visible tile (72/108),
 *  its farthest corner well inside the 66dp safe circle */
export const ADAPTIVE = 72 / 108;
export const background = () => doc(ground());
export const foreground = () => doc(stack(ADAPTIVE));
export const monochrome = (fill = '#000') => doc(stackMono(ADAPTIVE, fill));

// ── hand-placed pixel versions (rotation blurs below 48px): covers on whole pixels, stepping evenly ──
const px = (size, rx, rects) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
  `<rect width="${size}" height="${size}" rx="${rx}" fill="${SAGE}"/>` + rects.map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`).join('') + '</svg>';
const [I, O, R] = COVERS.map((c) => c.c);
/** 16px: three covers stepping two pixels, the slip one pixel wide */
export const tile16 = () => px(16, 3, [[2, 2, 7, 9, I], [4, 4, 7, 9, O], [6, 6, 7, 8, R], [8, 7, 1, 4, SLIP.c]]);
/** 32px (also scaled to 24): three pixels a step, the slip two wide */
export const tile32 = () => px(32, 7, [[6, 4, 13, 17, I], [9, 7, 13, 17, O], [13, 10, 13, 17, R], [15, 12, 2, 7, SLIP.c]]);

/** the start screen's inline mark (index.html), the same tile at 96px, its ids kept apart from the page's */
export const splashSvg = () => doc(ground(224, 'splash-g') + stack(1, 'splash-k')).replace('width="1024" height="1024" viewBox', 'width="96" height="96" viewBox');
