"""a thread-bound book (线装书) builder for the r11 scenes"""
import math as _m
from bl import *

def thread_book(name, W=1.0, H=1.42, T=0.11, loc=(0, 0, 0), rot=0.0, cover=None, pages=None, thread=None,
                slip=None, slip_frame=None, slip_size=(0.17, 0.70), r=0.0052, inset=0.085, c=0.007,
                holes=(0.1, 0.37, 0.63, 0.9), corners=False, slip_text=None, text_mat=None):
    root = empty(name, loc, (0, 0, rot * _m.pi / 180))
    parts = [box(name + 'block', (W - 0.012, H - 0.012, T - 2 * c), (0, 0, T / 2), pages, bevel=0.004),
             box(name + 'top', (W, H, c), (0, 0, T - c / 2), cover, bevel=0.0035),
             box(name + 'bot', (W, H, c), (0, 0, c / 2), cover, bevel=0.0035)]
    if slip is not None:
        sw, sh = slip_size
        sx, sy = -W / 2 + 0.085 * W + sw / 2, H / 2 - 0.06 * H - sh / 2
        parts.append(box(name + 'slip', (sw, sh, 0.0025), (sx, sy, T + 0.00125), slip, bevel=0.0008, segs=2))
        if slip_frame is not None:
            m, lw = 0.016 * sw / 0.17, 0.0045 * sw / 0.17
            fw, fh = sw - 2 * m, sh - 2 * m
            for (dx, dy, w_, h_) in [(0, fh / 2, fw, lw), (0, -fh / 2, fw, lw), (fw / 2, 0, lw, fh), (-fw / 2, 0, lw, fh)]:
                parts.append(box(name + 'fr', (w_, h_, 0.0002), (sx + dx, sy + dy, T + 0.0026), slip_frame))
        if slip_text:
            parts += vtext(name + 'tx', slip_text, (sx, sy + sh * 0.14, T + 0.0027), sw * 0.62, sh * 0.42, text_mat, font='/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc')
    if thread is not None:
        xh = W / 2 - inset
        ys = [H / 2 - f * H for f in holes]
        z1 = T + r * 0.8
        for y in ys:
            pts = [(xh, y, z1), (W / 2 - 0.01, y, z1)]
            pts += [(W / 2 - 0.01 + (0.01 + r * .8) * _m.cos(t), y, T - 0.01 + (0.01 + r * .8) * _m.sin(t)) for t in [_m.pi / 3, _m.pi / 6, 0]]
            pts += [(W / 2 + r * 0.8, y, 0.02)]
            pts += [(W / 2 - 0.01 + (0.01 + r * .8) * _m.cos(t), y, 0.01 - (0.01 + r * .8) * _m.sin(t)) for t in [0, _m.pi / 6, _m.pi / 3]]
            pts += [(W / 2 - 0.01, y, -r * 0.8), (xh, y, -r * 0.8)]
            parts.append(tube(name + 'wrap', pts, r, thread))
        parts.append(tube(name + 'run', [(xh, -H / 2, z1 - 0.002)] + [(xh, y, z1) for y in sorted(ys)] + [(xh, H / 2, z1 - 0.002)], r, thread))
        for y, s_ in [(H / 2, 1), (-H / 2, -1)]:
            pts = [(xh, y - s_ * 0.06, z1)] + [(xh, y - s_ * 0.01 + s_ * (0.01 + r * .8) * _m.cos(t), T - 0.01 + (0.01 + r * .8) * _m.sin(t)) for t in [_m.pi / 2, _m.pi / 3, _m.pi / 6, 0]] + [(xh, y + s_ * r * 0.8, 0.02)]
            pts += [(xh, y - s_ * 0.01 + s_ * (0.01 + r * .8) * _m.cos(t), 0.01 - (0.01 + r * .8) * _m.sin(t)) for t in [0, _m.pi / 6, _m.pi / 3, _m.pi / 2]] + [(xh, y - s_ * 0.06, -r * 0.8)]
            parts.append(tube(name + 'head', pts, r, thread))
        if corners:
            for y, s_ in [(H / 2, 1), (-H / 2, -1)]:
                parts.append(tube(name + 'corner', [(xh, y, z1), (W / 2 - 0.004, y - s_ * (W / 2 - xh - 0.004), z1)], r * 0.9, thread))
        hole = mat_solid(name + 'hole', '#0B0F18', rough=0.9)
        for y in ys:
            parts.append(box(name + 'hole', (0.02, 0.02, 0.0004), (xh, y, T + 0.0002), hole, bevel=0.009, segs=6))
    parent(parts, root)
    return root

def vtext(name, s, center, w, h, mat, font='/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'):
    """vertical title: one text object per character, stacked"""
    import bpy
    try:
        f = bpy.data.fonts.load(font)
    except Exception:
        f = None
    objs = []; n = len(s); step = h / n
    for i, ch in enumerate(s):
        cu = bpy.data.curves.new(name + str(i), 'FONT'); cu.body = ch
        if f: cu.font = f
        cu.size = min(w, step) * 0.95 * 2.4; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
        cu.extrude = 0.00015
        o = bpy.data.objects.new(name + str(i), cu); bpy.context.scene.collection.objects.link(o)
        o.location = (center[0], center[1] + h / 2 - step * (i + 0.5), center[2])
        o.data.materials.append(mat); objs.append(o)
    return objs
