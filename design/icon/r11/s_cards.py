"""5 · 目录卡: a catalogue drawer of cream cards; one card stands up, a cinnabar tab on it."""
import sys, os, json, math as _m; sys.path.insert(0, os.path.dirname(__file__))
from bl import *
a = argv(); out = a[0]; opt = json.loads(a[1]) if len(a) > 1 else {}
reset(samples=opt.get('samples', 48), look=opt.get('look', 'AgX - Medium High Contrast'), exposure=opt.get('exp', -0.1))
world('#F4EEE4', 0.25)
plane('table', (30, 30), (0, 0, 0), mat_paper('surface', opt.get('surface', '#E3DACB'), '#D8CCB8', rough=0.9, fibre=0.15, scale=0.5))
wood = mat_solid('drawer', opt.get('drawer', '#1B2236'), rough=opt.get('drough', 0.35), coat=opt.get('dcoat', 0.0), coat_rough=0.3, spec=opt.get('dspec', 0.35), noise_var=opt.get('drawer2', '#232C45'), nscale=3)
DW, DL, DH, wt = opt.get('DW', 1.25), opt.get('DL', 1.5), opt.get('DH', 0.42), 0.05
# drawer: floor + four walls, open top
box('floor', (DW, DL, wt), (0, 0, wt / 2), wood, bevel=0.01)
for sx in (-1, 1): box('side', (wt, DL, DH), (sx * (DW - wt) / 2, 0, DH / 2), wood, bevel=0.012, segs=5)
box('back', (DW, wt, DH), (0, (DL - wt) / 2, DH / 2), wood, bevel=0.012, segs=5)
box('front', (DW, wt, DH * opt.get('fh', 1.0)), (0, -(DL - wt) / 2, DH * opt.get('fh', 1.0) / 2), wood, bevel=0.012, segs=5)
card = mat_paper('card', opt.get('card', '#F0E9DA'), '#E2D7C1', rough=0.8, fibre=0.25, scale=2)
tab = mat_paper('tab', opt.get('tab', '#B63D27'), '#A33521', rough=0.7, fibre=0.25, scale=2)
n = opt.get('n', 11); CW, CH, ct = DW - 2 * wt - 0.06, opt.get('CH', 0.62), 0.006
y0, y1 = -(DL / 2) + wt + 0.12, DL / 2 - wt - 0.1
pick = opt.get('pick', 4)
import random; random.seed(3)
for i in range(n):
    y = y0 + (y1 - y0) * i / (n - 1)
    lean = opt.get('lean', 12) + random.uniform(-2.5, 2.5)
    up = opt.get('up', 0.22) if i == pick else random.uniform(0, 0.012)
    h = CH
    red_card = i == pick and opt.get('redcard')
    o = box('c%d' % i, (CW, ct, h), (0, y, wt + h / 2 + up), tab if red_card else card, bevel=0.002, segs=2, rot=(-lean * _m.pi / 180, 0, 0))
    if i == pick and not red_card:
        # cinnabar tab on the top edge, left of centre
        tw = opt.get('tabw', 0.3)
        t = box('tab', (tw, ct * 1.15, 0.1), (opt.get('tabx', -0.22), 0, h / 2 + 0.05 - 0.002), tab, bevel=0.002, segs=2)
        t.parent = o
        if opt.get('cardred'):
            pass
if opt.get('face', True):
    brass = mat_solid('brass', '#B08D57', rough=0.32, metallic=1.0)
    fy = -DL / 2 - 0.004
    lw_, lh_ = opt.get('lw', 0.42), opt.get('lh', 0.14)
    lz = DH * 0.62
    box('lab', (lw_ - 0.03, 0.006, lh_ - 0.03), (0, fy - 0.002, lz), mat_paper('label', '#F1E9D8', '#E6D9BF', rough=0.8, fibre=0.3, scale=3))
    for (dx, dz, w_, h_) in [(0, lh_ / 2, lw_, 0.016), (0, -lh_ / 2, lw_, 0.016), (lw_ / 2, 0, 0.016, lh_), (-lw_ / 2, 0, 0.016, lh_)]:
        box('lh', (w_, 0.012, h_), (dx, fy - 0.006, lz + dz), brass, bevel=0.004, segs=3)
    # pull: a small brass knob below the label
    import bpy
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=(0, fy - 0.03, DH * 0.3), segments=32, ring_count=16)
    k = bpy.context.active_object; k.scale = (1, 0.8, 1); k.data.materials.append(brass)
    for p_ in k.data.polygons: p_.use_smooth = True
el = opt.get('lel', 55) * _m.pi / 180; az = opt.get('laz', 120) * _m.pi / 180; d = 6
area_light((d * _m.cos(el) * _m.cos(az), d * _m.cos(el) * _m.sin(az), d * _m.sin(el)), (0, 0, 0), size=opt.get('lsize', 4.0), energy=opt.get('key', 1400), color='#FFF6EA')
area_light((3, -4, 4), (0, 0, 0), size=6, energy=opt.get('fill', 250), color='#EEF2FF')
el = opt.get('elev', 48) * _m.pi / 180; az = opt.get('az', -18) * _m.pi / 180; dist = opt.get('dist', 7.5)
camera_persp((dist * _m.cos(el) * _m.sin(az), -dist * _m.cos(el) * _m.cos(az), dist * _m.sin(el)), (0, opt.get('ty', 0.05), opt.get('tz', 0.3)), lens=opt.get('lens', 135))
render(out)
