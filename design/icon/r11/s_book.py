"""1 · 线装书: one thread-bound book lying on a warm surface, seen a little from the front.
磁青 cloth cover, paper title slip (题签), silk thread over the right edge."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from bl import *
import json
a = argv(); out = a[0]; opt = json.loads(a[1]) if len(a) > 1 else {}
S = opt.get('samples', 64)
reset(samples=S, view=opt.get('view', 'AgX'), look=opt.get('look', 'None'), exposure=opt.get('exp', 0.0))
world(opt.get('world', '#F4EEE4'), opt.get('wstr', 0.25))

surf = mat_paper('surface', opt.get('surface', '#E3DACB'), opt.get('surface2', '#D8CCB8'), rough=0.9, fibre=0.15, scale=0.5)
plane('table', (30, 30), (0, 0, 0), surf)

from bl_book import thread_book
import math as _m
T = opt.get('T', 0.11)
cloth = mat_cloth('cloth', opt.get('cover', '#1B2742'), opt.get('cover2', '#2A3A60'), density=opt.get('density', 38), strength=0.45)
pages = mat_pages('pages', '#EFE8D8', lines=opt.get('lines', 150), dark='#CDBFA5')
slipm = mat_paper('slip', opt.get('slip', '#F1E9D8'), opt.get('slip2', '#E6D9BF'), rough=0.75, fibre=0.3, scale=2)
ink = mat_solid('cinnabar', opt.get('frame_c', '#B8402A'), rough=0.6) if opt.get('frame', True) else None
th = mat_thread('thread', opt.get('thread', '#EEE8DA'), twist=opt.get('twist', 260))
thread_book('book', T=T, loc=(opt.get('bx', 0.0), opt.get('by', 0.0), 0), rot=opt.get('rot', 0), cover=cloth, pages=pages,
            thread=th, slip=slipm, slip_frame=ink, slip_size=(opt.get('sw', 0.17), opt.get('sh', 0.70)), r=opt.get('r', 0.0052),
            corners=opt.get('corners', False), slip_text=opt.get('text'), text_mat=mat_solid('ink', '#1C1916', rough=0.75))
# lights: big soft window upper left, gentle fill from the front right
area_light((-3.5, 2.5, 5.5), (0, 0, 0), size=opt.get('ksize', 4.5), energy=opt.get('key', 1400), color='#FFF6EA')
area_light((4, -5, 3), (0, 0, 0), size=6, energy=opt.get('fill', 250), color='#E8EEFF')
el = opt.get('elev', 58) * _m.pi / 180; az = opt.get('az', -12) * _m.pi / 180; dist = opt.get('dist', 9.5)
cam = (dist * _m.cos(el) * _m.sin(az), -dist * _m.cos(el) * _m.cos(az), dist * _m.sin(el))
camera_persp(cam, (opt.get('tx', 0), opt.get('ty', -0.05), T / 2), lens=opt.get('lens', 85))
render(out)
