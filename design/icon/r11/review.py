"""review strip: masked icon at 480, then 60/48/32/16 on light and dark, plus 16/32 blown up"""
import sys
import numpy as np
from PIL import Image, ImageDraw

def squircle(size, n=5.0):
    s = size * 4
    y, x = np.mgrid[0:s, 0:s] + 0.5
    a = s / 2
    f = (np.abs(x - a) / a) ** n + (np.abs(y - a) / a) ** n
    m = (f <= 1).astype(np.uint8) * 255
    return Image.fromarray(m, 'L').resize((size, size), Image.LANCZOS)

def masked(icon, size):
    im = icon.convert('RGBA').resize((size, size), Image.LANCZOS)
    a = squircle(size)
    if icon.mode == 'RGBA':
        a = Image.fromarray(np.minimum(np.asarray(a), np.asarray(im.split()[3])))
    im.putalpha(a); return im

def strip(paths, out):
    rows = []
    for p in paths:
        ic = Image.open(p)
        W = 480 + 40 + 2 * (60 + 48 + 32 + 16 + 5 * 24) + 2 * 128 + 60
        row = Image.new('RGB', (W, 520), '#888')
        row.paste(Image.new('RGB', (520, 520), '#EDEBE6'), (0, 0))
        m = masked(ic, 480); row.paste(m, (20, 20), m)
        x = 540
        for bg in ['#F2F1EE', '#161616']:
            panel = Image.new('RGB', (sum([60, 48, 32, 16]) + 5 * 24, 520), bg)
            px = 24
            for s in [60, 48, 32, 16]:
                m = masked(ic, s); panel.paste(m, (px, 260 - s // 2), m); px += s + 24
            row.paste(panel, (x, 0)); x += panel.width
        for s in [32, 16]:
            m = masked(ic, s)
            bgp = Image.new('RGBA', (s, s), '#F2F1EE'); bgp.alpha_composite(m)
            big = bgp.resize((128, 128), Image.NEAREST)
            row.paste(big, (x + 10, 120 if s == 32 else 270)); 
        rows.append(row)
    W = max(r.width for r in rows)
    sheet = Image.new('RGB', (W, 520 * len(rows)), '#888')
    for i, r in enumerate(rows): sheet.paste(r, (0, 520 * i))
    sheet.save(out)

if __name__ == '__main__':
    strip(sys.argv[2:], sys.argv[1])
