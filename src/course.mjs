// The renderer uses metres. Existing app trajectories are in feet and public
// range-label coordinates use ten-yard units; convert only at the boundary.
export const FEET_TO_METRES = 0.3048;
export const LEGACY_TO_METRES = 9.144;
export const YARDS_TO_METRES = 0.9144;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const smooth = (a, b, x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
export const greens = [91.44,137.16,182.88,228.6];
export const pond = {x:-64,z:153,rx:20,rz:41,level:.4};
export const bunkers = [
  {x:-20,z:128,rx:6.4,rz:10.5,seed:0.7},
  {x:25,z:184,rx:7.6,rz:12.5,seed:2.1},
  {x:-24,z:230,rx:8.0,rz:10.0,seed:4.2}
];
export function center(z) { return (Math.sin(z*.022)*2.4+Math.sin(z*.009)*1.4)*smooth(4,50,z); }
export function width(z) { return 17+Math.sin(z*.016)*3+clamp(z,0,350)*.019; }
export function bunkerRadius(x,z,b) {
  const dx=(x-b.x)/b.rx,dz=(z-b.z)/b.rz,a=Math.atan2(dz,dx);
  return Math.hypot(dx,dz)/(1+.105*Math.sin(a*3+b.seed)+.07*Math.cos(a*5-b.seed));
}
export function baseHeight(x,z) {
  const edge=Math.abs(x-center(z))-width(z);
  const hills=smooth(0,38,edge)*(2.1+2.1*Math.sin(x*.037+z*.013)**2+2.7*Math.sin(z*.023-x*.011)**2);
  const rise=smooth(285,640,z)*13;
  const fair=(.20*Math.sin(z*.026)+.09*Math.sin(x*.08+z*.023))*smooth(5,25,Math.abs(z));
  return fair+hills+rise;
}
export function terrainHeight(x,z) {
  let h=baseHeight(x,z);
  for(const b of bunkers){const r=bunkerRadius(x,z,b);h-=.62*(1-smooth(.35,1.18,r));h+=.13*Math.exp(-Math.pow((r-1.12)*8,2));}
  // Pond depression is outside the hitting corridor.
  const r=Math.hypot((x-pond.x)/pond.rx,(z-pond.z)/pond.rz);
  const bed=pond.level-1.5+1.85*smooth(.3,1.03,r);
  const blend=smooth(.92,1.25,r);
  h=h*blend+bed*(1-blend);
  return h;
}
export function surface(x,z) {
  const edge=Math.abs(x-center(z))-width(z);
  let green=0;for(const gz of greens)green=Math.max(green,1-smooth(.92,1.09,Math.hypot((x-center(gz))/10.5,(z-gz)/8.5)));
  const fair=1-smooth(-.6,.6,edge),firstCut=1-smooth(2.4,3.2,edge);
  const stripe=.93+.07*Math.sin((z+x*.42)*Math.PI/6.5);
  return {fair,firstCut,green,stripe};
}
export function seededRandom(seed=7029){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function treeLayout(count=420) {
  const rnd=seededRandom(),arr=[];
  // Fixed foreground groups frame the corridor, without blocking the tee line.
  const near=[[-32,-4,19],[-41,10,22],[32,16,19],[44,31,24],[-38,42,20],[34,58,18]];
  for(const [x,z,h] of near)arr.push({x,z,h,y:terrainHeight(x,z),kind:arr.length%2,shade:.94,flip:false});
  for(let i=arr.length;i<count;i++) {
    const z=10+rnd()*485,sign=i%2?-1:1,x=center(z)+sign*(width(z)+16+rnd()*95);
    if(Math.hypot((x+64)/24,(z-153)/45)<1.1)continue;
    arr.push({x,z,y:terrainHeight(x,z),h:13+rnd()*15,kind:rnd()<.78?1:0,shade:.77+rnd()*.25,flip:rnd()>.5});
  }
  return arr;
}
export function bufferSize(cssW,cssH,quality='auto',dpr=1,maxSize=8192) {
  const w=Math.max(1,cssW),h=Math.max(1,cssH);
  const limit=quality==='4k'?[3840,2160]:quality==='1080'?[1920,1080]:[3840,2160];
  // A fixed quality is independent of DPR and never silently becomes 8K.
  const s=Math.min(limit[0]/w,limit[1]/h,maxSize/w,maxSize/h,quality==='auto'?Math.min(dpr,2):Infinity);
  return {width:Math.max(1,Math.round(w*s)),height:Math.max(1,Math.round(h*s))};
}
export function pathToMetres(path) {
  return path.map(p=>({x:p.x*FEET_TO_METRES,y:p.y*FEET_TO_METRES,z:p.z*FEET_TO_METRES,t:Number(p.t)||0}));
}
