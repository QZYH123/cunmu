// r12 rough sketches: eight ideas, quick SVG, same palette. node sketches.mjs out.png
import sharp from 'sharp';
const P = { bg: '#F3E9DA', ink: '#2B2522', red: '#D2492F', mus: '#E8B04A', teal: '#3E7C78', ind: '#33456E', tan: '#E2A974', cream: '#FBF5EA', pink: '#F0A493', grey: '#9A948C' };
const tile = (bg, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="0" fill="${bg}"/>${inner}</svg>`;
const eye = (x, y, r = 22) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${P.ink}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#fff"/>`;
const S = {
  hamster: tile(P.bg, `
    <ellipse cx="512" cy="600" rx="330" ry="290" fill="${P.tan}"/>
    <circle cx="300" cy="360" r="70" fill="${P.tan}"/><circle cx="724" cy="360" r="70" fill="${P.tan}"/>
    <circle cx="300" cy="360" r="38" fill="${P.pink}"/><circle cx="724" cy="360" r="38" fill="${P.pink}"/>
    <ellipse cx="512" cy="680" rx="210" ry="190" fill="${P.cream}"/>
    <ellipse cx="300" cy="600" rx="150" ry="130" fill="${P.tan}"/><ellipse cx="724" cy="600" rx="150" ry="130" fill="${P.tan}"/>
    ${eye(420, 500)}${eye(604, 500)}
    <ellipse cx="512" cy="560" rx="18" ry="12" fill="${P.ink}"/>
    <rect x="452" y="590" width="56" height="78" rx="6" fill="${P.red}" transform="rotate(-12 480 630)"/>
    <rect x="506" y="596" width="56" height="78" rx="6" fill="${P.ind}" transform="rotate(10 534 635)"/>
    <rect x="480" y="604" width="56" height="78" rx="6" fill="${P.mus}"/>`),
  crab: tile(P.bg, `
    <ellipse cx="512" cy="840" rx="300" ry="40" fill="#0002"/>
    <rect x="290" y="560" width="440" height="80" rx="14" fill="${P.ind}"/>
    <rect x="320" y="470" width="400" height="90" rx="14" fill="${P.mus}"/>
    <rect x="300" y="390" width="380" height="80" rx="14" fill="${P.teal}"/>
    <rect x="350" y="300" width="300" height="90" rx="14" fill="${P.cream}" stroke="${P.ink}" stroke-width="10"/>
    <circle cx="395" cy="345" r="22" fill="none" stroke="${P.ink}" stroke-width="10"/><circle cx="605" cy="345" r="22" fill="none" stroke="${P.ink}" stroke-width="10"/>
    <path d="M300 640 h420 a40 40 0 0 1 -40 120 h-340 a40 40 0 0 1 -40 -120z" fill="${P.red}"/>
    <line x1="420" y1="700" x2="400" y2="610" stroke="${P.red}" stroke-width="16"/><line x1="470" y1="700" x2="480" y2="610" stroke="${P.red}" stroke-width="16"/>
    ${eye(400, 600, 26)}${eye(480, 600, 26)}
    <circle cx="250" cy="740" r="60" fill="${P.red}"/><circle cx="780" cy="740" r="60" fill="${P.red}"/>`),
  cake: tile('#F6E3D3', `
    <path d="M250 420 L780 300 L780 740 L250 860 Z" fill="${P.cream}"/>
    <path d="M250 420 L780 300 L780 400 L250 520Z" fill="${P.ind}"/>
    <path d="M250 520 L780 400 L780 470 L250 590Z" fill="${P.cream}"/>
    <path d="M250 590 L780 470 L780 570 L250 690Z" fill="${P.mus}"/>
    <path d="M250 690 L780 570 L780 640 L250 760Z" fill="${P.cream}"/>
    <path d="M250 760 L780 640 L780 740 L250 860Z" fill="${P.teal}"/>
    <path d="M250 420 L520 250 L780 300 Z" fill="#FFF8EE"/>
    <circle cx="520" cy="250" r="56" fill="${P.red}"/><path d="M520 196 q20 -60 70 -70" stroke="${P.ink}" stroke-width="10" fill="none"/>`),
  jar: tile(P.bg, `
    <rect x="300" y="230" width="424" height="90" rx="30" fill="${P.red}"/>
    <path d="M280 330 h464 v400 a90 90 0 0 1 -90 90 h-284 a90 90 0 0 1 -90 -90z" fill="#DDEBEA" opacity="0.9"/>
    <rect x="330" y="560" width="120" height="170" rx="10" fill="${P.ind}" transform="rotate(-8 390 640)"/>
    <rect x="440" y="520" width="120" height="200" rx="10" fill="${P.mus}" transform="rotate(5 500 620)"/>
    <rect x="560" y="580" width="120" height="160" rx="10" fill="${P.teal}" transform="rotate(12 620 660)"/>
    <rect x="390" y="440" width="120" height="150" rx="10" fill="${P.red}" transform="rotate(-20 450 515)"/>
    <path d="M320 360 v300" stroke="#fff" stroke-width="28" stroke-linecap="round" opacity="0.7"/>`),
  magpie: tile('#E9EEF0', `
    <path d="M300 700 Q300 420 560 380 Q760 360 780 520 Q760 700 560 760 Z" fill="${P.ink}"/>
    <path d="M420 690 Q460 560 600 540 Q700 560 690 650 Q620 740 480 740Z" fill="#fff"/>
    <path d="M300 700 L140 860 L260 860 L360 760Z" fill="${P.ind}"/>
    <path d="M770 470 L880 500 L770 520Z" fill="${P.ink}"/>
    <rect x="840" y="440" width="70" height="96" rx="6" fill="${P.red}" transform="rotate(14 875 488)"/>
    ${eye(690, 460, 20)}`),
  mole: tile('#EAD9C0', `
    <rect x="0" y="560" width="1024" height="110" fill="#C99A6B"/><rect x="0" y="670" width="1024" height="120" fill="#B07F55"/><rect x="0" y="790" width="1024" height="234" fill="#8E6243"/>
    <rect x="200" y="600" width="60" height="80" rx="6" fill="${P.red}"/><rect x="700" y="710" width="80" height="56" rx="6" fill="${P.mus}"/><rect x="420" y="850" width="64" height="84" rx="6" fill="${P.teal}"/>
    <ellipse cx="512" cy="520" rx="190" ry="170" fill="#5B4B44"/>
    <ellipse cx="512" cy="560" rx="70" ry="50" fill="${P.pink}"/>
    <path d="M440 470 q20 -14 40 0" stroke="${P.ink}" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M544 470 q20 -14 40 0" stroke="${P.ink}" stroke-width="12" fill="none" stroke-linecap="round"/>
    <ellipse cx="380" cy="640" rx="70" ry="40" fill="${P.pink}"/><ellipse cx="644" cy="640" rx="70" ry="40" fill="${P.pink}"/>`),
  ticket: tile('#F4D9C8', `
    <path d="M250 300 h524 v140 a70 70 0 0 0 0 140 v140 h-524 v-140 a70 70 0 0 0 0 -140z" fill="${P.cream}" transform="rotate(-8 512 512)"/>
    <line x1="620" y1="300" x2="620" y2="720" stroke="${P.red}" stroke-width="10" stroke-dasharray="26 18" transform="rotate(-8 512 512)"/>
    ${eye(410, 490, 26)}${eye(520, 476, 26)}<path d="M430 580 q50 40 100 -10" stroke="${P.ink}" stroke-width="14" fill="none" stroke-linecap="round"/>`),
  chest: tile('#3B4766', `
    <rect x="220" y="480" width="584" height="330" rx="40" fill="${P.mus}"/>
    <rect x="260" y="330" width="120" height="180" rx="10" fill="${P.red}" transform="rotate(-14 320 420)"/>
    <rect x="400" y="300" width="120" height="200" rx="10" fill="${P.cream}" transform="rotate(4 460 400)"/>
    <rect x="540" y="320" width="120" height="180" rx="10" fill="${P.teal}" transform="rotate(16 600 410)"/>
    <path d="M200 470 h624 v90 h-624z" fill="#C98C2F"/>
    <rect x="470" y="520" width="84" height="110" rx="16" fill="${P.red}"/>
    ${eye(390, 690, 24)}${eye(634, 690, 24)}`),
};
const names = { hamster: '仓鼠', crab: '寄居蟹', cake: '千层蛋糕', jar: '收纳罐', magpie: '喜鹊', mole: '鼹鼠', ticket: '票根', chest: '宝箱' };
const out = process.argv[2]; const ids = Object.keys(S);
const cell = 360, cols = 4, rows = Math.ceil(ids.length / cols);
const comps = [];
for (const [i, id] of ids.entries()) {
  const png = await sharp(Buffer.from(S[id])).resize(cell, cell).png().toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}"><rect width="${cell}" height="${cell}" rx="${cell * 0.225}" fill="#fff"/></svg>`);
  const m = await sharp(png).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const sm = await sharp(Buffer.from(S[id])).resize(40, 40).png().toBuffer();
  const x = 40 + (i % cols) * (cell + 60), y = 40 + Math.floor(i / cols) * (cell + 140);
  comps.push({ input: m, left: x, top: y }, { input: sm, left: x, top: y + cell + 20 });
  comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><text x="0" y="40" font-family="Noto Sans CJK SC" font-size="34" fill="#333">${String.fromCharCode(65 + i)} ${names[id]}</text></svg>`), left: x + 60, top: y + cell + 10 });
}
await sharp({ create: { width: 40 + cols * (cell + 60), height: 40 + rows * (cell + 140), channels: 3, background: '#EDEAE4' } }).composite(comps).png().toFile(out);
console.log(out);
