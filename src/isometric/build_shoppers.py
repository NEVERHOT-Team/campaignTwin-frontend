"""Render the shopper animation atlas. Run with blender -b -P src/isometric/build_shoppers.py."""
import os
import sys
from math import sin
from pathlib import Path

import bpy
from mathutils import Vector
sys.dont_write_bytecode=True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_primitives import box, frustum, oval, scene

out=Path(os.environ.get("MARKET_RENDER_DIR","/tmp/campaigntwin-market-render"))
out.mkdir(exist_ok=True,parents=True)
colors=['E2AD46','F58A66','B59AF2','B2B9AD']
complexions=[('DDA47D','53382F','384852'),('AD7352','332B2C','4F5960'),('ECC19B','77513A','42535C')]
cam=bpy.data.objects.new('portrait camera',bpy.data.cameras.new('Orthographic portrait'))
scene.collection.objects.link(cam)
scene.camera=cam
cam.data.type='ORTHO'
at=Vector((2.5,-8.5,4.5))
cam.location=at.normalized()*22
cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler()
right=cam.rotation_euler.to_matrix() @ Vector((1,0,0))
up=cam.rotation_euler.to_matrix() @ Vector((0,1,0))
cam.data.ortho_scale=12
# Twelve columns of wardrobe variants, three rows for standing and two strides.
# Floor anchor lies at 82% of cell height.
for i in range(12):
    tone,hair,pants=complexions[i%3]
    coat=colors[i//3]
    for step in range(3):
        anchor=right*(i-5.5) + up*(1-step-.32)
        x,y,z=anchor
        stride=(0,.070,-.070)[step]
        for n,dx in enumerate((-.079,.079)):
            front=stride*(1 if n else -1)
            box('trouser leg',x+dx,y+front,z+.166,.122,.15,.23,pants,.046)
            box('leather shoe',x+dx,y-.028+front,z+.055,.133,.20,.101,'51463F',.031)
            box('shoe sole',x+dx,y-.03+front,z+.024,.137,.205,.032,'C9BDA5',.015)
        box('jacket',x,y,z+.378,.330,.239,.32,coat,.089)
        for n,dx in enumerate((-.191,.191)):
            dy=-stride*.76*(1 if n else -1)
            oval('sleeve',x+dx,y+dy,z+.385,.068,.08,.126,coat)
            oval('hand',x+dx,y+dy-.014,z+.293,.055,.063,.069,tone)
        oval('neck',x,y,z+.511,.098,.095,.087,tone)
        oval('face',x,y-.004,z+.638,.169,.148,.167,tone,3)
        oval('hair',x,y+.026,z+.713,.17,.154,.112,hair,2)
        if i%3==0:
            oval('cap crown',x,y,z+.741,.182,.163,.092,'E1BC78')
            oval('cap peak',x,y-.129,z+.726,.15,.108,.026,'BC985A')
        elif i%3==1:
            oval('gathered hair',x+.035,y+.137,z+.70,.104,.088,.108,hair)
            box('satchel',x-.205,y+.09,z+.282,.105,.131,.124,'D1A674',.035)
        else:
            oval('fringe',x-.091,y-.083,z+.705,.105,.072,.072,hair)
        for dx in (-.060,.060):
            oval('eye',x+dx,y-.141,z+.646,.012,.013,.012,'443A33',1)
        oval('nose',x,y-.15,z+.617,.033,.029,.030,tone,2)

scene.world=bpy.data.worlds.new('sky')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.9,.94,1,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.75
sun=bpy.data.lights.new('studio key','SUN')
sun.energy=2.7
sun.color=(1,.91,.8)
key=bpy.data.objects.new('studio key',sun)
scene.collection.objects.link(key)
key.rotation_euler=Vector((4,5,-8)).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES'
scene.cycles.samples=36
scene.cycles.use_denoising=False
scene.render.resolution_x=960
scene.render.resolution_y=240
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=str(out/'shoppers.png')
bpy.ops.render.render(write_still=True)

# Keep the full modeled cast in the native deliverable as a second scene.
if os.environ.get('MARKET_CAST_BLEND'):
    scene.name='Shopper miniatures'
    scene.render.filepath='//renders/shoppers.png'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=os.environ['MARKET_CAST_BLEND'],compress=True)
