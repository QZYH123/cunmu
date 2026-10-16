// r12 flat-plus-light candidates as SVG → PNG. node flat.mjs <id> <out.png> [json opts]
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const [, , id, out, js] = process.argv; const o = js ? JSON.parse(js) : {};
const C = { ink: '#25211F', red: '#D0452B', red2: '#B13820', mus: '#E8AE45', mus2: '#D29531', ind: '#33456E', ind2: '#26365A',
  teal: '#3E7C78', cream: '#FBF4E6', cream2: '#EFE3CC', paper: o.bg || '#F2E7D5', paper2: o.bg2 || '#E6D6BC' };
const defs = (extra = '') => `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${C.paper}"/><stop offset="1" stop-color="${C.paper2}"/></linearGradient>
  <radialGradient id="glow" cx="0.32" cy="0.22" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${o.sh || 18}"/></filter>
  <filter id="soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
  ${extra}</defs>`;
const svg = (body, extra) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs(extra)}
  <rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>${body}</svg>`;

const magpie = () => {
  const extra = `
  <linearGradient id="tail" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#1E3B5C"/><stop offset="0.6" stop-color="#2B6B6E"/><stop offset="1" stop-color="#1A2433"/></linearGradient>
  <linearGradient id="black" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#3A3532"/><stop offset="1" stop-color="#171413"/></linearGradient>
  <linearGradient id="wing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E4A73"/><stop offset="1" stop-color="#1B2438"/></linearGradient>
  <linearGradient id="white" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9E2D6"/></linearGradient>
  <radialGradient id="headhi" cx="0.35" cy="0.3" r="0.6"><stop offset="0" stop-color="#6A625C" stop-opacity="0.9"/><stop offset="1" stop-color="#6A625C" stop-opacity="0"/></radialGradient>`;
  const sx = o.sx ?? 0, sy = o.sy ?? 0;
  const book = (x, y, w, h, c, c2, line) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${c}"/>
    <rect x="${x}" y="${y + h - 12}" width="${w}" height="12" rx="6" fill="${c2}" opacity="0.6"/>
    <rect x="${x + 16}" y="${y + 9}" width="${w - 32}" height="${h - 24}" rx="6" fill="${C.cream}" opacity="${line}"/>`;
  const k = o.k ?? 1;
  return svg(`<g transform="translate(${sx} ${sy}) translate(512 560) scale(${k}) translate(-512 -560)">
    <ellipse cx="560" cy="866" rx="250" ry="34" fill="#3B2A1A" opacity="0.18" filter="url(#soft)"/>
    <!-- the pile it keeps -->
    <g transform="rotate(-3 560 800)">${book(390, 790, 340, 64, C.teal, '#2C5E5A', 0)}</g>
    <g transform="rotate(2.5 560 740)">${book(420, 730, 300, 62, C.ind, C.ind2, 0)}</g>
    <g transform="rotate(-1.5 560 690)">${book(440, 676, 270, 58, C.mus, C.mus2, 0)}</g>
    <!-- legs -->
    <path d="M548 640 L540 682 M600 640 L606 682" stroke="${C.ink}" stroke-width="14" stroke-linecap="round"/>
    <!-- tail -->
    <path d="M462 572 C390 636 300 716 214 818 Q206 832 222 832 C320 770 416 696 512 616 Z" fill="url(#tail)"/><path d="M470 590 C404 646 336 708 262 784" stroke="#5FA3A0" stroke-opacity="0.35" stroke-width="6" fill="none" stroke-linecap="round"/>
    <!-- body -->
    <path d="M430 600 C410 470 500 360 640 352 C740 348 800 410 796 480 C792 570 716 646 600 660 C520 670 448 650 430 600 Z" fill="url(#black)"/>
    <!-- belly -->
    <path d="M500 632 C522 556 612 520 716 532 C752 566 712 628 610 652 C560 664 520 656 500 632 Z" fill="url(#white)"/>
    <!-- head -->
    <circle cx="712" cy="382" r="98" fill="url(#black)"/><circle cx="712" cy="382" r="98" fill="url(#headhi)"/>
    <!-- wing with the white shoulder patch -->
    <path d="M462 470 C540 420 660 430 704 498 C650 566 548 608 440 622 C430 560 438 506 462 470 Z" fill="url(#wing)"/>
    <path d="M500 486 C560 452 640 458 668 488 C620 512 556 522 498 516 Z" fill="url(#white)"/>
    <!-- beak and the card it carries -->
    <path d="M796 360 L872 384 L798 404 Z" fill="${C.ink}"/>
    <g transform="rotate(${o.cardrot ?? 16} 880 392)">
      <rect x="846" y="330" width="${o.cw || 78}" height="${o.ch || 104}" rx="10" fill="${C.red}"/>
      <rect x="846" y="${330 + (o.ch || 104) - 14}" width="${o.cw || 78}" height="14" rx="7" fill="${C.red2}" opacity="0.7"/>
      <rect x="860" y="350" width="${(o.cw || 78) - 28}" height="14" rx="5" fill="${C.cream}"/>
    </g>
    <!-- eye -->
    <circle cx="738" cy="368" r="17" fill="#0D0B0A"/><circle cx="744" cy="362" r="6" fill="#fff"/>
  </g>`, extra);
};

const cake = () => {
  const extra = `
  <linearGradient id="top" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FFFBF3"/><stop offset="1" stop-color="#F1E4CF"/></linearGradient>
  <radialGradient id="cherry" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#F06A4A"/><stop offset="0.6" stop-color="${C.red}"/><stop offset="1" stop-color="${C.red2}"/></radialGradient>
  <linearGradient id="sideshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.10"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient>`;
  const X0 = o.x0 ?? 210, W = o.w ?? 420, H = o.h ?? 400, Y0 = o.y0 ?? 440, SW = o.sw ?? 190, SK = o.sk ?? 0.62;
  // the layers, top to bottom, each a thing that was kept; drawn in a 0..w box
  const layers = (w, detail) => {
    const L = []; let y = 0;
    const band = (h, fill) => { L.push(`<rect x="0" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`); const t = y; y += h; return t; };
    band(40, C.cream);
    const yc = band(76, C.mus);
    if (detail) { L.push(`<rect x="${w * 0.12}" y="${yc + 17}" width="${w * 0.76}" height="42" rx="21" fill="${C.mus2}"/>`);
      L.push(`<circle cx="${w * 0.3}" cy="${yc + 38}" r="14" fill="${C.cream}"/><circle cx="${w * 0.7}" cy="${yc + 38}" r="14" fill="${C.cream}"/>`); }
    band(28, C.cream);
    const yb = band(76, C.ind);
    L.push(`<rect x="0" y="${yb + 14}" width="${w}" height="48" fill="${C.cream2}"/>`);
    if (detail) for (let i = 0; i < 6; i++) L.push(`<rect x="0" y="${yb + 20 + i * 7}" width="${w}" height="2" fill="#D6C5A4"/>`);
    band(28, C.cream);
    const yf = band(72, C.ink);
    if (detail) for (let i = 0; i < Math.floor(w / 46); i++) { L.push(`<rect x="${14 + i * 46}" y="${yf + 10}" width="22" height="13" rx="3" fill="${C.cream}" opacity="0.85"/><rect x="${14 + i * 46}" y="${yf + 49}" width="22" height="13" rx="3" fill="${C.cream}" opacity="0.85"/>`); }
    band(28, C.cream);
    band(H - y, '#E2B272');
    return L.join('');
  };
  const tipX = X0 + W, backY = Y0 - SW * SK;
  return svg(`
    <ellipse cx="${X0 + W / 2 + 60}" cy="${Y0 + H + 18}" rx="330" ry="34" fill="#3B2A1A" opacity="0.22" filter="url(#soft)"/>
    <!-- second cut face, receding to the back -->
    <g transform="translate(${tipX} ${Y0}) skewY(${-Math.atan(SK) * 180 / Math.PI})">
      <clipPath id="sc"><rect x="0" y="0" width="${SW}" height="${H}" rx="10"/></clipPath>
      <g clip-path="url(#sc)">${layers(SW, false)}<rect width="${SW}" height="${H}" fill="url(#sideshade)"/></g>
    </g>
    <!-- top: frosting, the back edge is the crust -->
    <path d="M${X0} ${Y0} L${tipX} ${Y0} L${tipX + SW} ${backY} Z" fill="url(#top)"/>
    <path d="M${X0} ${Y0} L${tipX + SW} ${backY}" stroke="#E7CFA6" stroke-width="10" stroke-linecap="round"/>
    <!-- front cut face -->
    <clipPath id="fc"><rect x="${X0}" y="${Y0}" width="${W}" height="${H}" rx="14"/></clipPath>
    <g clip-path="url(#fc)"><g transform="translate(${X0} ${Y0})">${layers(W, true)}</g></g>
    <!-- a little cream piped on top, and the cherry -->
    <circle cx="${o.chx ?? X0 + W * 0.72}" cy="${(o.chy ?? Y0 - 46) + 34}" r="44" fill="${C.cream}"/>
    <path d="M${o.chx ?? X0 + W * 0.72} ${(o.chy ?? Y0 - 46) - 50} q16 -64 84 -80" stroke="#4A3B2A" stroke-width="12" fill="none" stroke-linecap="round"/>
    <circle cx="${o.chx ?? X0 + W * 0.72}" cy="${o.chy ?? Y0 - 46}" r="58" fill="url(#cherry)"/>
    <ellipse cx="${(o.chx ?? X0 + W * 0.72) - 20}" cy="${(o.chy ?? Y0 - 46) - 22}" rx="16" ry="10" fill="#fff" opacity="0.6" transform="rotate(-30 ${(o.chx ?? X0 + W * 0.72) - 20} ${(o.chy ?? Y0 - 46) - 22})"/>
  `, extra);
};
const S = { magpie, cake };
const s = S[id]();
writeFileSync(out.replace(/\.png$/, '.svg'), s);
await sharp(Buffer.from(s), { density: 144 }).resize(1024, 1024).png().toFile(out);
console.log(out);
