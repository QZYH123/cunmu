"""height + ink maps for the letterpress 存 (direction 3), 2048 px"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
opt = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
out = sys.argv[1]
N = 2048
ch = opt.get('ch', '存'); size = opt.get('size', 0.56); weight = opt.get('weight', 'Bold')
font = ImageFont.truetype(f'/usr/share/fonts/opentype/noto/NotoSerifCJK-{weight}.ttc', int(N * size), index=2)
im = Image.new('L', (N, N), 0); d = ImageDraw.Draw(im)
l, t, r, b = d.textbbox((0, 0), ch, font=font)
d.text((N / 2 - (l + r) / 2 + opt.get('dx', 0) * N, N / 2 - (t + b) / 2 + opt.get('dy', 0) * N), ch, font=font, fill=255)
m = np.asarray(im, np.float32) / 255
if opt.get('grow'): m = ndi.grey_dilation(m, size=opt['grow'])
# impression: the type pushes the paper down; soft shoulders, a slight rim of pushed paper outside
depth = ndi.gaussian_filter(m, opt.get('soft', 2.2))
rim = np.clip(ndi.gaussian_filter(m, 9) - depth, 0, 1)
h = 0.5 - 0.42 * depth + opt.get('rim', 0.10) * rim
Image.fromarray((np.clip(h, 0, 1) * 65535).astype(np.uint16)).save(out + '-height.png')
# ink: sits in the impression; slightly starved in places, heavier at the edges (squash)
rng = np.random.default_rng(5)
n = ndi.gaussian_filter(rng.standard_normal((N, N)).astype(np.float32), 6); n /= n.std()
fine = ndi.gaussian_filter(rng.standard_normal((N, N)).astype(np.float32), 1.2); fine /= fine.std()
edge = np.clip(m - ndi.grey_erosion(m, size=7), 0, 1)
ink = np.clip(ndi.gaussian_filter(m, 0.8) * (opt.get('ink_base', 0.97) + opt.get('ink_n', 0.02) * n + opt.get('ink_f', 0.015) * fine) + 0.05 * ndi.gaussian_filter(edge, 1.5), 0, 1)
Image.fromarray((ink * 255).astype(np.uint8)).save(out + '-ink.png')
print('ok')
