"""Blender helpers for the r11 icon renders (Blender 4.2, Cycles CPU).
run: blender -b --factory-startup -P <scene>.py -- out.png [samples]"""
import bpy, bmesh, math, sys
from mathutils import Vector, Euler

def argv():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return a

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)

def reset(size=1024, samples=96, view='AgX', look='None', exposure=0.0):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.cycles.denoiser = 'OPENIMAGEDENOISE'
    s.cycles.max_bounces = 6
    s.render.resolution_x = s.render.resolution_y = size
    s.render.resolution_percentage = 100
    s.render.film_transparent = False
    s.view_settings.view_transform = view
    if look != 'None': s.view_settings.look = look
    s.view_settings.exposure = exposure
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_depth = '16'
    w = bpy.data.worlds.new('w'); s.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    return s

def world(color='#ffffff', strength=0.15):
    bg = bpy.context.scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = srgb(color); bg.inputs['Strength'].default_value = strength

def camera_top(ortho=2.0, z=10):
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = ortho
    o = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(o)
    o.location = (0, 0, z); o.rotation_euler = (0, 0, 0); bpy.context.scene.camera = o
    return o

def camera_persp(loc, target, lens=85, ortho=None):
    cam = bpy.data.cameras.new('cam'); cam.lens = lens
    if ortho: cam.type = 'ORTHO'; cam.ortho_scale = ortho
    o = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = o
    return o

def area_light(loc, target, size=3.0, energy=300, color='#ffffff', shape='DISK'):
    L = bpy.data.lights.new('L', 'AREA'); L.size = size; L.energy = energy; L.color = srgb(color)[:3]
    L.shape = shape
    o = bpy.data.objects.new('L', L); bpy.context.scene.collection.objects.link(o)
    o.location = loc; d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o

# ---- materials ---------------------------------------------------------------------------
class M:
    def __init__(self, name):
        self.m = bpy.data.materials.new(name); self.m.use_nodes = True
        self.t = self.m.node_tree; self.n = self.t.nodes; self.l = self.t.links
        self.p = self.n['Principled BSDF']
    def node(self, kind, **inputs):
        nd = self.n.new(kind)
        for k, v in inputs.items():
            if k.startswith('_'): setattr(nd, k[1:], v)
            else: nd.inputs[k.replace('_', ' ')].default_value = v
        return nd
    def link(self, a, b): self.l.new(a, b)
    def set(self, **kw):
        for k, v in kw.items(): self.p.inputs[k.replace('_', ' ')].default_value = v
        return self

def coord(mt, scale=(1, 1, 1), space='Object'):
    tc = mt.node('ShaderNodeTexCoord'); mp = mt.node('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = scale
    mt.link(tc.outputs[space], mp.inputs['Vector']); return mp.outputs['Vector']

def noise(mt, vec, scale=5, detail=6, rough=0.55, distortion=0):
    nz = mt.node('ShaderNodeTexNoise', Scale=scale, Detail=detail, Roughness=rough, Distortion=distortion)
    mt.link(vec, nz.inputs['Vector']); return nz

def math(mt, op, a, b=None, clamp=False):
    nd = mt.node('ShaderNodeMath', _operation=op); nd.use_clamp = clamp
    for i, v in enumerate([a, b]):
        if v is None: continue
        if isinstance(v, (int, float)): nd.inputs[i].default_value = v
        else: mt.link(v, nd.inputs[i])
    return nd.outputs[0]

def bump(mt, height, strength=0.3, distance=0.002, normal=None):
    b = mt.node('ShaderNodeBump', Strength=strength, Distance=distance)
    mt.link(height, b.inputs['Height'])
    if normal is not None: mt.link(normal, b.inputs['Normal'])
    return b.outputs['Normal']

def tint(mt, base_hex, var_hex, fac_socket):
    mix = mt.node('ShaderNodeMix', _data_type='RGBA')
    mix.inputs['A'].default_value = srgb(base_hex); mix.inputs['B'].default_value = srgb(var_hex)
    mt.link(fac_socket, mix.inputs['Factor']); return mix.outputs['Result']

def mat_paper(name, color='#EFE7D6', var='#E2D6BD', rough=0.8, fibre=0.25, sss=0.05, scale=1.0):
    mt = M(name); v = coord(mt, (scale, scale, scale))
    cloud = noise(mt, v, 6, 4, 0.5)
    mt.link(tint(mt, color, var, math(mt, 'MULTIPLY', cloud.outputs['Fac'], 0.55)), mt.p.inputs['Base Color'])
    # fibres: stretched fine noise
    vs = coord(mt, (scale * 220, scale * 40, scale * 220))
    f = noise(mt, vs, 1.0, 8, 0.65)
    g = noise(mt, coord(mt, (scale * 90, scale * 90, scale * 90)), 1, 6, 0.6)
    h = math(mt, 'ADD', f.outputs['Fac'], g.outputs['Fac'])
    mt.link(bump(mt, h, fibre, 0.0006), mt.p.inputs['Normal'])
    mt.set(Roughness=rough, Subsurface_Weight=sss)
    mt.p.inputs['Subsurface Radius'].default_value = (0.02, 0.015, 0.01)
    mt.p.inputs['Subsurface Scale'].default_value = 0.02
    return mt.m

def mat_cloth(name, color='#1E2A44', var='#26355A', density=35, strength=0.5, sheen=0.4, rough=0.9):
    """plain weave from two wave textures picked by a checker"""
    mt = M(name); v = coord(mt)
    wx = mt.node('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Scale=density, Distortion=0.6, Detail=1)
    wy = mt.node('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='Y', Scale=density, Distortion=0.6, Detail=1)
    mt.link(v, wx.inputs['Vector']); mt.link(v, wy.inputs['Vector'])
    ch = mt.node('ShaderNodeTexChecker', Scale=density * 20 / (2 * math_pi()))
    mt.link(v, ch.inputs['Vector'])
    pick = mt.node('ShaderNodeMix', _data_type='FLOAT')
    mt.link(ch.outputs['Fac'], pick.inputs['Factor'])
    mt.link(wx.outputs['Fac'], pick.inputs['A']); mt.link(wy.outputs['Fac'], pick.inputs['B'])
    slub = noise(mt, coord(mt, (40, 4, 40)), 3, 2, 0.5)
    h = math(mt, 'ADD', pick.outputs['Result'], math(mt, 'MULTIPLY', slub.outputs['Fac'], 0.4))
    mt.link(bump(mt, h, strength, 0.001), mt.p.inputs['Normal'])
    cloud = noise(mt, v, 4, 3, 0.5)
    mt.link(tint(mt, color, var, math(mt, 'MULTIPLY', math(mt, 'ADD', cloud.outputs['Fac'], pick.outputs['Result']), 0.35)), mt.p.inputs['Base Color'])
    mt.set(Roughness=rough, Sheen_Weight=sheen, Sheen_Roughness=0.4)
    mt.p.inputs['Sheen Tint'].default_value = srgb(var)
    return mt.m

def math_pi(): return 3.14159

def mat_thread(name, color='#ECE6D8', twist=180):
    mt = M(name); v = coord(mt)
    w = mt.node('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='DIAGONAL', Scale=twist, Distortion=0.2)
    mt.link(v, w.inputs['Vector'])
    mt.link(bump(mt, w.outputs['Fac'], 0.35, 0.0006), mt.p.inputs['Normal'])
    mt.set(Base_Color=srgb(color), Roughness=0.55, Sheen_Weight=0.6, Subsurface_Weight=0.1)
    return mt.m

def mat_solid(name, color, rough=0.5, coat=0.0, coat_rough=0.1, spec=0.5, sss=0.0, metallic=0.0, noise_var=None, nscale=8):
    mt = M(name)
    if noise_var:
        n = noise(mt, coord(mt), nscale, 4, 0.5)
        mt.link(tint(mt, color, noise_var, n.outputs['Fac']), mt.p.inputs['Base Color'])
    else:
        mt.set(Base_Color=srgb(color))
    mt.set(Roughness=rough, Coat_Weight=coat, Coat_Roughness=coat_rough, Metallic=metallic, Subsurface_Weight=sss)
    mt.p.inputs['Specular IOR Level'].default_value = spec
    return mt.m

def mat_pages(name, color='#EEE6D3', lines=120, axis='Z', dark='#C9BDA4'):
    """page block edge: many thin layers"""
    mt = M(name); v = coord(mt)
    w = mt.node('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction=axis, Scale=lines, Distortion=3.0, Detail=2, Detail_Scale=2)
    mt.link(v, w.inputs['Vector'])
    s = math(mt, 'POWER', w.outputs['Fac'], 2.0)
    mt.link(tint(mt, color, dark, math(mt, 'MULTIPLY', s, 0.85)), mt.p.inputs['Base Color'])
    mt.link(bump(mt, w.outputs['Fac'], 0.4, 0.0006), mt.p.inputs['Normal'])
    mt.set(Roughness=0.85, Subsurface_Weight=0.05)
    return mt.m

# ---- geometry ----------------------------------------------------------------------------
def box(name, size, loc, mat=None, bevel=0.0, segs=4, rot=(0, 0, 0), mats=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vtx in bm.verts: vtx.co = Vector((vtx.co.x * size[0], vtx.co.y * size[1], vtx.co.z * size[2]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    if bevel:
        b = o.modifiers.new('bv', 'BEVEL'); b.width = bevel; b.segments = segs; b.limit_method = 'ANGLE'
        b.harden_normals = False
    if mats:
        for m in mats: o.data.materials.append(m)
    elif mat: o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o

def plane(name, size, loc, mat, rot=(0, 0, 0)):
    return box(name, (size[0], size[1], 0.0001), loc, mat, rot=rot)

def tube(name, pts, radius, mat, res=8):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = radius; cu.bevel_resolution = res; cu.use_fill_caps = True
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts): p.co = (*c, 1)
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat); return o

def smooth_tube(name, pts, radius, mat, res=8):
    """bezier through points with auto handles: round wraps"""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = radius; cu.bevel_resolution = res; cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for p, c in zip(sp.bezier_points, pts):
        p.co = c; p.handle_left_type = p.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat); return o

def parent(children, par):
    for c in children: c.parent = par

def empty(name, loc=(0, 0, 0), rot=(0, 0, 0)):
    o = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot; return o

def render(out):
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
