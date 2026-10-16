"""composite a transparent toy render (with caught shadows) onto a gradient tile.
python comp.py in.png out.png '{"top":"#..","bottom":"#..","dy":0,"scale":1}'"""
import sys, json
import numpy as np
from PIL import Image
inp, out = sys.argv[1], sys.argv[2]; o = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
im = Image.open(inp).convert('RGBA')
S = 1024
if im.size != (S, S): im = im.resize((S, S), Image.LANCZOS)
sc = o.get('scale', 1.0)
if sc != 1.0:
    n = int(S * sc); im2 = im.resize((n, n), Image.LANCZOS); c = Image.new('RGBA', (S, S)); c.alpha_composite(im2, ((S - n) // 2 + int(o.get('dx', 0)), (S - n) // 2 + int(o.get('dy', 0)))); im = c
elif o.get('dy') or o.get('dx'):
    c = Image.new('RGBA', (S, S)); c.alpha_composite(im, (int(o.get('dx', 0)), int(o.get('dy', 0)))); im = c
# two passes: <name>.png = the toy alone (clean alpha), <name>-catch.png = with the caught shadow
from scipy import ndimage as ndi
toy = np.asarray(im).astype(np.float32)
cat = Image.open(inp.replace('.png', '-catch.png')).convert('RGBA')
if cat.size != (S, S): cat = cat.resize((S, S), Image.LANCZOS)
if o.get('dx') or o.get('dy'):
    c = Image.new('RGBA', (S, S)); c.alpha_composite(cat, (int(o.get('dx', 0)), int(o.get('dy', 0)))); cat = c
ca = np.asarray(cat).astype(np.float32)[..., 3] / 255
ta = toy[..., 3] / 255
ys, xs = np.where(ta > 0.5)
cx, cy = xs.mean(), ys.max() - (ys.max() - ys.min()) * 0.15
yy, xx = np.mgrid[0:S, 0:S]
fall = np.clip(1 - np.hypot((xx - cx) / (S * o.get('sr', 0.42)), (yy - cy) / (S * o.get('sr', 0.42) * 0.55)), 0, 1) ** 1.5
shadow_a = ndi.gaussian_filter(ca, 3) * fall * o.get('so', 0.8)
shadow = np.zeros((S, S, 4), np.uint8); shadow[..., 3] = (shadow_a * 255).clip(0, 255).astype(np.uint8)
toy = toy.clip(0, 255).astype(np.uint8)
def hx(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
t, b = hx(o.get('top', '#F6EBDA')), hx(o.get('bottom', '#EAD9BE'))
y, x = np.mgrid[0:S, 0:S] / (S - 1)
g = np.clip(y * 0.85 + x * 0.15, 0, 1)[..., None]
bg = t * (1 - g) + b * g
# soft light from the upper left
r = np.hypot(x - 0.3, y - 0.2)[..., None]
bg = bg + (255 - bg) * 0.22 * np.clip(1 - r / 0.9, 0, 1) ** 2
bgim = Image.fromarray(bg.clip(0, 255).astype(np.uint8), 'RGB').convert('RGBA')
bgim.alpha_composite(Image.fromarray(shadow, 'RGBA'))
bgim.alpha_composite(Image.fromarray(toy, 'RGBA'))
bgim.convert('RGB').save(out)
print(out)
