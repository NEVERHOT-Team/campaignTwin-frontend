"""Rebuild the two orthographic market plates with Blender 4.3+ in background mode.

    blender -b -t 4 -P src/isometric/build_market.py
    blender -b -t 4 -P src/isometric/build_shoppers.py
    python3 src/isometric/pack_market.py

Set MARKET_BLEND to an absolute .blend path to export the editable two-camera model.
To include the cast, first run build_shoppers with MARKET_CAST_BLEND set to a .blend
path, then supply that same variable when running build_market.

All sample positions use the same world coordinates as the modeled plaza. Camera
axes and depth plates let the browser place and occlude animated shoppers without
a WebGL context. Geometry and artwork are original to CampaignTwin.
"""
import json
import math
import os
import random
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

root = Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path.insert(0, str(root))
from model_primitives import box, frustum, material, oval, pi, rod, scene

output = Path(os.environ.get("MARKET_RENDER_DIR", "/tmp/campaigntwin-market-render"))
output.mkdir(exist_ok=True, parents=True)
rng = random.Random(311)

def plaque(word, x, y, z, scale, color):
    font = bpy.data.curves.new(word, 'FONT')
    font.body = word
    font.align_x, font.align_y = 'CENTER', 'CENTER'
    font.size = scale
    font.extrude = .006
    font.space_character = 1.03
    obj = bpy.data.objects.new(word, font)
    scene.collection.objects.link(obj)
    obj.location, obj.rotation_euler = (x,y,z), (pi/2,0,0)
    font.materials.append(material(color))

def planter(x,y,w,d):
    box('stone planter',x,y,.13,w,d,.26,'C5AC87',.08)
    box('dark soil',x,y,.27,w-.1,d-.1,.055,'665942')
    for i in range(max(3,int(w*d*7))):
        xx = x+rng.uniform(-.4,.4)*w
        yy = y+rng.uniform(-.36,.36)*d
        r = rng.uniform(.11,.21)
        oval('ground cover',xx,yy,.31+r*.32,r,r*.8,r*.65,rng.choice(['65885C','88A66A','A5AF67']),1)

def tree(x,y,size):
    planter(x,y,1.38*size,1.15*size)
    h = 1.55*size
    frustum('tree trunk',x,y,h*.55,.13*size,.075*size,h,'816043',8)
    for i in range(6):
        angle = i*2.4
        offset = (.43 if i else .12)*size
        dx,dy = math.cos(angle)*offset,math.sin(angle)*offset
        z = h+size*(.45+.5*(i%3)/3)
        rod('branch',(x,y,h*.67),(x+dx,y+dy,z),.055*size,'7A5A43')
        oval('trimmed tree canopy',x+dx,y+dy,z,.61*size,.58*size,size*.68,
             ['638668','84A16C','94AE77','769666','A5B87A','719476'][i],2)

def lamp(x,y):
    frustum('lamp foot',x,y,.08,.19,.16,.16,'425B59',12)
    frustum('lamp mast',x,y,.94,.077,.049,1.72,'48615C',12)
    frustum('brass collar',x,y,1.57,.096,.096,.09,'D2A766',12)
    frustum('lantern foot',x,y,1.83,.14,.19,.13,'3F5555',4,(0,0,pi/4))
    frustum('opal lantern',x,y,2.03,.18,.22,.31,'FFE7B0',4,(0,0,pi/4))
    frustum('lantern cap',x,y,2.26,.29,.065,.19,'48635E',4,(0,0,pi/4))
    oval('finial',x,y,2.4,.05,.05,.07,'AE8F58')

def bench(x,y,w):
    for a in (-.37,.37):
        box('bench foot',x+w*a,y,.19,.11,.43,.34,'526761')
    for i in range(3):
        box('bench seat slat',x,y+(i-1)*.14,.39,w,.11,.084,'AA754F')
    for a in (-.37,.37):
        box('bench upright',x+w*a,y+.18,.55,.07,.07,.5,'526761')
    box('bench back',x,y+.18,.72,w,.09,.18,'BD8A60')

def window(x,y,z,w,h):
    box('window frame',x,y,z,w+.13,.12,h+.13,'EBD5AF')
    box('recessed glass',x,y-.067,z,w,.045,h,'40676F')
    box('glass reflection',x-w*.23,y-.097,z+.01,w*.35,.012,h*.92,'638B8A',.003)
    box('window mullion',x,y-.11,z,.059,.05,h,'E9D4B0')
    box('window transom',x,y-.11,z+h*.17,w,.05,.051,'E9D4B0')
    box('stone sill',x,y-.12,z-h*.5-.06,w+.24,.26,.13,'D5B99B')

def canopy(x,y,z,w,d,color):
    n = 11
    for i in range(n):
        tint = color if i%2==0 else 'FFE8BA'
        xx=x+(i-(n-1)/2)*w/n
        box('canvas stripe',xx,y,z,w/n+.003,d,.095,tint,.018,(.20,0,0))
        box('folded valance',xx,y-d*.5+.04,z-d*.1-.07,w/n+.004,.08,.18,tint,.035)
    for dx in (-w*.43,w*.43):
        rod('awning stay',(x+dx,y+d*.4,z-.6),(x+dx,y-d*.43,z-.13),.038,'AA8A62')

def roof(x,y,z,w,d,rise,tile,accent):
    angle=math.atan2(rise,d*.5)
    length=math.hypot(d*.5,rise)
    for side in (-1,1):
        slant=(-side*angle,0,0)
        box('folded roof',x,y+side*d*.25,z+rise*.5,w,length+.10,.18,tile,.055,slant)
        for i in range(11):
            xx=x+(i-5)*w/10
            box('standing roof seam',xx,y+side*d*.25,z+rise*.5+.10,.035,length,.045,accent,.014,slant)
    rod('ridge cap',(x-w/2,y,z+rise+.09),(x+w/2,y,z+rise+.09),.105,accent,12)
    for sy in (-1,1):
        box('painted fascia',x,y+sy*d*.51,z-.05,w,.12,.19,accent)

def crate(x,y,z,w,d,produce,index):
    box('produce tray',x,y,z,w,d,.16,'A0754F')
    for sx in (-1,1):
        box('crate lip',x+sx*w*.48,y,z+.105,.055,d,.13,'D19C66')
    for sy in (-1,1):
        box('crate lip',x,y+sy*d*.48,z+.105,w,.055,.13,'D19C66')
    for i in range(5):
        for j in range(2):
            xx=x+(i-2)*w*.165+rng.uniform(-.015,.015)
            yy=y+(j-.5)*d*.40
            oval('market produce',xx,yy,z+.134,.083,.082,.10 if index%2 else .082,produce,1)

def shop(x,y,w,d,our):
    wall='E1D1AC' if our else 'E3A27C'
    trim='765B35' if our else '974B3B'
    roofColor='C69A53' if our else 'C87553'
    h=2.70 if our else 2.52
    front=y-d/2
    box('shop footing',x,y,.10,w+.22,d+.22,.2,'BFA58A',.07)
    box('rendered shop walls',x,y,h*.5+.15,w,d,h,wall,.065)
    for sx in (-1,1):
        for sy in (-1,1):
            box('corner pier',x+sx*(w/2-.1),y+sy*(d/2-.097),h*.51+.13,.18,.18,h,'EAD7B3')
    box('painted shop base',x,y,.38,w+.025,d+.025,.31,trim)
    if our:
        # A glazed ridge lantern gives the market hall a recognisable silhouette.
        roof(x,y,h+.20,w+.46,d+.49,.91,roofColor,'8E6D3E')
        box('clerestory body',x-.5,y,h+1.01,1.52,.69,.63,'E0CDA7')
        window(x-.5,y-.35,h+1.02,1.25,.32)
        roof(x-.5,y,h+1.34,1.82,.99,.34,'CAA866','8C7044')
        box('chimney base',x+w*.35,y+.47,h+.91,.43,.4,.75,'B79076')
        box('chimney coping',x+w*.35,y+.47,h+1.29,.52,.50,.13,'DFC4A0')
    else:
        # Stepped Mediterranean parapet and terracotta tiled roof.
        roof(x,y,h+.13,w+.32,d+.38,.52,roofColor,'AD6045')
        for group in (-1,1):
            for j in range(3):
                box('stepped parapet',x+group*(w/2+.005),y,h+.13+j*.14,.17,d*(1-j*.24),.16,'D6906C')
        box('roof vent',x+w*.30,y+.2,h+.65,.58,.52,.6,'DED0AC')
        frustum('vent hood',x+w*.30,y+.2,h+1,.41,.27,.15,'8D7764',4,(0,0,pi/4))
    for i in (-1,1):
        window(x+i*w*.31,front-.018,1.25,w*.25,1.16)
    box('shop doorway',x,front-.055,1.06,.72,.17,1.92,trim)
    box('door glass',x,front-.15,1.31,.53,.035,.96,'648584')
    box('door panel',x,front-.15,.51,.49,.035,.40,roofColor)
    oval('brass doorknob',x+.23,front-.2,.99,.04,.04,.04,'E6B875')
    box('shop name board',x,front-.26,h-.04,w-.18,.22,.46,trim)
    plaque('YOUR BRAND' if our else 'DISCOUNTER',x,front-.38,h-.033,.32,'FFF0C9')
    canopy(x,front-.48,1.93,w+.12,1.00,roofColor)
    for i in range(3):
        sx=x+(i-1)*w*.28
        if i==1: continue
        box('display table',sx,front-.44,.37,.95,.44,.64,'A7815C',.045)
        crate(sx,front-.47,.72,.93,.48,['E9A54F','9EB46B','CB7050'][i],i)
    # Painted window trim and vertical siding on the side visible to the camera.
    for side in (-1,1):
        xx=x+side*w*.501
        for j in range(3):
            yy=y+(j-1)*d*.27
            box('side glass',xx,yy,1.43,.06,.49,.88,trim)
            box('side reflection',xx+side*.035,yy-.10,1.45,.025,.19,.72,'759592')
            box('window lintel',xx,yy,1.90,.13,.6,.09,'E7CDA6')
        box('side cornice',xx,y,2.08,.13,d,.12,'ECCFA6')

def pavilion(x,y,waiting):
    w,d=(3.12,1.58) if waiting else (2.86,1.62)
    color='799D86' if waiting else '997FA8'
    edge='496D61' if waiting else '70597B'
    box('pavilion plinth',x,y,.1,w+.20,d+.25,.2,'C6AE8E',.07)
    for sx in (-1,1):
        for sy in (-1,1):
            xx,yy=x+sx*(w/2-.16),y+sy*(d/2-.15)
            box('painted pavilion post',xx,yy,.99,.13,.13,1.88,edge)
            box('column base',xx,yy,.25,.22,.22,.20,'D7BCA0')
    roof(x,y,1.95,w+.36,d+.39,.65,color,edge)
    if waiting:
        bench(x,y+.13,w*.71)
        box('station sign',x,y-d*.5-.23,1.72,w*.76,.12,.32,edge)
        plaque('UNDECIDED',x,y-d*.5-.302,1.73,.21,'FFEAC7')
        box('timetable frame',x+w*.32,y+.44,1.14,.50,.09,.78,'836D53')
        box('timetable',x+w*.32,y+.38,1.14,.38,.04,.65,'E4D7B4')
        for j in range(3):
            box('schedule rule',x+w*.32,y+.35,1.30-j*.12,.25,.016,.025,'728980')
    else:
        box('flower counter',x,y-.32,.55,w-.12,.65,.91,'AB865F')
        for i in range(14):
            box('counter planks',x+(i-6.5)*.183,y-.66,.54,.12,.055,.78,'C8996A')
        box('counter top',x,y-.35,1.04,w,.77,.12,'E3B984')
        for i in range(5):
            xx,yy=x+(i-2)*.48,y-.30
            frustum('florist bucket',xx,yy,1.28,.13,.19,.43,'728F8C',12)
            for j in range(7):
                fx,fy=xx+rng.uniform(-.20,.20),yy+rng.uniform(-.16,.16)
                z=1.64+rng.uniform(-.11,.16)
                rod('flower stem',(xx,yy,1.31),(fx,fy,z),.012,'61885A',5)
                oval('flower petals',fx,fy,z,.083,.082,.064,['CC7F75','F6C364','ECE0AC','C68BA0','D9AC6E'][i],1)
        box('market sign',x,y-d*.5-.24,1.72,w*.8,.115,.32,edge)
        plaque('MARKET LANE',x,y-d*.5-.308,1.73,.21,'FFEAC7')

def fountain():
    for rad,z,h,col in [(1.18,.03,.06,'AC8D6E'),(1.08,.10,.10,'E5CCAA'),(.92,.21,.19,'7B9C95'),(.98,.33,.11,'E2D2AE'),(.85,.385,.018,'499DA8')]:
        frustum('octagonal fountain',0,.35,z,rad,rad,h,col,12)
    frustum('fountain pedestal',0,.35,.58,.22,.13,.42,'A1ADA2',12)
    frustum('fountain bowl',0,.35,.86,.27,.55,.20,'C8CDB9',16)
    frustum('bowl water',0,.35,.973,.46,.46,.02,'6BB8BE',16)
    frustum('jet pedestal',0,.35,1.09,.13,.07,.22,'99AFA4',12)
    oval('water at the jet',0,.35,1.36,.067,.067,.23,'C5DFCC')
    for i in range(6):
        a=i*2*pi/6+.2
        path=[]
        for j in range(9):
            f=j/8
            radius=.35+.39*f
            path.append((math.cos(a)*radius,.35+math.sin(a)*radius,.94+.36*f-.90*f*f))
        for left,right in zip(path[:-1],path[1:]):
            rod('fountain stream',left,right,.018,'BEDBD5',6)
    for i in range(8):
        a=i*pi/4
        r=.62
        oval('foam on the water',math.cos(a)*r,.35+math.sin(a)*r,.40,.092,.038,.015,'C2D9BF',2)

def bicycle(x,y):
    for dx in (-.34,.34):
        bpy.ops.mesh.primitive_torus_add(major_segments=18,minor_segments=6,location=(x+dx,y,.33),
            major_radius=.27,minor_radius=.031,rotation=(pi/2,0,0))
        wheel=bpy.context.object
        wheel.name='bicycle wheel'
        wheel.data.materials.append(material('4B5F5B'))
        for angle in (0,pi/3,2*pi/3):
            dx1,dz1=.25*math.cos(angle),.25*math.sin(angle)
            rod('spoke',(x+dx-dx1,y,.33-dz1),(x+dx+dx1,y,.33+dz1),.009,'9BA89A',6)
    for a,b in [((-.34,.33),(-.13,.65)),((-.13,.65),(.09,.32)),((.09,.32),(-.34,.33)),((-.13,.65),(.25,.66)),((.09,.32),(.25,.66)),((.25,.66),(.34,.33))]:
        rod('bicycle frame',(x+a[0],y,a[1]),(x+b[0],y,b[1]),.028,'BD7357')
    box('saddle',x-.14,y,.73,.19,.10,.065,'705944')
    box('handlebars',x+.25,y,.73,.07,.25,.05,'546864')

# Each modeled site has its own collection for selecting or recoloring the asset in Blender.
def collect_new(label):
    collection=bpy.data.collections.new(label)
    scene.collection.children.link(collection)
    for obj in list(scene.collection.objects):
        collection.objects.link(obj)
        scene.collection.objects.unlink(obj)

# Cutaway foundation, limestone paving and hand-set edge courses.
box('studio sweep',0,0,-1.06,200,200,.20,'718A91',0)
box('slate base',0,0,-.56,17.45,10.62,.77,'71867F',.18)
box('brass reveal',0,0,-.30,17.52,10.67,.065,'BEA175',.022)
box('cut stone fascia',0,0,-.16,17.55,10.70,.28,'C1AB8D',.12)
box('paved surface',0,0,-.044,17.47,10.62,.085,'C2AF92',.045)
for row in range(13):
    cols=19 if row%2==0 else 20
    width=17.26/19
    for col in range(cols):
        start=max(0,(col-(.5 if row%2 else 0))*width)
        end=min(17.26,(col+1-(.5 if row%2 else 0))*width)
        x=-8.63+(start+end)*.5
        box('honed paving',x,-4.85+row*.807,.009,end-start-.017,.790,.037,
            rng.choice(['DCCDAD','DFCFB1','DDCEAF','E2D2B5','D9CAAC']),.011)
for side in (-1,1):
    for col in range(23):
        box('front curb',-.5*16.94+col*.77,side*5.19,.07,.75,.17,.14,'D7C4A1')
    for row in range(13):
        box('side curb',side*8.58,-4.68+row*.78,.071,.17,.76,.14,'D7C4A1')
for y in (-1.82,1.86):
    for j in range(36):
        box('brick course',-8.23+j*.47,y,.032,.45,.115,.035,'C9A483',.008)
for x in (-2.40,2.40):
    for j in range(21):
        box('cross street inlay',x,-4.8+j*.48,.034,.10,.455,.034,'C6A384',.008)
collect_new('01 · Plaza paving and foundation')
shop(-4.02,3.12,4.55,2.40,True)
collect_new('02 · Your brand market hall')
shop(4.18,3.15,3.93,2.10,False)
collect_new('03 · Discounter shop')
pavilion(-6.27,-2.51,False)
collect_new('04 · Market lane florist')
pavilion(6.47,-2.76,True)
collect_new('05 · Undecided pavilion')
fountain()
collect_new('06 · Fountain')
for x,y,s in [(-7.42,3.83,.93),(-1.19,4.46,.70),(1.24,4.38,.74),(7.55,3.97,1.10),
               (-8.00,-.27,.68),(8.00,.11,.69)]:
    tree(x,y,s)
for x,y in [(-.96,-4.32),(1.03,-4.32)]:
    bench(x,y,1.42)
for x,y in [(-4.30,-4.70),(4.34,-4.73),(-.83,2.86)]:
    lamp(x,y)
for x,y,w,d in [(0,-4.84,2.9,.41),(-7.00,1.85,1.89,.45),(7.10,1.90,1.83,.46)]:
    planter(x,y,w,d)
bicycle(3.30,-4.72)
# A catenary of market lights spans the two permanent shops.
points=[]
for i in range(19):
    t=i/18
    xx=-2.14+4.54*t
    yy=1.65+.22*t
    zz=3.12-.48*4*t*(1-t)
    points.append((xx,yy,zz))
    if i%2:
        rod('pendant cord',(xx,yy,zz),(xx,yy,zz-.095),.015,'3E514F',6)
        oval('opal festival bulb',xx,yy,zz-.15,.05,.05,.069,'F6D58F')
for a,b in zip(points[:-1],points[1:]):
    rod('overhead market string',a,b,.014,'4C625C',6)
for xx,yy,zz in (points[0],points[-1]):
    rod('string anchor',(xx,yy,.12),(xx,yy,zz+.07),.043,'685F50')
# Low cast-iron bollards at the entries leave the circulation lanes open.
for x in (-8.12,8.12):
    for y in (-4.70,-4.18):
        frustum('bollard',x,y,.26,.105,.074,.48,'5A706B',10)
        oval('bollard cap',x,y,.51,.09,.09,.055,'CAB189')

collect_new('07 · Landscape and street furniture')

# Soft directional studio lighting makes the model read at mobile scale.
scene.world=bpy.data.worlds.new('overcast skylight')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.82,.9,1,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.38
def area(name,loc,power,color,size):
    data=bpy.data.lights.new(name,'AREA')
    data.energy,data.color,data.shape,data.size=power,color,'DISK',size
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=loc
    obj.rotation_euler=(-Vector(loc)).to_track_quat('-Z','Y').to_euler()
area('late sun',(-7,-9,16),3400,(1,.89,.73),8)
area('sky bounce',(8,-3,10),1400,(.72,.86,1),11)
area('rim',(-3,11,10),2100,(1,.91,.73),8)
cam=bpy.data.objects.new('Orthographic study camera',bpy.data.cameras.new('Ortho'))
scene.collection.objects.link(cam)
scene.camera=cam
cam.data.type='ORTHO'
cam.data.ortho_scale=22.7
scene.render.engine='CYCLES'
scene.cycles.samples=int(os.environ.get('MARKET_SAMPLES',80))
scene.cycles.use_denoising=False
scene.cycles.max_bounces=4
scene.render.resolution_x=1360
scene.render.resolution_y=850
scene.render.resolution_percentage=int(os.environ.get('MARKET_SIZE',100))
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.film_transparent=False
# Mist is antialiased and linear in orthographic camera space. The PNG receives raw data.
scene.world.mist_settings.start=20
scene.world.mist_settings.depth=38
scene.world.mist_settings.falloff='LINEAR'
scene.view_layers[0].use_pass_mist=True
scene.use_nodes=True
nodes=scene.node_tree.nodes
nodes.clear()
layer=nodes.new('CompositorNodeRLayers')
result=nodes.new('CompositorNodeComposite')
scene.node_tree.links.new(layer.outputs['Image'],result.inputs[0])
depth=nodes.new('CompositorNodeOutputFile')
depth.base_path=str(output)
depth.format.file_format='PNG'
depth.format.color_mode='BW'
depth.format.color_depth='8'
depth.format.color_management='OVERRIDE'
depth.format.view_settings.view_transform='Raw'
scene.node_tree.links.new(layer.outputs['Mist'],depth.inputs[0])
cameras={}
model_views={}
for name,location in [('east',(16,-24,20.7)),('west',(-16,-24,20.7))]:
    target=Vector((0,0,.86))
    cam.location=target+Vector(location)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.view_layer.update()
    view=cam.copy()
    view.name='Market · '+name.title()+' view'
    scene.collection.objects.link(view)
    model_views[name]=view
    def project(p):
        coord=world_to_camera_view(scene,cam,Vector(p))
        return [round(coord.x,7),round(1-coord.y,7),round(coord.z,5)]
    cameras[name]={'origin':project((0,0,0)),'x':project((1,0,0)),'y':project((0,1,0)),'z':project((0,0,1))}
    depth.file_slots[0].path=name+'-depth'
    scene.render.filepath=str(output/(name+'.png'))
    if name in os.environ.get('MARKET_ANGLES','east west').split():
        bpy.ops.render.render(write_still=True)
(output/'projection.json').write_text(json.dumps(cameras,indent=2)+'\n')

if os.environ.get('MARKET_BLEND'):
    scene.camera=model_views['east']
    bpy.data.objects.remove(cam,do_unlink=True)
    depth.base_path='//renders/'
    scene.render.filepath='//renders/market.png'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.shading.color_type='MATERIAL'
    scene.name='Market square'
    cast=os.environ.get('MARKET_CAST_BLEND')
    collect_new('08 · Studio lights and cameras')
    if cast:
        with bpy.data.libraries.load(cast,link=False) as (source,destination):
            destination.scenes=['Shopper miniatures']
        bpy.data.scenes['Shopper miniatures'].use_fake_user=True
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=os.environ['MARKET_BLEND'],compress=True)
