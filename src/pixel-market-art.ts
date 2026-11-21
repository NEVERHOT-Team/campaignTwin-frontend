import { brandColors, type Brand } from './model'

export const marketWidth = 560
export const marketHeight = 350
export type Point = { x: number; y: number }
type Ink = CanvasRenderingContext2D
type Rect = [number, number, number, number]

function fill(c: Ink, color: string, ...rects: Rect[]) {
  c.fillStyle = color
  for (const [x,y,w,h] of rects) c.fillRect(x,y,w,h)
}

// Scanline octagons keep the illustration on its pixel grid even at the clipped corners.
function cut(c: Ink, x: number, y: number, w: number, h: number, corner: number, color: string) {
  c.fillStyle=color
  for(let row=0;row<h;row++){
    const inset=Math.max(0,corner-row,corner-(h-row-1))
    c.fillRect(x+inset,y+row,w-2*inset,1)
  }
}

function random(seed: number) {
  let state=seed>>>0
  return () => { state=(Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296 }
}

const palettes = {
  ours:   ['#345378','#487eb5','#78a8da','#bfd7e9'],
  market: ['#63506f','#8f72b0','#bba2d1','#e2d3e7'],
  rival:  ['#924e3c','#c96b4d','#e59370','#f3cfad'],
  waiting:['#526452','#748775','#a0ae8b','#dce0c7'],
} as const

function tree(c: Ink,x: number,y: number,scale=1) {
  c.save(); c.translate(x,y); c.scale(scale,scale)
  cut(c,-9,1,23,5,2,'#a89d7b')
  fill(c,'#685b45',[-2,-8,5,13]); fill(c,'#997a53',[-1,-5,2,9])
  cut(c,-12,-26,25,22,5,'#385c48')
  cut(c,-14,-22,26,15,4,'#416b50')
  cut(c,-11,-29,20,21,5,'#63865c')
  cut(c,-8,-28,15,10,3,'#86a06c')
  fill(c,'#a1ae79',[-6,-26,6,2],[-8,-23,3,2]); fill(c,'#72945e',[3,-17,5,2],[-9,-12,3,2])
  c.restore()
}

function bench(c: Ink,x: number,y: number) {
  fill(c,'#b5a88c',[x+1,y+6,19,4])
  fill(c,'#596356',[x+1,y+1,19,6],[x+3,y+6,2,3],[x+15,y+6,2,3])
  fill(c,'#a3754e',[x,y,19,2],[x,y+3,19,2]);fill(c,'#c79765',[x,y,18,1],[x,y+3,18,1])
}

function planter(c: Ink,x: number,y:number,w:number,seed:number) {
  cut(c,x+1,y+3,w,8,2,'#b7a98d');cut(c,x,y,w,8,2,'#898b70')
  cut(c,x+1,y-1,w-2,7,1,'#d2cfab');cut(c,x+3,y,w-6,4,1,'#758b63')
  const r=random(seed)
  for(let dx=5; dx<w-5; dx+=4) {
    const dy=Math.floor(r()*3)
    fill(c, '#5b8055',[x+dx,y-2+dy,3,3])
    fill(c, ['#e1b570','#c97d72','#e9d39a'][Math.floor(r()*3)],[x+dx+1,y-2+dy,2,2])
  }
}

function crate(c: Ink,x:number,y:number,w:number,h:number,goods:number) {
  fill(c,'#795c42',[x,y,w,h]);fill(c,'#b98c59',[x+1,y+1,w-2,h-2])
  fill(c,'#6d674b',[x+2,y+1,w-4,h-3])
  const tones=[['#cb7750','#e6aa68'],['#78904a','#a5ad66'],['#be7358','#df986a'],['#9182a0','#b0a3b8']][goods%4]
  for(let i=3;i<w-3;i+=3){
    fill(c,tones[0],[x+i,y+2,2,3]); fill(c,tones[1],[x+i,y+2,2,1])
  }
  fill(c,'#e1b87b',[x+1,y+h-2,w-2,1])
}

// Five-pixel capitals stay legible when the whole market is scaled on a phone.
const letters: Record<string, number[]> = {
  A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[14,17,16,16,16,17,14],
  D:[30,17,17,17,17,17,30],E:[31,16,16,30,16,16,31],I:[14,4,4,4,4,4,14],
  K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],M:[17,27,21,21,17,17,17],
  N:[17,25,25,21,19,19,17],O:[14,17,17,17,17,17,14],R:[30,17,17,30,20,18,17],
  S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],U:[17,17,17,17,17,17,14],
  Y:[17,17,10,4,4,4,4],
}
function signLetters(c:Ink,text:string,x:number,y:number) {
  const glyphs=text.toUpperCase().split('')
  let left=x-Math.floor((glyphs.length*6-1)/2)
  c.fillStyle='#314143'
  for(const letter of glyphs){
    letters[letter]?.forEach((line,row)=>{
      for(let col=0;col<5;col++)if(line & (16>>col))c.fillRect(left+col,y+row,1,1)
    })
    left+=6
  }
}

function shop(c:Ink,x:number,y:number,brand:Brand,label:string) {
  const [edge,cloth,lit,light]=palettes[brand]
  c.save();c.translate(x,y)
  // Shop origin is the left side of the stall and the top of its wall sign.
  cut(c,1,8,108,53,5,'#b6a88c')
  fill(c,'#706148',[4,8,96,48]);fill(c,'#edd7ac',[6,9,92,43])
  fill(c,'#cbad7f',[8,16,89,4],[9,31,88,17])
  fill(c,'#635742',[9,27,86,20]);fill(c,'#48605b',[13,30,33,15],[49,30,31,15])
  fill(c,'#728877',[15,32,19,2],[50,33,18,2]);fill(c,'#bcb99b',[15,36,24,1],[50,37,21,1])
  fill(c,'#a48560',[80,29,10,18]);fill(c,'#776449',[82,31,6,14])
  // The awning slopes toward the plaza and has individual scalloped fabric tabs.
  fill(c,edge,[3,15,96,2],[1,17,100,2],[-1,19,104,9],[-2,28,106,4])
  for(let i=0;i<10;i++){
    const left=i*10+1, colored=i%2===0
    const top=colored?lit:'#f8ecd4', body=colored?cloth:'#e7d9be', hem=colored?edge:'#bcab91'
    fill(c,top,[left+2,16,10,2],[left+1,18,10,2],[left,20,10,2])
    fill(c,body,[left-1,22,10,7]);fill(c,hem,[left-1,29,10,3],[left,32,8,1])
  }
  fill(c,'#806d50',[3,31,3,23],[96,31,3,23]);fill(c,'#c5a578',[4,32,1,20],[96,32,1,20])
  if(brand==='waiting'){
    fill(c,'#ded5b7',[12,45,79,4]);bench(c,22,41);bench(c,59,41)
    planter(c,5,52,19,8);planter(c,80,52,19,2)
  } else {
    fill(c,'#7e644d',[8,44,86,11]);fill(c,'#c59467',[9,46,84,7])
    for(let a=13;a<90;a+=11) fill(c,'#b08157',[a,47,1,6])
    fill(c,'#e8c495',[8,43,86,3]);fill(c,'#886d4e',[11,54,81,2])
    for(let i=0;i<4;i++)crate(c,13+i*16,39,13,7,i+(brand==='rival'?2:brand==='ours'?0:1))
    fill(c,'#4a544d',[81,37,9,6]); fill(c,'#c1d0b3',[82,38,5,3])
    crate(c,-6,48,12,8,2);crate(c,-2,55,12,7,1)
  }
  // Sign is mounted on the building so labels never obscure shoppers.
  const width=Math.max(60,label.length*6+10),left=Math.floor((101-width)/2)
  fill(c,edge,[left,-1,width,14]);fill(c,light,[left+1,0,width-2,11])
  fill(c,'#fff3d5',[left+2,0,width-4,1]);fill(c,cloth,[left+2,10,width-4,2])
  signLetters(c,label,50,2)
  // Crates and a chalkboard distinguish the vendors while the canopy carries the lane color.
  if(brand==='rival'){
    fill(c,'#80674c',[103,37,11,16],[101,52,3,7],[113,52,2,6])
    fill(c,'#46625a',[105,39,7,12]);fill(c,'#d9dbb9',[106,42,5,1],[106,45,4,1],[106,47,3,1])
  } else if(brand==='market'){
    crate(c,101,45,12,8,3);crate(c,101,51,13,8,2)
    fill(c,'#668058',[-8,36,4,10],[-11,39,4,5],[-5,37,4,4])
  } else if(brand==='ours'){
    fill(c,'#657c82',[103,46,10,12],[112,50,4,8]);fill(c,'#9eb6b0',[104,47,7,3],[104,52,7,2])
  }
  c.restore()
}

function fountain(c:Ink) {
  // A small point of orientation keeps the center passable on every route.
  cut(c,254,172,56,25,8,'#bfaf90')
  cut(c,252,164,56,26,8,'#8b9788');cut(c,252,162,56,25,8,'#ede1be')
  cut(c,255,164,50,21,7,'#c1bca0');cut(c,258,165,44,17,5,'#658f91')
  cut(c,259,165,42,15,5,'#80aeb1');fill(c,'#b1cdbe',[263,172,9,1],[286,176,10,1],[273,167,5,1])
  cut(c,269,168,22,10,3,'#668f8e');cut(c,272,165,16,9,3,'#97a997')
  fill(c,'#c4c6aa',[277,154,6,16]);fill(c,'#a4b39f',[281,153,3,16])
  cut(c,270,150,20,7,2,'#98ab99');cut(c,269,149,22,4,2,'#dcd7b7')
  fill(c,'#b3ccbf',[273,150,13,1],[279,143,2,6]);fill(c,'#dce3c8',[279,143,1,4])
}

export function marketBackdrop():HTMLCanvasElement {
  const image=document.createElement('canvas')
  image.width=marketWidth;image.height=marketHeight
  const c=image.getContext('2d')!
  const r=random(13071)
  fill(c,'#8ea276',[0,0,marketWidth,marketHeight])
  for(let i=0;i<2100;i++){
    const x=Math.floor(r()*marketWidth),y=Math.floor(r()*marketHeight)
    fill(c,i%3===0?'#a9b985':'#859b6e',[x,y,2,1])
  }
  // Granite edging, pale sandstone pavers and a band of setts around the square.
  cut(c,11,9,539,334,17,'#768b68');cut(c,10,7,539,334,17,'#afb295')
  cut(c,12,7,535,331,16,'#eddcc0');cut(c,14,9,531,327,15,'#d0c3a7')
  cut(c,18,13,523,319,12,'#e8d9bc')
  for(let row=0;row<34;row++) {
    const y=15+row*9
    for(let col=0;col<29;col++){
      const x=19+col*19+((row%2)*9)-9
      if(x<25||x>523||y<18||y>323)continue
      const chance=r()
      if(chance<.32)fill(c,'#e1d1b3',[x,y,13+Math.floor(r()*5),1])
      if(chance>.78)fill(c,'#f0e1c5',[x,y+1,9,1])
    }
  }
  for(let x=32;x<530;x+=17) {
    fill(c,'#bcbaa0',[x,9,1,4],[x+5,333,1,4])
  }
  for(let y=30;y<325;y+=16)fill(c,'#bcbaa0',[13,y,4,1],[541,y+5,4,1])
  // Central crosswalks are made of a warmer inlaid stone.
  fill(c,'#d9c7a8',[16,186,527,1],[16,195,527,1])
  for(let x=20;x<541;x+=13)fill(c,'#deccb0',[x,189,8,1],[x+4,192,6,1])
  for(const x of [223,334]){
    fill(c,'#d6c5a8',[x,14,1,318]);fill(c,'#f2e3c5',[x+1,14,1,318])
  }
  planter(c,169,49,27,13);planter(c,368,49,25,17)
  planter(c,242,31,72,5);bench(c,255,40);bench(c,286,40)
  tree(c,208,40);tree(c,353,38)
  // A short string of cloth pennants spans the rear garden.
  fill(c,'#7d795f',[233,16,2,24],[325,16,2,24])
  for(let i=0;i<93;i++){
    const y=17+Math.round(5*Math.sin(Math.PI*i/92))
    fill(c,'#8a8b72',[234+i,y,1,1])
    if(i>3 && i<88 && i%12===0){
      const color=['#a6b4a0','#d39c76','#b9a4b2'][(i/12)%3]
      fill(c,color,[234+i,y+1,5,2],[235+i,y+3,3,2],[236+i,y+5,1,1])
    }
  }
  tree(c,10,72);tree(c,549,77);tree(c,13,252);tree(c,548,251)
  shop(c,45,27,'ours','Your brand')
  shop(c,410,27,'rival','Discounter')
  shop(c,45,220,'market','Market lane')
  shop(c,410,220,'waiting','Undecided')
  fountain(c)
  planter(c,220,248,18,11);planter(c,322,248,18,3)
  bench(c,252,254);bench(c,290,254)
  tree(c,14,336);tree(c,547,334)
  fill(c,'#c1b496',[15,338,531,2])
  // The perimeter wall opens onto the lower, central entrance.
  for(const x of [27,52,77,102,127,152,177,202,227,312,337,362,387,412,437,462,487,512]){
    fill(c,'#8c927a',[x,336,25,3],[x,332,3,7])
    fill(c,'#d6cfad',[x,332,3,2],[x+3,335,22,1])
  }
  return image
}

const avatarW=14, avatarH=17, variations=16, poses=3
const groups:Brand[]=['ours','rival','market','waiting']

/** One small atlas keeps a busy square to a single image blit per shopper per frame. */
export function shopperAtlas() {
  const image=document.createElement('canvas')
  image.width=variations*poses*avatarW;image.height=groups.length*avatarH
  const c=image.getContext('2d')!
  groups.forEach((brand,row)=>{
    for(let v=0;v<variations;v++)for(let step=0;step<poses;step++){
      c.save();c.translate((v*poses+step)*avatarW,row*avatarH)
      const skin=['#efc198','#dba67d','#bb825c','#95684e'][v%4]
      const hair=['#473d36','#624939','#7b5c44','#4c4841'][(v>>2)%4]
      const coat=brandColors[brand], edge=palettes[brand][0], back=step===2?1:0
      fill(c,'#b6a68b',[2,14,9,2],[4,13,8,2])
      c.translate(0,back)
      fill(c,'#3c4444',[4,10,5,3],[4-(step===1?1:0),12,2,2],[8,12,2,step===2?1:2])
      fill(c,edge,[3,6,7,5],[2,7,1,3],[10,7,1,3])
      fill(c,coat,[4,6,5,4],[3,7,2,2],[8,7,2,2])
      fill(c,skin,[3,9,1,2],[10,9,1,2],[5,3,4,3])
      fill(c,hair,[4,1,5,1],[4,2,6,2],[4,3,1,2])
      if(v%4===0)fill(c,hair,[3,3,1,3],[3,5,2,1])
      if(v%4===2)fill(c,palettes[brand][0],[4,1,5,2],[3,3,7,1])
      if(v%5===0)fill(c,'#bc8e56',[9,8,1,2],[9,10,3,2])
      c.restore()
    }
  })
  return (context:Ink,brand:Brand,variant:number,step:number,point:Point)=>{
    context.drawImage(image,(variant%variations*poses+step)*avatarW,groups.indexOf(brand)*avatarH,avatarW,avatarH,
      Math.round(point.x)-7,Math.round(point.y)-15,avatarW,avatarH)
  }
}
