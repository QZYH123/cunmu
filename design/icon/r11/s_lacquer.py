"""4 · 朱漆: a cinnabar lacquer plaque with one blank paper title slip (or the reverse:
磁青 with a cinnabar slip). Full bleed, top down; the window reflects softly in the lacquer."""
import sys, os, json, math as _m; sys.path.insert(0, os.path.dirname(__file__))
from bl import *
a = argv(); out = a[0]; opt = json.loads(a[1]) if len(a) > 1 else {}
reset(samples=opt.get('samples', 48), look=opt.get('look', 'AgX - Medium High Contrast'), exposure=opt.get('exp', 0.0))
world(opt.get('world', '#F4EEE4'), opt.get('wstr', 0.35))
kind = opt.get('kind', 'lacquer')
if kind == 'lacquer':
    mt = M('lac'); v = coord(mt)
    n = noise(mt, coord(mt, (1.2, 1.2, 1.2)), 2.0, 3, 0.5)
    mt.link(tint(mt, opt.get('base', '#9E2A1A'), opt.get('base2', '#7E1E13'), n.outputs['Fac']), mt.p.inputs['Base Color'])
    fine = noise(mt, coord(mt, (40, 40, 40)), 3, 4, 0.5)
    mt.link(bump(mt, fine.outputs['Fac'], opt.get('orange', 0.03), 0.001), mt.p.inputs['Normal'])
    mt.set(Roughness=0.45, Coat_Weight=1.0, Coat_Roughness=opt.get('coat_rough', 0.12))
    surf = mt.m
else:
    surf = mat_cloth('cloth', opt.get('base', '#131A2C'), opt.get('base2', '#22305A'), density=opt.get('density', 34), strength=0.55)
bpy_plane = box('plaque', (2.2, 2.2, 0.1), (0, 0, -0.05), surf)
sw, sh = opt.get('sw', 0.36), opt.get('sh', 1.16)
sx, sy = opt.get('sx', -0.32), opt.get('sy', 0.18)
if opt.get('slip', 'paper') == 'paper':
    slip = mat_paper('slip', opt.get('slip_c', '#F1E9D8'), opt.get('slip_c2', '#E3D6BC'), rough=0.8, fibre=0.35, scale=1.5)
else:
    slip = mat_paper('slip', opt.get('slip_c', '#B83F28'), opt.get('slip_c2', '#A53622'), rough=0.75, fibre=0.35, scale=1.5)
box('slip', (sw, sh, 0.005), (sx, sy, 0.0025), slip, bevel=0.0015, segs=2, rot=(0, 0, opt.get('srot', 0) * _m.pi / 180))
if opt.get('frame'):
    fm = mat_solid('frame', opt.get('frame_c', '#B23C26'), rough=0.6)
    m, lw = sw * 0.09, sw * 0.022
    fw, fh = sw - 2 * m, sh - 2 * m * 0.7
    for (dx, dy, w_, h_) in [(0, fh / 2, fw, lw), (0, -fh / 2, fw, lw), (fw / 2, 0, lw, fh), (-fw / 2, 0, lw, fh)]:
        box('fr', (w_, h_, 0.0004), (sx + dx, sy + dy, 0.0052), fm)
# key: large soft window high up-left (its reflection is the sheen in the lacquer)
area_light(tuple(opt.get('kpos', [-2.2, 2.6, 5.0])), (0, 0, 0), size=opt.get('ksize', 3.2), energy=opt.get('key', 1300), color='#FFF4E6', shape='RECTANGLE')
area_light((3, -3, 5), (0, 0, 0), size=5, energy=opt.get('fill', 150), color='#EEF2FF')
camera_top(2.0)
render(out)
