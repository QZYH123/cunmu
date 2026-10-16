"""3 · 存: one character letterpressed in cinnabar into thick cotton paper, full bleed."""
import sys, os, json, math as _m; sys.path.insert(0, os.path.dirname(__file__))
from bl import *
import bpy
a = argv(); out = a[0]; maps = a[1]; opt = json.loads(a[2]) if len(a) > 2 else {}
reset(samples=opt.get('samples', 48), look=opt.get('look', 'AgX - Medium High Contrast'), exposure=opt.get('exp', 0.0))
world('#F4EEE4', opt.get('wstr', 0.3))
mt = M('press'); v = coord(mt, space='UV')
hi = mt.node('ShaderNodeTexImage'); hi.image = bpy.data.images.load(maps + '-height.png'); hi.image.colorspace_settings.name = 'Non-Color'
hi.interpolation = 'Cubic'
ii = mt.node('ShaderNodeTexImage'); ii.image = bpy.data.images.load(maps + '-ink.png'); ii.image.colorspace_settings.name = 'Non-Color'
mt.link(v, hi.inputs['Vector']); mt.link(v, ii.inputs['Vector'])
# paper: cotton, felt-like
vo = coord(mt, (1, 1, 1))
cloud = noise(mt, vo, 3, 4, 0.5)
paper_c = tint(mt, opt.get('paper', '#F1EBDF'), opt.get('paper2', '#E6DCCB'), math(mt, 'MULTIPLY', cloud.outputs['Fac'], 0.6))
ink_c = tint(mt, opt.get('ink', '#A8371F'), opt.get('ink2', '#93301C'), math(mt, 'MULTIPLY', noise(mt, vo, 12, 3, 0.5).outputs['Fac'], opt.get('inkvar', 0.3)))
mix = mt.node('ShaderNodeMix', _data_type='RGBA'); mt.link(ii.outputs['Color'], mix.inputs['Factor'])
mt.link(paper_c, mix.inputs['A']); mt.link(ink_c, mix.inputs['B']); mt.link(mix.outputs['Result'], mt.p.inputs['Base Color'])
felt = noise(mt, coord(mt, (180, 180, 180)), 1, 8, 0.7)
fib = noise(mt, coord(mt, (260, 60, 260)), 1, 6, 0.6)
tex = math(mt, 'ADD', felt.outputs['Fac'], fib.outputs['Fac'])
n1 = bump(mt, tex, opt.get('fibre', 0.18), 0.0006)
n2 = bump(mt, hi.outputs['Color'], 1.0, opt.get('depth', 0.02), normal=n1)
mt.link(n2, mt.p.inputs['Normal'])
rough = mt.node('ShaderNodeMix', _data_type='FLOAT'); mt.link(ii.outputs['Color'], rough.inputs['Factor'])
rough.inputs['A'].default_value = 0.9; rough.inputs['B'].default_value = opt.get('ink_rough', 0.55)
mt.link(rough.outputs['Result'], mt.p.inputs['Roughness'])
bpy.ops.mesh.primitive_plane_add(size=2.0); o = bpy.context.active_object; o.data.materials.append(mt.m)
camera_top(2.0)
el = opt.get('lel', 32) * _m.pi / 180; az = opt.get('laz', 135) * _m.pi / 180
d = 6
area_light((d * _m.cos(el) * _m.cos(az), d * _m.cos(el) * _m.sin(az), d * _m.sin(el)), (0, 0, 0), size=opt.get('lsize', 3.0), energy=opt.get('key', 900), color='#FFF6EA')
area_light((3, -3, 5), (0, 0, 0), size=5, energy=opt.get('fill', 120), color='#EEF2FF')
render(out)
