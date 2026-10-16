"""B · 寄居蟹: a small cinnabar crab whose shell is a stack of things it kept: a book,
a cassette, a game controller."""
import sys, os, json, math as _m; sys.path.insert(0, os.path.dirname(__file__))
import bpy
from toy import *
a = argv(); out = a[0]; opt = json.loads(a[1]) if len(a) > 1 else {}
reset(samples=opt.get('samples', 48), view=opt.get('view', 'AgX'), look=opt.get('look', 'AgX - Medium High Contrast'), exposure=opt.get('exp', -0.1))
studio(fill=opt.get('fill', 250), bg=opt.get('bg', '#C9DCE0'), key=opt.get('key', 900))
red = vinyl('crab', opt.get('crab', '#C8361E'), rough=0.42, sss=0.05, coat=0.35)
eyem = gloss('eye', '#1E1A18'); white = vinyl('white', '#FBF5EA', rough=0.5, sss=0.0)
ind = vinyl('ind', '#33456E', rough=0.5, sss=0.0, coat=0.2); pages = vinyl('pages', '#F4ECDD', rough=0.7, sss=0.0)
mus = vinyl('mus', '#E8B04A', rough=0.45, sss=0.0, coat=0.3); dark = vinyl('dark', '#2B2522', rough=0.5, sss=0.0)
teal = vinyl('teal', '#3E7C78', rough=0.45, sss=0.0, coat=0.3)
Z = 0.42   # stack starts above the crab's back
# crab body: a squashed dome under the stack
ball('body', (0, -0.1, 0.36), (0.78, 0.62, 0.36), red)
for s in (-1, 1):
    for k in range(3):   # legs: little bent capsules
        x = s * (0.62 + 0.08 * k); y = -0.1 + 0.25 * (k - 1)
        ball('leg', (x, y, 0.16), (0.2, 0.07, 0.07), red, rot=(0, s * 0.5, s * 0.25 * (k - 1)))
    # claws: one bigger, chunky, in front
    big = 1.15 if s > 0 else 1.0
    ball('arm', (s * 0.5, -0.62, 0.3), (0.12, 0.2, 0.1), red, rot=(0.3, 0, s * 0.4))
    cx, cy, cz = s * 0.66, -0.9, 0.34
    ball('claw', (cx, cy, cz), (0.25 * big, 0.22 * big, 0.2 * big), red)
    # pincer: two fingers opening forward in a V
    ball('fing_up', (cx - s * 0.04, cy - 0.27 * big, cz + 0.1 * big), (0.08 * big, 0.2 * big, 0.075 * big), red, rot=(-0.55, 0, s * 0.15))
    ball('fing_dn', (cx + s * 0.02, cy - 0.25 * big, cz - 0.07 * big), (0.07 * big, 0.17 * big, 0.065 * big), red, rot=(0.45, 0, s * 0.1))
    # eyes on stalks
    bpy.ops.mesh.primitive_cylinder_add(radius=0.045, depth=0.36, location=(s * 0.2, -0.62, 0.62), rotation=(0.2, s * 0.15, 0))
    st = bpy.context.active_object; st.data.materials.append(red); bpy.ops.object.shade_smooth()
    ball('eyeball', (s * 0.23, -0.66, 0.84), (0.13, 0.13, 0.13), white)
    ball('pupil', (s * 0.23, -0.77, 0.86), (0.075, 0.04, 0.085), eyem)
# the shell: book, cassette, controller
r = opt.get('rot', [6, -5, 4])
z = Z
rbox('bookc_b', (1.5, 1.08, 0.05), (0, 0.1, z + 0.025), ind, rot=(0, 0, r[0] * _m.pi / 180), bevel=0.02)
rbox('pages', (1.42, 1.02, 0.22), (0.02, 0.1, z + 0.16), pages, rot=(0, 0, r[0] * _m.pi / 180), bevel=0.015)
rbox('bookc_t', (1.5, 1.08, 0.05), (0, 0.1, z + 0.295), ind, rot=(0, 0, r[0] * _m.pi / 180), bevel=0.02)
z += 0.32
rbox('cassette', (1.25, 0.82, 0.18), (-0.04, 0.12, z + 0.09), mus, rot=(0, 0, r[1] * _m.pi / 180), bevel=0.04)
rbox('cass_lab', (0.95, 0.52, 0.02), (-0.04, 0.12, z + 0.185), white, rot=(0, 0, r[1] * _m.pi / 180), bevel=0.01)
for s in (-1, 1):
    c, sn = _m.cos(r[1] * _m.pi / 180), _m.sin(r[1] * _m.pi / 180)
    x, y = s * 0.24, 0.0
    bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=0.03, location=(-0.04 + x * c - y * sn, 0.12 + x * sn + y * c, z + 0.195))
    rr = bpy.context.active_object; rr.data.materials.append(dark)
z += 0.18
# controller: a soft pill with two buttons and a d-pad
ball('pad', (0.04, 0.3, z + 0.1), (0.5, 0.27, 0.12), teal, rot=(0, 0, r[2] * _m.pi / 180))
for s in (-1, 1):
    ball('grip', (0.04 + s * 0.4, 0.2, z + 0.09), (0.2, 0.22, 0.12), teal, rot=(0, 0, r[2] * _m.pi / 180))
ball('btn1', (0.3, 0.26, z + 0.21), (0.065, 0.065, 0.04), red)
ball('btn2', (0.42, 0.36, z + 0.21), (0.065, 0.065, 0.04), mus)
rbox('dpad1', (0.22, 0.07, 0.04), (-0.24, 0.3, z + 0.21), white, bevel=0.015)
rbox('dpad2', (0.07, 0.22, 0.04), (-0.24, 0.3, z + 0.21), white, bevel=0.015)
el = opt.get('elev', 24) * _m.pi / 180; az = opt.get('az', -18) * _m.pi / 180; dist = opt.get('dist', 9.5)
camera_persp((dist * _m.cos(el) * _m.sin(az), -dist * _m.cos(el) * _m.cos(az), dist * _m.sin(el)), (0, 0, opt.get('tz', 0.62)), lens=opt.get('lens', 100))
render(out)
