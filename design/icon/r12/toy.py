"""helpers for the soft vinyl-toy renders (r12)"""
import bpy, math as _m
from mathutils import Vector
from bl import *

def vinyl(name, color, rough=0.45, sss=0.15, coat=0.25, sheen=0.0):
    mt = M(name)
    mt.set(Base_Color=srgb(color), Roughness=rough, Subsurface_Weight=sss, Coat_Weight=coat, Coat_Roughness=0.35, Sheen_Weight=sheen)
    mt.p.inputs['Subsurface Radius'].default_value = (0.3, 0.15, 0.1)
    mt.p.inputs['Subsurface Scale'].default_value = 0.05
    return mt.m

def gloss(name, color):
    mt = M(name); mt.set(Base_Color=srgb(color), Roughness=0.12, Coat_Weight=1.0, Coat_Roughness=0.03)
    return mt.m

def ball(name, loc, scale, mat, rot=(0, 0, 0), seg=64):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.active_object; o.name = name; o.scale = scale; o.rotation_euler = rot
    o.data.materials.append(mat); bpy.ops.object.shade_smooth(); return o

def blob(name, parts, mat, resolution=0.02, threshold=0.6):
    """metaball: parts = [(loc, radius, (sx,sy,sz) or None, type)]"""
    mb = bpy.data.metaballs.new(name); mb.resolution = resolution; mb.render_resolution = resolution * 0.5
    mb.threshold = threshold
    for loc, r, sc, kind in parts:
        e = mb.elements.new(); e.co = loc; e.radius = r
        if kind == 'ELLIPSOID':
            e.type = 'ELLIPSOID'; e.size_x, e.size_y, e.size_z = sc
        elif kind == 'NEG':
            e.use_negative = True
    o = bpy.data.objects.new(name, mb); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat); return o

def rbox(name, size, loc, mat, rot=(0, 0, 0), bevel=0.04, segs=6):
    return box(name, size, loc, mat, bevel=bevel, segs=segs, rot=rot)

def studio(bg='#F3E6D3', floor=None, key=900, fill=250, rim=300, key_pos=(-3, -3, 5), wstr=0.5, catcher=True):
    """seamless backdrop (floor + curved wall) and three soft lights"""
    floor = floor or bg
    m = mat_solid('backdrop', floor, rough=0.9, spec=0.2)
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0)); fl = bpy.context.active_object; fl.data.materials.append(m)
    import os
    mode = os.environ.get('TOY_PASS', 'catch')
    bpy.context.scene.render.film_transparent = True
    if mode == 'catch':
        fl.is_shadow_catcher = True
    else:                      # the toy alone, clean alpha; the floor still bounces light
        fl.visible_camera = False
    world(bg, wstr)
    area_light(key_pos, (0, 0, 0.6), size=5, energy=key, color='#FFF3E4')
    area_light((4, -3, 2.5), (0, 0, 0.6), size=5, energy=fill, color='#EAF0FF')
    area_light((2, 5, 4), (0, 0, 0.8), size=3, energy=rim, color='#FFFFFF')
