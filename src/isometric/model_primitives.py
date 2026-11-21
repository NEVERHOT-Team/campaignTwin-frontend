"""Shared Blender geometry for the market model and miniature shopper atlas."""
import math
import bmesh
import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
materials, geometries = {}, {}
pi = math.pi

def material(color):
    if color not in materials:
        mat = bpy.data.materials.new(color)
        mat.use_nodes = True
        rgb = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)]
        linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
        shader = mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = (*linear, 1)
        shader.inputs["Roughness"].default_value = .72
        mat.diffuse_color = (*linear, 1)
        materials[color] = mat
    return materials[color]

def place(mesh, name, xyz, color, rotation=(0, 0, 0)):
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.location = xyz
    obj.rotation_euler = rotation
    if not mesh.materials:
        mesh.materials.append(material(color))
    obj.material_slots[0].link = 'OBJECT'
    obj.material_slots[0].material = material(color)
    return obj

def box(name, x, y, z, w, d, h, color, bevel=.025, rotation=(0,0,0)):
    key = ('box', round(w,3), round(d,3), round(h,3), round(bevel,3))
    if key not in geometries:
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts:
            v.co.x *= w
            v.co.y *= d
            v.co.z *= h
        if bevel > .001:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(w,d,h)*.34), segments=2, affect='EDGES')
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        geometries[key] = mesh
    return place(geometries[key], name, (x,y,z), color, rotation)

def frustum(name, x, y, z, r1, r2, h, color, sides=16, rotation=(0,0,0)):
    key = ('ring', round(r1,3), round(r2,3), round(h,3), sides)
    if key not in geometries:
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides,
                              radius1=r1, radius2=r2, depth=h)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        geometries[key] = mesh
    return place(geometries[key], name, (x,y,z), color, rotation)

def oval(name, x, y, z, rx, ry, rz, color, fine=2):
    key = ('ico', fine)
    if key not in geometries:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=fine, radius=1)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        geometries[key] = mesh
    o = place(geometries[key], name, (x,y,z), color)
    o.scale = (rx,ry,rz)
    return o

def rod(name, a, b, radius, color, sides=10):
    delta = Vector(b) - Vector(a)
    c = (Vector(b) + Vector(a)) / 2
    obj = frustum(name,*c,radius,radius,delta.length,color,sides)
    obj.rotation_euler = delta.to_track_quat('Z','Y').to_euler()
    return obj
