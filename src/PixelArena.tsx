import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { Agent, Brand } from './model'
import { marketBackdrop, marketHeight, marketWidth, shopperAtlas, type Point } from './pixel-market-art'

type Props = {
  agents: Agent[]; ghosts?: Agent[]; selected: string|null
  onSelect: (id:string)=>void; day:number; playing:boolean
}
type Rect = [left:number, top:number, right:number, bottom:number]
type Walker = { id:string; brand:Brand; seed:number; points:Point[]; lengths:number[]; distance:number; began:number; duration:number }
type Position = Point & {id:string; brand:Brand; seed:number; step:number}
const groups:Brand[]=['ours','rival','market','waiting']
const noAgents:Agent[]=[]
const booths:Rect[]=[
  [32,15,158,99],[397,15,521,99],[32,208,158,292],[397,208,521,292],
  [248,144,310,200],[216,246,240,261],[319,246,342,261],[247,251,312,268],
]
const forecourts:Record<Brand,Rect[]>={
  ours:[[28,106,218,182],[224,109,252,141]],rival:[[342,106,532,182],[307,111,334,143]],
  market:[[29,298,214,327],[161,209,216,295],[217,207,254,236]],
  waiting:[[346,298,531,327],[344,209,396,296],[349,198,510,207]],
}
const distance=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y)
const inside=(p:Point,[l,t,r,b]:Rect)=>p.x>=l && p.x<=r && p.y>=t && p.y<=b
const cap=(value:number,low:number,high:number)=>Math.min(high,Math.max(low,value))

function hash(text:string) {
  let seed=2166136261
  for(const char of text) seed=Math.imul(seed^char.charCodeAt(0),16777619)
  seed=Math.imul(seed^(seed>>>16),0x85ebca6b)
  return (seed^(seed>>>13))>>>0
}
function grid(brand:Brand,gap:number) {
  const points:Point[]=[]
  for(const [l,t,r,b] of forecourts[brand]) {
    let row=0
    for(let y=t;y<=b;y+=gap+1,row++){
      for(let x=l+(row%2)*gap/2;x<=r;x+=gap){
        const seed=hash(x+'|'+y)
        const p={x:x+((seed>>>9)%7-3)*.5,y:y+((seed>>>19)%7-3)*.5}
        if(!booths.some(box=>inside(p,box)))points.push(p)
      }
    }
  }
  // Shuffle the candidate cells so collision resolution distributes a queue across its forecourt.
  let state=hash(brand+gap)
  for(let i=points.length-1;i>0;i--){
    state=(Math.imul(state,1664525)+1013904223)>>>0
    const j=state%(i+1),saved=points[i];points[i]=points[j];points[j]=saved
  }
  return points
}
function destinations(agents:Agent[],day:number) {
  const points=new Map<string,Point>()
  for(const group of groups){
    const members=agents.filter(a=>a.brand===group).map(a=>({id:a.shopper_id,seed:hash(a.shopper_id)}))
    if(!members.length)continue
    let gap=13
    let slots=grid(group,gap)
    while(slots.length<members.length && gap>3)slots=grid(group,--gap)
    const occupied=new Set<number>()
    members.sort((a,b)=>a.seed-b.seed)
    for(const a of members){
      let slot=a.seed%slots.length
      if(occupied.size<slots.length)while(occupied.has(slot))slot=(slot+1)%slots.length
      occupied.add(slot)
      const p=slots[slot],phase=(a.seed%19)+day
      points.set(a.id,{x:p.x+1.7*Math.sin(phase*.72),y:p.y+1.3*Math.cos(phase*.85)})
    }
  }
  return points
}

// A visibility graph around the four buildings and fountain keeps cross-market trips on the paving.
function clear(from:Point,to:Point) {
  return booths.every(([left,top,right,bottom])=>{
    let enter=0,leave=1
    for(const [a,b,min,max] of [[from.x,to.x,left,right],[from.y,to.y,top,bottom]]){
      const delta=b-a
      if(Math.abs(delta)<.001){ if(a<min || a>max)return true; continue }
      const t=(min-a)/delta,u=(max-a)/delta
      enter=Math.max(enter,Math.min(t,u));leave=Math.min(leave,Math.max(t,u))
      if(enter>leave)return true
    }
    return false
  })
}
const corners=booths.flatMap(([l,t,r,b])=>[
  {x:l-2,y:t-2},{x:r+2,y:t-2},{x:r+2,y:b+2},{x:l-2,y:b+2},
]).filter(p=>!booths.some(b=>inside(p,b)))
const links=corners.map(a=>corners.map((b,i)=>clear(a,b)?i:-1).filter(i=>i>=0))

function route(from:Point,to:Point):Point[] {
  if(clear(from,to))return [from,to]
  const costs=corners.map(p=>clear(from,p)?distance(from,p):Infinity)
  const parent=corners.map(()=>-1),seen=new Set<number>()
  let end=-1,best=Infinity
  while(seen.size<corners.length){
    let index=-1,lowest=Infinity
    costs.forEach((cost,i)=>{if(!seen.has(i) && cost<lowest){lowest=cost;index=i}})
    if(index<0 || lowest>=best)break
    seen.add(index)
    if(clear(corners[index],to)){
      const finish=lowest+distance(corners[index],to)
      if(finish<best){best=finish;end=index}
    }
    for(const next of links[index]){
      if(seen.has(next))continue
      const cost=lowest+distance(corners[index],corners[next])
      if(cost<costs[next]){costs[next]=cost;parent[next]=index}
    }
  }
  const via:Point[]=[]
  for(let i=end;i>=0;i=parent[i])via.unshift(corners[i])
  return [from,...via,to]
}

function sample(w:Walker,time:number):Position {
  const t=w.duration ? cap((time-w.began)/w.duration,0,1):1
  const travel=w.distance*t*t*(3-2*t)
  let left=travel,index=0
  while(index<w.lengths.length-1 && left>w.lengths[index])left-=w.lengths[index++]
  const a=w.points[index],b=w.points[index+1],f=w.lengths[index]?cap(left/w.lengths[index],0,1):1
  return {id:w.id,brand:w.brand,seed:w.seed,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,
    step:t<1 && w.distance>7 ? 1+(Math.floor(travel/5)%2):0}
}

function cursor(c:CanvasRenderingContext2D,p:Point,active:boolean) {
  const x=Math.round(p.x)-8,y=Math.round(p.y)-17
  for(const [pad,color] of [[1,'#233436'],[0,active?'#fff8ce':'#fff6e3']] as const){
    c.fillStyle=color
    for(const [cx,cy,m,n] of [[x-pad,y-pad,1,1],[x+16+pad,y-pad,-1,1],[x-pad,y+19+pad,1,-1],[x+16+pad,y+19+pad,-1,-1]]){
      c.fillRect(cx,cy,4*m,2*n);c.fillRect(cx,cy,2*m,4*n)
    }
  }
}

function engine(canvas:HTMLCanvasElement,initial:Props) {
  const context=canvas.getContext('2d')
  if(!context)return null
  const c=context
  const ground=marketBackdrop(),person=shopperAtlas(),reduce=matchMedia('(prefers-reduced-motion: reduce)')
  let walkers:Walker[]=[], positions:Position[]=[], ghostPoints=new Map<string,Point>()
  let ghostAgents:Agent[]=noAgents, hovered:string|null=null, focused:string|null=null
  let current=initial,frame=0,lastAgents:Agent[]|undefined,lastDay:number|undefined
  let animationStart=0
  function paint(time:number){
    frame=0
    if(document.hidden)return
    c.drawImage(ground,0,0)
    positions=walkers.map(w=>sample(w,reduce.matches?Infinity:time)).sort((a,b)=>a.y-b.y)
    // Baseline silhouettes show only agents whose preference actually changed.
    const byId=new Map(positions.map(p=>[p.id,p]))
    for(const g of ghostAgents){
      const p=byId.get(g.shopper_id),base=ghostPoints.get(g.shopper_id)
      if(!p || !base || p.brand===g.brand)continue
      const x=Math.round(base.x),y=Math.round(base.y)
      c.strokeStyle='#796e5c';c.lineWidth=1;c.setLineDash([2,3]);c.strokeRect(x-4.5,y-12.5,8,12);c.setLineDash([])
      if(g.shopper_id===current.selected){
        c.beginPath();c.setLineDash([3,3]);c.moveTo(x,y-7);c.lineTo(p.x,p.y-7);c.stroke();c.setLineDash([])
      }
    }
    for(const p of positions)person(c,p.brand,p.seed>>>8,p.step,p)
    const marked=byId.get(current.selected??'')
    if(marked)cursor(c,marked,true)
    const preview=byId.get(hovered??focused??'')
    if(preview){
      cursor(c,preview,false)
      const label=preview.id.replace(/^shopper-/i,'Shopper ')
      c.font='bold 9px monospace';c.textAlign='center';c.textBaseline='middle'
      const width=Math.ceil(c.measureText(label).width)+10
      const x=Math.round(cap(preview.x,7+width/2,marketWidth-7-width/2)),y=Math.round(preview.y)-28
      c.fillStyle='#273839';c.fillRect(x-Math.floor(width/2),y-2,width,13)
      c.fillStyle='#fff8e6';c.fillText(label,x,y+5)
    }
    if(!reduce.matches && time<animationStart+860)frame=requestAnimationFrame(paint)
  }
  function repaint(){if(!frame && !document.hidden)frame=requestAnimationFrame(paint)}
  function update(p:Props){
    const time=performance.now()
    const changed=p.agents!==lastAgents || p.day!==lastDay
    if(changed){
      const old=new Map(walkers.map(w=>[w.id,sample(w,time)]))
      const cells=destinations(p.agents,p.day)
      walkers=p.agents.flatMap(a=>{
        const target=cells.get(a.shopper_id)
        if(!target)return []
        const seed=hash(a.shopper_id),start=old.get(a.shopper_id)??target
        const points=route(start,target),lengths=points.slice(1).map((pt,i)=>distance(points[i],pt))
        const total=lengths.reduce((sum,n)=>sum+n,0)
        return [{id:a.shopper_id,brand:a.brand,seed,points,lengths,distance:total,began:time,
          duration:reduce.matches || total<.01?0:Math.min(p.playing?850:520,220+total*1.9)}]
      })
      animationStart=walkers.some(w=>w.duration>0)?time:-1000
    }
    if(p.ghosts!==current.ghosts || p.day!==lastDay || changed){
      ghostAgents=p.ghosts??noAgents;ghostPoints=destinations(ghostAgents,p.day)
    }
    current=p;lastAgents=p.agents;lastDay=p.day
    repaint()
  }
  function nearest(x:number,y:number,hit:number){
    let best=hit,id:string|null=null
    for(const p of positions){const d=Math.hypot(p.x-x,p.y-7-y);if(d<=best){best=d;id=p.id}}
    return id
  }
  function focus(value:boolean) {
    focused=value?(current.selected??positions[0]?.id??null):null
    repaint()
  }
  function key(key:string){
    if(!positions.length)return false
    const point=positions.find(p=>p.id===focused)??positions.find(p=>p.id===current.selected)??positions[0]
    if(key==='Enter'||key===' '){current.onSelect(point.id);return true}
    const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}
    if(!(key in directions))return false
    const [dx,dy]=directions[key]
    let score=Infinity,target=point.id
    for(const p of positions){
      const vx=p.x-point.x,vy=p.y-point.y,along=vx*dx+vy*dy
      if(along<2)continue
      const cost=along+Math.abs(vx*dy-vy*dx)*3
      if(cost<score){score=cost;target=p.id}
    }
    focused=target;hovered=null;repaint();return true
  }
  function move(id:string|null){if(id!==hovered){hovered=id;repaint()}}
  function mediaChange(){if(reduce.matches)for(const w of walkers)w.duration=0;repaint()}
  reduce.addEventListener('change',mediaChange)
  document.addEventListener('visibilitychange',repaint)
  update(initial)
  return {update,nearest,move,focus,key,destroy(){
    cancelAnimationFrame(frame);reduce.removeEventListener('change',mediaChange)
    document.removeEventListener('visibilitychange',repaint)
  }}
}

export function PixelArena(props:Props) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const market=useRef<ReturnType<typeof engine>>(null),latest=useRef(props)
  latest.current=props
  useEffect(()=>{
    if(!canvas.current)return
    market.current=engine(canvas.current,latest.current)
    return ()=>{market.current?.destroy();market.current=null}
  },[])
  useEffect(()=>{market.current?.update(props)},[props])
  function hit(event:PointerEvent<HTMLCanvasElement>) {
    const box=event.currentTarget.getBoundingClientRect(),ratio=marketWidth/box.width
    return market.current?.nearest((event.clientX-box.left)*ratio,(event.clientY-box.top)*marketHeight/box.height,
      Math.max(7,ratio*(event.pointerType==='touch'?21:10)))??null
  }
  function keyboard(event:KeyboardEvent<HTMLCanvasElement>){
    if(market.current?.key(event.key))event.preventDefault()
  }
  return <canvas ref={canvas} width={marketWidth} height={marketHeight} className="pixel-market-canvas"
    role="group" tabIndex={props.agents.length?0:-1}
    aria-label="Market map. Choose a shopper with the arrow keys and press Enter to inspect."
    data-shopper-count={props.agents.length}
    style={{display:'block',width:'100%',height:'auto',aspectRatio:'8 / 5',imageRendering:'pixelated',background:'#e8d9bc',touchAction:'manipulation'}}
    onPointerMove={e=>{if(e.pointerType==='mouse'){const id=hit(e);market.current?.move(id);e.currentTarget.style.cursor=id?'pointer':'default'}}}
    onPointerLeave={()=>market.current?.move(null)}
    onClick={e=>{
      const box=e.currentTarget.getBoundingClientRect()
      const p=market.current?.nearest((e.clientX-box.left)*marketWidth/box.width,(e.clientY-box.top)*marketHeight/box.height,Math.max(8,18*marketWidth/box.width))
      if(p)props.onSelect(p)
    }}
    onKeyDown={keyboard}
    onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))market.current?.focus(true)}}
    onBlur={()=>market.current?.focus(false)}>Use the shopper inspector to choose a simulated shopper.</canvas>
}
