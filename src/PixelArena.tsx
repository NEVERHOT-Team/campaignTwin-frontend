import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { Agent, BrandGroup } from './model'
import { resolveBrandGroups } from './shopper-groups'
import { uniqueShoppers } from './shopper-snapshot'
import { selectionDuration, selectionInset, walkingPose, walkingTime } from './market-motion'
import { marketBackdrop, marketLayout, marketWidth, shopperAtlas, type Bounds, type MarketLayout, type Point } from './pixel-market-art'

type Props = {
  agents: Agent[]; ghosts?: Agent[]; groups?:BrandGroup[]; selected: string|null
  onSelect: (id:string)=>void; day:number; playing:boolean
}
type Placement = {agent:Agent; site:string|null; at:Point}
type Walker = { agent:Agent; site:string|null; seed:number; points:Point[]; lengths:number[]; distance:number; began:number; duration:number }
type Position = Point & {agent:Agent; id:string; site:string|null; seed:number; step:number}
const noAgents:Agent[]=[]
const distance=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y)
const inside=(p:Point,[l,t,r,b]:Bounds)=>p.x>=l && p.x<=r && p.y>=t && p.y<=b
const cap=(value:number,low:number,high:number)=>Math.min(high,Math.max(low,value))

function hash(text:string) {
  let seed=2166136261
  for(const char of text) seed=Math.imul(seed^char.charCodeAt(0),16777619)
  seed=Math.imul(seed^(seed>>>16),0x85ebca6b)
  return (seed^(seed>>>13))>>>0
}
function grid(courts:Bounds[],obstacles:Bounds[],gap:number) {
  const points:Point[]=[]
  for(const [l,t,r,b] of courts) {
    let row=0
    for(let y=t;y<=b;y+=gap+1,row++){
      for(let x=l+(row%2)*gap/2;x<=r;x+=gap){
        const seed=hash(x+'|'+y)
        const p={x:x+((seed>>>9)%7-3)*.5,y:y+((seed>>>19)%7-3)*.5}
        if(!obstacles.some(box=>inside(p,box)))points.push(p)
      }
    }
  }
  // Shuffle the candidate cells so collision resolution distributes a queue across its forecourt.
  let state=hash(courts[0].join(',')+gap)
  for(let i=points.length-1;i>0;i--){
    state=(Math.imul(state,1664525)+1013904223)>>>0
    const j=state%(i+1),saved=points[i];points[i]=points[j];points[j]=saved
  }
  return points
}
function destinations(agents:Agent[],day:number,layout:MarketLayout) {
  const placements=new Map<string,Placement>()
  const areas=new Map<string|null,Bounds[]>(layout.sites.map(s=>[s.group.id,s.courts]))
  areas.set(null,layout.commons)
  const clusters=new Map<string|null,{agent:Agent;seed:number}[]>()
  for(const agent of agents){
    const site=agent.purchase==='bought' && areas.has(agent.brand)?agent.brand:null
    const members=clusters.get(site)??[]
    members.push({agent,seed:hash(agent.shopper_id)})
    clusters.set(site,members)
  }
  for(const [site,members] of clusters){
    const courts=areas.get(site)!
    let gap=13, slots=grid(courts,layout.obstacles,gap)
    while(slots.length<members.length && gap>3)slots=grid(courts,layout.obstacles,--gap)
    const occupied=new Set<number>()
    members.sort((a,b)=>a.seed-b.seed)
    for(const {agent,seed} of members){
      let slot=seed%slots.length
      if(occupied.size<slots.length)while(occupied.has(slot))slot=(slot+1)%slots.length
      occupied.add(slot)
      const p=slots[slot],phase=(seed%19)+day
      placements.set(agent.shopper_id,{agent,site,at:{x:p.x+1.7*Math.sin(phase*.72),y:p.y+1.3*Math.cos(phase*.85)}})
    }
  }
  return placements
}

// Compute visibility links once for this square's storefronts, gardens and fountain.
function navigation(obstacles:Bounds[]){
  function clear(from:Point,to:Point) {
    return obstacles.every(([left,top,right,bottom])=>{
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
  const corners=obstacles.flatMap(([l,t,r,b])=>[
    {x:l-2,y:t-2},{x:r+2,y:t-2},{x:r+2,y:b+2},{x:l-2,y:b+2},
  ]).filter(p=>!obstacles.some(b=>inside(p,b)))
  const links=corners.map(a=>corners.map((b,i)=>clear(a,b)?i:-1).filter(i=>i>=0))

  return function route(from:Point,to:Point):Point[] {
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
}

function sample(w:Walker,time:number):Position {
  const t=w.duration ? cap((time-w.began)/w.duration,0,1):1
  const travel=w.distance*t*t*(3-2*t)
  let left=travel,index=0
  while(index<w.lengths.length-1 && left>w.lengths[index])left-=w.lengths[index++]
  const a=w.points[index],b=w.points[index+1],f=w.lengths[index]?cap(left/w.lengths[index],0,1):1
  return {id:w.agent.shopper_id,agent:w.agent,site:w.site,seed:w.seed,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,
    step:w.distance>7 ? walkingPose(time-w.began,w.duration,w.seed):0}
}

function cursor(c:CanvasRenderingContext2D,p:Point,active:boolean,inset=0) {
  const extra=Math.round(inset),x=Math.round(p.x)-8-extra,y=Math.round(p.y)-17-extra
  for(const [pad,color] of [[1,'#233436'],[0,active?'#fff8ce':'#fff6e3']] as const){
    c.fillStyle=color
    const right=x+16+2*extra,bottom=y+19+2*extra
    for(const [cx,cy,m,n] of [[x-pad,y-pad,1,1],[right+pad,y-pad,-1,1],[x-pad,bottom+pad,1,-1],[right+pad,bottom+pad,-1,-1]]){
      c.fillRect(cx,cy,4*m,2*n);c.fillRect(cx,cy,2*m,4*n)
    }
  }
}

function engine(canvas:HTMLCanvasElement,initial:Props,groups:BrandGroup[],layout:MarketLayout) {
  const context=canvas.getContext('2d')
  if(!context)return null
  const c=context
  const ground=marketBackdrop(groups),person=shopperAtlas(groups),route=navigation(layout.obstacles),reduce=matchMedia('(prefers-reduced-motion: reduce)')
  let walkers:Walker[]=[], positions:Position[]=[], ghostPoints=new Map<string,Placement>()
  const catalog=new Map(groups.map(g=>[g.id,g]))
  let hovered:string|null=null, focused:string|null=null
  let current=initial,frame=0,lastAgents:Agent[]|undefined,lastDay:number|undefined
  let walksEnd=0,selectionStart=-Infinity
  function paint(time:number){
    frame=0
    if(document.hidden)return
    c.drawImage(ground,0,0)
    positions=walkers.map(w=>sample(w,reduce.matches?Infinity:time)).sort((a,b)=>a.y-b.y)
    // Outlines compare the same ID across two observed purchase outcomes.
    const byId=new Map(positions.map(p=>[p.id,p]))
    for(const [id,base] of ghostPoints){
      const p=byId.get(id)
      if(!p || !p.agent.purchase || !base.agent.purchase || p.site===base.site)continue
      const x=Math.round(base.at.x),y=Math.round(base.at.y)
      c.strokeStyle='#796e5c';c.lineWidth=1;c.setLineDash([2,3]);c.strokeRect(x-4.5,y-12.5,8,12);c.setLineDash([])
      if(id===current.selected){
        c.beginPath();c.setLineDash([3,3]);c.moveTo(x,y-7);c.lineTo(p.x,p.y-7);c.stroke();c.setLineDash([])
      }
    }
    for(const p of positions)person(c,p.agent.brand,p.seed>>>8,p.step,p)
    const marked=byId.get(current.selected??'')
    if(marked)cursor(c,marked,true,selectionInset(time,selectionStart,reduce.matches))
    const preview=byId.get(hovered??focused??'')
    if(preview){
      if(preview.id!==marked?.id)cursor(c,preview,false)
      const group=catalog.get(preview.agent.brand)
      const outcome=preview.agent.purchase==='bought' ? (group?'Bought · '+group.label:'Bought · group unavailable') :
        preview.agent.purchase==='no_purchase' ? (preview.agent.waiting?'No purchase · waiting':'No purchase') : 'Purchase not supplied'
      const label=preview.id.replace(/^shopper-/i,'Shopper ')+' · '+outcome
      c.font='bold 9px monospace';c.textAlign='center';c.textBaseline='middle'
      const width=Math.min(marketWidth-14,Math.ceil(c.measureText(label).width)+10)
      const x=Math.round(cap(preview.x,7+width/2,marketWidth-7-width/2)),y=Math.round(preview.y)-28
      c.fillStyle='#273839';c.fillRect(x-Math.floor(width/2),y-2,width,13)
      c.fillStyle='#fff8e6';c.fillText(label,x,y+5,width-10)
    }
    if(!reduce.matches && time<Math.max(walksEnd,selectionStart+selectionDuration))frame=requestAnimationFrame(paint)
  }
  function repaint(){if(!frame && !document.hidden)frame=requestAnimationFrame(paint)}
  function update(p:Props){
    const time=performance.now()
    if(p.selected!==current.selected)selectionStart=p.selected?time:-Infinity
    const changed=p.agents!==lastAgents || p.day!==lastDay
    if(changed){
      const old=new Map(walkers.map(w=>[w.agent.shopper_id,sample(w,time)]))
      const cells=destinations(p.agents,p.day,layout)
      walksEnd=0
      walkers=[...cells.values()].map(({agent,site,at:target})=>{
        const seed=hash(agent.shopper_id),start=old.get(agent.shopper_id)??target
        const points=route(start,target),lengths=points.slice(1).map((pt,i)=>distance(points[i],pt))
        const total=lengths.reduce((sum,n)=>sum+n,0)
        const {delay,duration}=walkingTime(total,seed,p.playing,reduce.matches)
        if(duration)walksEnd=Math.max(walksEnd,time+delay+duration)
        return {agent,site,seed,points,lengths,distance:total,began:time+delay,duration}
      })
    }
    if(p.ghosts!==current.ghosts || p.day!==lastDay || changed){
      ghostPoints=destinations(p.ghosts??noAgents,p.day,layout)
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
  const shown=useMemo(()=>uniqueShoppers(props.agents),[props.agents])
  const baseline=useMemo(()=>uniqueShoppers(props.ghosts??noAgents),[props.ghosts])
  const groups=useMemo(()=>props.groups??resolveBrandGroups(undefined,shown),[props.groups,shown])
  const signature=JSON.stringify(groups.map(({id,label,color,role})=>[id,label,color,role]))
  const layout=useMemo(()=>marketLayout(groups),[signature])
  const market=useRef<ReturnType<typeof engine>>(null)
  const data={...props,agents:shown,ghosts:baseline}
  const latest=useRef(data)
  latest.current=data
  useEffect(()=>{
    if(!canvas.current)return
    market.current=engine(canvas.current,latest.current,groups,layout)
    return ()=>{market.current?.destroy();market.current=null}
  },[layout])
  useEffect(()=>{market.current?.update(data)},[data])
  function hit(event:PointerEvent<HTMLCanvasElement>) {
    const box=event.currentTarget.getBoundingClientRect(),ratio=marketWidth/box.width
    return market.current?.nearest((event.clientX-box.left)*ratio,(event.clientY-box.top)*layout.height/box.height,
      Math.max(7,ratio*(event.pointerType==='touch'?21:10)))??null
  }
  function keyboard(event:KeyboardEvent<HTMLCanvasElement>){
    if(market.current?.key(event.key))event.preventDefault()
  }
  return <canvas ref={canvas} width={marketWidth} height={layout.height} className="pixel-market-canvas"
    role={shown.length?'group':'img'} tabIndex={shown.length?0:-1}
    aria-label={shown.length?`Sample market map. ${shown.length} simulated shoppers. Select with the arrow keys and press Enter to inspect. Shoppers without a recorded group purchase appear on the public paths.`:'Illustration of a market square with gardens and a fountain. No shopper observations available.'}
    data-shopper-count={shown.length} data-purchase-groups={layout.sites.length}
    style={{display:'block',width:'100%',height:'auto',aspectRatio:marketWidth+' / '+layout.height,imageRendering:'pixelated',background:'#e8d9bc',touchAction:'manipulation'}}
    onPointerMove={e=>{if(e.pointerType==='mouse'){const id=hit(e);market.current?.move(id);e.currentTarget.style.cursor=id?'pointer':'default'}}}
    onPointerLeave={()=>market.current?.move(null)}
    onClick={e=>{
      const box=e.currentTarget.getBoundingClientRect()
      const p=market.current?.nearest((e.clientX-box.left)*marketWidth/box.width,(e.clientY-box.top)*layout.height/box.height,Math.max(8,18*marketWidth/box.width))
      if(p)props.onSelect(p)
    }}
    onKeyDown={keyboard}
    onFocus={e=>{if(e.currentTarget.matches(':focus-visible'))market.current?.focus(true)}}
    onBlur={()=>market.current?.focus(false)}>Use the shopper inspector to choose a simulated shopper.</canvas>
}
