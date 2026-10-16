/*
 * Fake cover IMAGES for generated works. These strings are image content (the stand-in for real
 * 240px thumbnails), not interface styling, so the token rules (颜色只住在作品里) don't apply here —
 * just like a JPEG cover. Output: SVG data URIs, deterministic per id, cached.
 */
import type { Kind } from '../data/types';
import { hash, rng } from '../lib/hash';

const PALETTES: string[][] = [
  ['#1F3A5F', '#F2C14E', '#F78154', '#F4F1EA'],
  ['#2E4632', '#E9D8A6', '#CA6702', '#F7F3E3'],
  ['#9B2226', '#E9D8A6', '#0A9396', '#F8F4EC'],
  ['#F4F1DE', '#E07A5F', '#3D405B', '#81B29A'],
  ['#0B132B', '#5BC0BE', '#F5F5F5', '#3A506B'],
  ['#F2E8CF', '#386641', '#BC4749', '#6A994E'],
  ['#FFCDB2', '#6D597A', '#B56576', '#355070'],
  ['#E63946', '#F1FAEE', '#1D3557', '#A8DADC'],
  ['#264653', '#E9C46A', '#F4A261', '#2A9D8F'],
  ['#FAF3DD', '#C8D5B9', '#4A7C59', '#1B4332'],
  ['#2B2D42', '#EDF2F4', '#EF233C', '#8D99AE'],
  ['#FFB703', '#023047', '#FB8500', '#8ECAE6'],
  ['#5F0F40', '#FB8B24', '#E36414', '#0F4C5C'],
  ['#EDE0D4', '#7F5539', '#B08968', '#2D2A26'],
  ['#CAF0F8', '#0077B6', '#03045E', '#F7F7F2'],
  ['#1B1B1E', '#D8C99B', '#A4243B', '#F5F0E6'],
  ['#D8E2DC', '#9D8189', '#3F3244', '#FFE5D9'],
  ['#F6BD60', '#84A59D', '#F28482', '#2F3E46'],
  ['#3C1642', '#086375', '#1DD3B0', '#F2F7E1'],
  ['#E9EDC9', '#606C38', '#283618', '#DDA15E'],
  ['#0D1B2A', '#E0E1DD', '#778DA9', '#C9A227'],
  ['#FF6B6B', '#FFF3E2', '#4ECDC4', '#1A535C'],
  ['#F0EAD2', '#A98467', '#6C584C', '#ADC178'],
  ['#7B2CBF', '#FFD6FF', '#240046', '#F72585'],
  ['#E8E3D3', '#1C1C1C', '#C1121F', '#669BBC'],
  ['#003049', '#FCBF49', '#D62828', '#EAE2B7'],
  ['#A3B18A', '#344E41', '#DAD7CD', '#588157'],
  ['#FFF1E6', '#F08080', '#2E294E', '#F4978E'],
];

const SERIF = "'Noto Serif CJK SC','Noto Serif SC','Songti SC',serif";
const SANS = "'Noto Sans CJK SC','PingFang SC',sans-serif";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const ART_SIZE: Record<Kind, [number, number]> = {
  book: [240, 360],
  anime: [240, 343],
  film: [240, 343],
  music: [240, 240],
  game: [240, 320],
  essay: [320, 240],
};

function vText(text: string, x: number, y: number, size: number, color: string, family = SERIF, weight = 600) {
  return Array.from(text.slice(0, 9))
    .map((ch, i) => `<text x="${x}" y="${y + i * size * 1.12}" font-family="${family}" font-weight="${weight}" font-size="${size}" fill="${color}" text-anchor="middle">${esc(ch)}</text>`)
    .join('');
}

function hText(text: string, x: number, y: number, size: number, color: string, anchor = 'start', family = SERIF, weight = 600) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-weight="${weight}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(text)}</text>`;
}

function book(id: string, title: string, author: string): string {
  const r = rng(hash(id));
  const [a, b, c, d] = PALETTES[Math.floor(r() * PALETTES.length)];
  const [W, H] = ART_SIZE.book;
  const t = Math.floor(r() * 7);
  const short = title.length <= 7;
  let body = '';
  switch (t) {
    case 0: // band
      body = `<rect width="${W}" height="${H}" fill="${a}"/><rect y="${H * 0.36}" width="${W}" height="${H * 0.3}" fill="${d}"/>`
        + `<rect y="${H * 0.36}" width="${W}" height="3" fill="${b}"/><rect y="${H * 0.66 - 3}" width="${W}" height="3" fill="${b}"/>`
        + hText(title.slice(0, 8), W / 2, H * 0.53, short ? 26 : 20, a, 'middle')
        + hText(author, W / 2, H * 0.88, 13, d, 'middle', SANS, 400);
      break;
    case 1: // sun
      body = `<rect width="${W}" height="${H}" fill="${a}"/><circle cx="${W * (0.4 + r() * 0.3)}" cy="${H * 0.52}" r="${W * 0.34}" fill="${b}"/>`
        + `<circle cx="${W * 0.78}" cy="${H * 0.3}" r="${W * 0.08}" fill="${c}"/>`
        + hText(title.slice(0, 9), 20, 52, short ? 24 : 19, d)
        + hText(author, 20, H - 24, 12, d, 'start', SANS, 400);
      break;
    case 2: { // stripes
      let x = 0; let s = '';
      while (x < W) { const w = 10 + r() * 34; s += `<rect x="${x}" width="${w + 1}" height="${H * 0.7}" fill="${[a, b, c, d][Math.floor(r() * 4)]}"/>`; x += w; }
      body = `<rect width="${W}" height="${H}" fill="${d}"/>${s}`
        + hText(title.slice(0, 9), 18, H * 0.82, short ? 24 : 18, a)
        + hText(author, 18, H * 0.92, 12, a, 'start', SANS, 400);
      break;
    }
    case 3: // landscape
      body = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>`
        + `<rect width="${W}" height="${H}" fill="url(#g)"/>`
        + `<path d="M0 ${H * 0.62} L${W * 0.3} ${H * 0.44} L${W * 0.55} ${H * 0.58} L${W * 0.8} ${H * 0.4} L${W} ${H * 0.55} V${H} H0Z" fill="${c}"/>`
        + `<path d="M0 ${H * 0.74} L${W * 0.4} ${H * 0.6} L${W} ${H * 0.72} V${H} H0Z" fill="${a}"/>`
        + vText(title, W - 30, 48, 20, a)
        + hText(author, 18, H - 22, 12, d, 'start', SANS, 400);
      break;
    case 4: // big glyph
      body = `<rect width="${W}" height="${H}" fill="${d}"/>`
        + `<text x="${W * 0.62}" y="${H * 0.72}" font-family="${SERIF}" font-weight="700" font-size="${W * 1.05}" fill="${a}" text-anchor="middle">${esc(title[0])}</text>`
        + hText(title.slice(0, 9), 18, 40, 18, c)
        + hText(author, 18, H - 22, 12, a, 'start', SANS, 400);
      break;
    case 5: { // dots
      let s = '';
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) s += `<circle cx="${30 + x * 45}" cy="${110 + y * 30}" r="${4 + r() * 9}" fill="${r() > 0.75 ? c : b}"/>`;
      body = `<rect width="${W}" height="${H}" fill="${a}"/>${s}`
        + hText(title.slice(0, 9), 20, 60, short ? 24 : 18, d)
        + hText(author, 20, H - 24, 12, d, 'start', SANS, 400);
      break;
    }
    default: // arch
      body = `<rect width="${W}" height="${H}" fill="${b}"/>`
        + `<path d="M${W * 0.18} ${H * 0.86} V${H * 0.42} A${W * 0.32} ${W * 0.32} 0 0 1 ${W * 0.82} ${H * 0.42} V${H * 0.86}Z" fill="${a}"/>`
        + `<circle cx="${W / 2}" cy="${H * 0.5}" r="${W * 0.1}" fill="${c}"/>`
        + hText(title.slice(0, 9), W / 2, 48, short ? 22 : 17, a, 'middle')
        + hText(author, W / 2, H - 16, 12, a, 'middle', SANS, 400);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

function poster(id: string, title: string, kind: Kind): string {
  const r = rng(hash(id));
  const [a, b, c, d] = PALETTES[Math.floor(r() * PALETTES.length)];
  const [W, H] = ART_SIZE[kind];
  const film = kind === 'film';
  const sky = film
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".7" stop-color="${c}"/><stop offset="1" stop-color="#111"/></linearGradient></defs>`
    : `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`;
  let shapes = '';
  for (let i = 0; i < 6; i++) shapes += `<circle cx="${r() * W}" cy="${r() * H * 0.7}" r="${4 + r() * (film ? 6 : 26)}" fill="${d}" opacity="${0.3 + r() * 0.6}"/>`;
  const figure = film
    ? `<rect x="${W * 0.38}" y="${H * 0.42}" width="${W * 0.24}" height="${H * 0.5}" rx="${W * 0.12}" fill="#111" opacity=".85"/><circle cx="${W / 2}" cy="${H * 0.38}" r="${W * 0.09}" fill="#111" opacity=".85"/>`
    : `<path d="M${W * 0.2} ${H} Q${W * 0.5} ${H * 0.35} ${W * 0.8} ${H}Z" fill="${a}"/><circle cx="${W / 2}" cy="${H * 0.5}" r="${W * 0.16}" fill="${d}"/>`;
  const label = film
    ? hText(title.slice(0, 8), W / 2, H * 0.2, title.length > 5 ? 22 : 30, d, 'middle', SANS, 700)
    : hText(title.slice(0, 10), 16, H - 22, title.length > 6 ? 18 : 24, d, 'start', SANS, 700);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${sky}<rect width="${W}" height="${H}" fill="url(#g)"/>${shapes}${figure}${label}</svg>`;
}

function music(id: string, title: string, artist: string): string {
  const r = rng(hash(id));
  const [a, b, c, d] = PALETTES[Math.floor(r() * PALETTES.length)];
  const S = 240;
  const t = Math.floor(r() * 3);
  let body = `<rect width="${S}" height="${S}" fill="${a}"/>`;
  if (t === 0) for (let i = 6; i > 0; i--) body += `<circle cx="${S * 0.62}" cy="${S * 0.45}" r="${i * 17}" fill="${i % 2 ? b : c}"/>`;
  else if (t === 1) for (let i = 0; i < 14; i++) { const h = 20 + r() * 120; body += `<rect x="${18 + i * 15}" y="${150 - h}" width="9" height="${h}" fill="${i % 3 ? b : c}"/>`; }
  else for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) body += `<rect x="${24 + x * 50}" y="${18 + y * 42}" width="40" height="32" fill="${[b, c, d][Math.floor(r() * 3)]}"/>`;
  body += hText(title.slice(0, 12), 18, S - 38, 17, d, 'start', SANS, 700) + hText(artist, 18, S - 18, 11, d, 'start', SANS, 400);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`;
}

function game(id: string, title: string): string {
  const r = rng(hash(id));
  const [a, b, c, d] = PALETTES[Math.floor(r() * PALETTES.length)];
  const [W, H] = ART_SIZE.game;
  let px = '';
  for (let y = 0; y < 10; y++) for (let x = 0; x < 8; x++) if (r() > 0.62) px += `<rect x="${x * 30}" y="${60 + y * 18}" width="30" height="18" fill="${r() > 0.5 ? b : c}" opacity="${0.5 + r() * 0.5}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#14141a"/>`
    + `<rect width="${W}" height="${H}" fill="${a}" opacity=".55"/>${px}`
    + `<polygon points="${W / 2},${H * 0.22} ${W * 0.82},${H * 0.6} ${W / 2},${H * 0.8} ${W * 0.18},${H * 0.6}" fill="${d}" opacity=".9"/>`
    + hText(title.slice(0, 10), W / 2, H - 26, title.length > 6 ? 18 : 24, '#fff', 'middle', SANS, 700)
    + `</svg>`;
}

/** A photo-like landscape, used as an essay's first image. */
function photo(id: string): string {
  const r = rng(hash(id) ^ 0x9e3779b9);
  const [a, b, c, d] = PALETTES[Math.floor(r() * PALETTES.length)];
  const [W, H] = ART_SIZE.essay;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${d}"/><stop offset=".55" stop-color="${b}"/><stop offset=".56" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`
    + `<rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="${W * 0.7}" cy="${H * 0.36}" r="${H * 0.1}" fill="${d}" opacity=".9"/>`
    + `<path d="M0 ${H * 0.7} Q${W * 0.5} ${H * 0.62} ${W} ${H * 0.72}" stroke="${d}" stroke-width="2" fill="none" opacity=".5"/></svg>`;
}

const cache = new Map<string, string>();
const uri = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

export function coverArt(id: string, kind: Kind, title: string, creator: string): string {
  const k = id + kind;
  let v = cache.get(k);
  if (!v) {
    const svg = kind === 'book' ? book(id, title, creator)
      : kind === 'music' ? music(id, title, creator)
      : kind === 'game' ? game(id, title)
      : kind === 'essay' ? photo(id)
      : poster(id, title, kind);
    v = uri(svg);
    cache.set(k, v);
  }
  return v;
}

export function artAspect(kind: Kind): number {
  const [w, h] = ART_SIZE[kind];
  return w / h;
}
