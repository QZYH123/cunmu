"""A · 仓鼠: a round hamster, cheeks stuffed, holding a few tiny covers to its mouth."""
import sys, os, json, math as _m; sys.path.insert(0, os.path.dirname(__file__))
import bpy
from toy import *
a = argv(); out = a[0]; opt = json.loads(a[1]) if len(a) > 1 else {}
reset(samples=opt.get('samples', 48), view=opt.get('view', 'AgX'), look=opt.get('look', 'AgX - Medium High Contrast'), exposure=opt.get('exp', -0.2))
studio(fill=opt.get('fill', 250), bg=opt.get('bg', '#F2E2CC'), key=opt.get('key', 900))
fur = vinyl('fur', opt.get('fur', '#E08A3C'), rough=0.6, sss=0.08, coat=0.1, sheen=0.25)
belly = vinyl('belly', opt.get('belly', '#FBF1E2'), rough=0.6, sss=0.08, coat=0.1, sheen=0.25)
pink = vinyl('pink', '#F19C8D', rough=0.5, sss=0.2)
eyem = gloss('eye', '#1E1A18')
# body: one soft blob, cheeks bulging at the sides
z0 = 0.95
ball('body', (0, 0, z0), (1.0, 0.88, 0.92), fur)
for s_ in (-1, 1):
    ball('cheek', (s_ * 0.66, -0.32, z0 - 0.18), (0.56, 0.52, 0.5), fur)
ball('bellyp', (0, -0.5, z0 - 0.3), (0.56, 0.42, 0.5), belly)
for s in (-1, 1):
    ball('ear', (s * 0.56, 0.0, z0 + 0.76), (0.24, 0.13, 0.22), fur, rot=(0.15, s * 0.3, 0))
    ball('earin', (s * 0.56, -0.1, z0 + 0.74), (0.15, 0.04, 0.14), pink, rot=(0.15, s * 0.3, 0))
    ball('eye', (s * 0.3, -0.79, z0 + 0.22), (0.115, 0.07, 0.135), eyem)
    ball('blush', (s * 0.66, -0.8, z0 - 0.02), (0.12, 0.03, 0.07), pink)
ball('nose', (0, -0.87, z0 + 0.06), (0.07, 0.05, 0.05), pink)
# covers held at the mouth, fanned
cols = opt.get('covers', ['#D2492F', '#33456E', '#E8B04A'])
cw, ch = opt.get('cw', 0.3), opt.get('ch', 0.42)
for i, (c, ang, dx, dz) in enumerate(zip(cols, [-20, 2, 22], [-0.2, 0.0, 0.2], [0.0, 0.05, 0.0])):
    m = vinyl('cv%d' % i, c, rough=0.4, sss=0.0, coat=0.4)
    zc = z0 - 0.36 + dz; yc = -0.93 - 0.02 * (1 - abs(i - 1))
    rot = (0.12, ang * _m.pi / 180, 0)
    rbox('cover%d' % i, (cw, 0.05, ch), (dx, yc, zc), m, rot=rot, bevel=0.03)
    rbox('lab%d' % i, (cw * 0.6, 0.012, ch * 0.16), (dx, yc - 0.028, zc + ch * 0.18), belly, rot=rot, bevel=0.006, segs=2)
for s in (-1, 1):
    ball('paw', (s * 0.24, -1.0, z0 - 0.52), (0.13, 0.11, 0.1), belly)
el = opt.get('elev', 22) * _m.pi / 180; dist = opt.get('dist', 8.6)
camera_persp((0, -dist * _m.cos(el), z0 + dist * _m.sin(el)), (0, 0, opt.get('tz', 0.9)), lens=opt.get('lens', 100))
render(out)
