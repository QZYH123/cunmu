"""4 · 题签 close-up: the cover fills the tile. 磁青 cloth, the paper title slip, the thread
at the right edge running out of frame."""
import sys, os, json, math as _m; sys.path.insert(0, os.path.dirname(__file__))
from bl import *; from bl_book import thread_book
a = argv(); out = a[0]; opt = json.loads(a[1]) if len(a) > 1 else {}
reset(samples=opt.get('samples', 48), look=opt.get('look', 'AgX - Medium High Contrast'), exposure=opt.get('exp', -0.1))
world('#F4EEE4', 0.2)
plane('table', (30, 30), (0, 0, 0), mat_paper('surface', '#E3DACB', '#D8CCB8', rough=0.9, fibre=0.15, scale=0.5))
cloth = mat_cloth('cloth', opt.get('cover', '#131A2C'), opt.get('cover2', '#22305A'), density=opt.get('density', 34), strength=opt.get('weave', 0.6))
pages = mat_pages('pages', '#EFE8D8', lines=150, dark='#CDBFA5')
th = mat_thread('thread', opt.get('thread', '#E4DCCB'), twist=260)
slip = mat_paper('slip', opt.get('slip', '#F1E9D8'), opt.get('slip2', '#E6D9BF'), rough=0.75, fibre=0.3, scale=2)
red = mat_solid('cinnabar', opt.get('frame_c', '#B23C26'), rough=0.6) if opt.get('frame', True) else None
ink = mat_solid('ink', '#1A1714', rough=0.7)
text = opt.get('text')
thread_book('b', W=1.0, H=1.42, T=0.11, cover=cover if False else cloth, pages=pages, thread=th, slip=slip, slip_frame=red,
            slip_size=tuple(opt.get('slip_size', [0.17, 0.70])), r=opt.get('r', 0.0058), slip_text=text, text_mat=ink,
            holes=tuple(opt.get('holes', [0.1, 0.37, 0.63, 0.9])))
el = opt.get('lel', 40) * _m.pi / 180; az = opt.get('laz', 125) * _m.pi / 180; d = 6
area_light((d * _m.cos(el) * _m.cos(az), d * _m.cos(el) * _m.sin(az), d * _m.sin(el)), (0, 0, 0), size=opt.get('lsize', 3.5), energy=opt.get('key', 1100), color='#FFF6EA')
area_light((3, -3, 5), (0, 0, 0), size=5, energy=opt.get('fill', 150), color='#EEF2FF')
cx, cy, sc = opt.get('cx', 0.0), opt.get('cy', 0.2), opt.get('scale', 1.0)
camera_persp((cx, cy, 10), (cx, cy, 0), ortho=sc)
render(out)
