"""2 · 书叠: three thread-bound books in a loose stack, page edges in layers; a cinnabar
slip marks one of them."""
import sys, os, json, math as _m; sys.path.insert(0, os.path.dirname(__file__))
from bl import *; from bl_book import thread_book
a = argv(); out = a[0]; opt = json.loads(a[1]) if len(a) > 1 else {}
reset(samples=opt.get('samples', 48), look=opt.get('look', 'AgX - Medium High Contrast'), exposure=opt.get('exp', -0.2))
world('#F4EEE4', 0.25)
plane('table', (30, 30), (0, 0, 0), mat_paper('surface', opt.get('surface', '#E3DACB'), opt.get('surface2', '#D8CCB8'), rough=0.9, fibre=0.15, scale=0.5))
pages = mat_pages('pages', '#EFE8D8', lines=150, dark='#CDBFA5')
th = mat_thread('thread', '#E4DCCB', twist=260)
covers = opt.get('covers', [['#131A2C', '#22305A'], ['#B9A27A', '#CDB993'], ['#1A2236', '#2A3858']])
T = opt.get('T', 0.11); z = 0
rots = opt.get('rots', [4, -3, 1.5]); offs = opt.get('offs', [[0.02, 0.01], [-0.03, 0.0], [0.0, -0.01]])
slip = mat_paper('slip', '#F1E9D8', '#E6D9BF', rough=0.75, fibre=0.3, scale=2)
red = mat_solid('cinnabar', '#B8402A', rough=0.6)
for i, (cv, rt, of) in enumerate(zip(covers, rots, offs)):
    cm = mat_cloth('cloth%d' % i, cv[0], cv[1], density=38, strength=0.45) if i != 1 or not opt.get('paper_mid', True) else mat_paper('cov%d' % i, cv[0], cv[1], rough=0.8, fibre=0.35, scale=1.5)
    top = i == len(covers) - 1
    thread_book('b%d' % i, T=T, loc=(of[0], of[1], z), rot=rt, cover=cm, pages=pages, thread=th,
                slip=slip if top else None, slip_frame=red if top else None,
                slip_text=opt.get('text') if top else None, text_mat=mat_solid('ink%d' % i, '#1C1916', rough=0.75))
    z += T
# a cinnabar marker slip sticking out of the front between book 0 and 1
if opt.get('marker', True):
    mk = mat_paper('marker', opt.get('mk', '#C0432C'), opt.get('mk2', '#A93A26'), rough=0.6, fibre=0.25, scale=2)
    mz = opt.get('mz', T * 2)  # between book 1 and 2 by default
    box('marker', (0.09, 0.9, 0.0018), (opt.get('mx', -0.22), -1.42 / 2 - 0.05 + 0.45, mz + 0.0009), mk, bevel=0.0006, segs=2,
        rot=(0, 0, opt.get('mrot', 2) * _m.pi / 180))
area_light((-3.5, 2.5, 5.5), (0, 0, 0), size=4.5, energy=opt.get('key', 1400), color='#FFF6EA')
area_light((4, -5, 3), (0, 0, 0), size=6, energy=opt.get('fill', 300), color='#E8EEFF')
el = opt.get('elev', 38) * _m.pi / 180; az = opt.get('az', -20) * _m.pi / 180; dist = opt.get('dist', 8.0)
camera_persp((dist * _m.cos(el) * _m.sin(az), -dist * _m.cos(el) * _m.cos(az), dist * _m.sin(el)), (opt.get('tx', 0), opt.get('ty', 0), opt.get('tz', 0.15)), lens=opt.get('lens', 135))
render(out)
