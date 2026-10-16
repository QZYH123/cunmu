"""presentation sheets for r11: candidate-N.png and overview.png"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from review import squircle, masked

SANS = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
SANSB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
SERIF = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'
def F(p, s, i=2): return ImageFont.truetype(p, s, index=i)

def shadowed(canvas, icon, xy, size, dark=False):
    m = masked(icon, size)
    sh = Image.new('RGBA', (size + 80, size + 80), (0, 0, 0, 0))
    a = m.split()[3].point(lambda v: int(v * (0.35 if dark else 0.18)))
    blk = Image.new('RGBA', m.size, (0, 0, 0, 255)); blk.putalpha(a)
    sh.paste(blk, (40, 40 + size // 40), blk)
    sh = sh.filter(ImageFilter.GaussianBlur(size / 40 + 1))
    canvas.alpha_composite(sh, (xy[0] - 40, xy[1] - 40))
    canvas.alpha_composite(m, xy)

def neutral_icons(size):
    """a few plain stand-in icons for the home screen row"""
    out = []
    specs = [('#5B8DEF', '#3F6FD8', 'cal'), ('#34C26A', '#23A657', 'chat'), ('#F2F2F2', '#DADADA', 'photo'),
             ('#8E8E93', '#6C6C70', 'gear'), ('#FF9F0A', '#F07800', 'note'), ('#1C1C1E', '#2C2C2E', 'clock')]
    for c1, c2, kind in specs:
        s = 512; im = Image.new('RGBA', (s, s))
        g = np.linspace(0, 1, s)[:, None]
        a = np.array(Image.new('RGB', (1, 1), c1).getpixel((0, 0))); b = np.array(Image.new('RGB', (1, 1), c2).getpixel((0, 0)))
        arr = (a * (1 - g[..., None]) + b * g[..., None]) * np.ones((s, s, 1))
        im = Image.fromarray(arr.astype(np.uint8), 'RGB').convert('RGBA'); d = ImageDraw.Draw(im)
        w = (255, 255, 255, 235)
        if kind == 'cal': d.rounded_rectangle((140, 150, 372, 370), 30, outline=w, width=22); d.line((140, 215, 372, 215), fill=w, width=22)
        if kind == 'chat': d.ellipse((120, 130, 392, 350), fill=w); d.polygon([(170, 320), (150, 400), (240, 340)], fill=w)
        if kind == 'photo':
            for i, col in enumerate(['#FF5E57', '#FFB340', '#4CD964', '#5AC8FA']):
                ang = i * np.pi / 2
                d.ellipse((256 + 70 * np.cos(ang) - 80, 256 + 70 * np.sin(ang) - 80, 256 + 70 * np.cos(ang) + 80, 256 + 70 * np.sin(ang) + 80), fill=col + 'C0')
        if kind == 'gear': d.ellipse((150, 150, 362, 362), outline=w, width=34); d.ellipse((226, 226, 286, 286), fill=w)
        if kind == 'note': d.rectangle((0, 0, 512, 130), fill=(255, 220, 120)); [d.line((110, y, 400, y), fill=w, width=16) for y in (220, 290, 360)]
        if kind == 'clock': d.ellipse((120, 120, 392, 392), fill=(250, 250, 250)); d.line((256, 256, 256, 170), fill=(20, 20, 20), width=14); d.line((256, 256, 320, 280), fill=(20, 20, 20), width=14)
        out.append((im, {'cal': '日历', 'chat': '信息', 'photo': '照片', 'gear': '设置', 'note': '备忘录', 'clock': '时钟'}[kind]))
    return out

def home_row(icon, dark, W=1100, H=300, size=120):
    bg = Image.new('RGBA', (W, H))
    g = np.linspace(0, 1, H)[:, None, None]
    if dark: c1, c2 = np.array([28, 30, 38]), np.array([12, 12, 16])
    else: c1, c2 = np.array([226, 222, 214]), np.array([196, 204, 214])
    arr = (c1 * (1 - g) + c2 * g) * np.ones((H, W, 1)); bg = Image.fromarray(arr.astype(np.uint8), 'RGB').convert('RGBA')
    d = ImageDraw.Draw(bg); f = F(SANS, 24)
    icons = neutral_icons(size)
    order = [icons[0], (icon, '存目'), icons[2], icons[1]] if not dark else [icons[5], icons[3], (icon, '存目'), icons[4]]
    gap = (W - 4 * size) / 5
    for i, (ic, label) in enumerate(order):
        x = int(gap + i * (size + gap)); y = 60
        shadowed(bg, ic, (x, y), size, dark)
        tw = d.textlength(label, font=f)
        d.text((x + size / 2 - tw / 2, y + size + 14), label, font=f, fill=(245, 245, 245) if dark else (30, 30, 30))
    return bg

def candidate(icon_path, n, title, line, out):
    icon = Image.open(icon_path).convert('RGB')
    W, H = 2460, 1400
    c = Image.new('RGBA', (W, H), (240, 238, 234, 255)); d = ImageDraw.Draw(c)
    shadowed(c, icon, (80, 150), 1024)
    d.text((80, 40), f'{n}  {title}', font=F(SERIF, 54), fill=(28, 26, 24))
    d.text((80, 1210), line, font=F(SANS, 30), fill=(90, 86, 80))
    # sizes on light and dark
    x0 = 1200
    for row, (bg, fg) in enumerate([((246, 245, 242), (60, 60, 60)), ((22, 22, 24), (200, 200, 200))]):
        y0 = 150 + row * 290
        panel = Image.new('RGBA', (1180, 270), bg + (255,)); pd = ImageDraw.Draw(panel)
        x = 40
        for s in [180, 60, 40, 29]:
            shadowed(panel, icon, (x, 40 + (180 - s) // 2), s, row == 1)
            pd.text((x + s / 2 - 20, 232), f'{s}', font=F(SANS, 22), fill=fg)
            x += s + 70
        # 16 px favicon-ish, blown up 4x nearest so the pixels show
        sm = masked(icon, 16); b = Image.new('RGBA', (16, 16), bg + (255,)); b.alpha_composite(sm)
        panel.paste(b.resize((64, 64), Image.NEAREST), (x + 10, 98))
        pd.text((x + 4, 232), '16 (×4)', font=F(SANS, 22), fill=fg)
        c.alpha_composite(panel, (x0, y0))
    c.alpha_composite(home_row(icon, False, 1180, 260, 116), (x0, 750))
    c.alpha_composite(home_row(icon, True, 1180, 260, 116), (x0, 1030))
    c.convert('RGB').save(out)

def overview(items, out):
    n = len(items); S = 600; gap = 70
    W = n * S + (n + 1) * gap; H = S + 300
    c = Image.new('RGBA', (W, H), (240, 238, 234, 255)); d = ImageDraw.Draw(c)
    for i, (p, title) in enumerate(items):
        x = gap + i * (S + gap)
        shadowed(c, Image.open(p).convert('RGB'), (x, 90), S)
        t = f'{i + 1}  {title}'; tw = d.textlength(t, font=F(SERIF, 44))
        d.text((x + S / 2 - tw / 2, 90 + S + 50), t, font=F(SERIF, 44), fill=(28, 26, 24))
        # small sizes under it
        xx = x + S / 2 - (60 + 40 + 29 + 40) / 2
        for s in [60, 40, 29]:
            shadowed(c, Image.open(p).convert('RGB'), (int(xx), 90 + S + 140 + (60 - s) // 2), s); xx += s + 20
    c.convert('RGB').save(out)

if __name__ == '__main__':
    spec = json.load(open(sys.argv[1]))
    for i, it in enumerate(spec['items']):
        candidate(it['icon'], i + 1, it['title'], it['line'], f"{spec['out']}/candidate-{i + 1}.png")
    overview([(it['icon'], it['title']) for it in spec['items']], f"{spec['out']}/overview.png")
    print('ok')
