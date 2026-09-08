/* Software perspective renderer for machines without WebGL. Same 10 yd/world-unit scale. */
(function(){
'use strict';
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=a=>{let n=Math.hypot(...a)||1;return a.map(x=>x/n)};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
class BurkeSoftwareRange{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');if(!this.ctx)throw Error('Canvas unavailable');this.view='tee';this.target=150;this.aim=0;this.showTracer=true;this.anim=null;this.lastPath=[];this.ball=[0,.026,0];this.cache=document.createElement('canvas');this.key='';this.quality='auto';this.trees=[];
 let seed=1729;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<100;i++)this.trees.push({x:(i%2?-1:1)*(5.5+rnd()*15),z:rnd()*64,h:1.6+rnd()*1.5,seed:rnd()*500});
 this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
 }
 setTarget(v){this.target=v;this.key=''}setAim(v){this.aim=v}setView(v){this.view=v;this.key=''}
 setQuality(q){this.quality=q||'auto';this.key=''}
 getQualityStatus(){return 'Basic graphics · WebGL2 unavailable'}
 clearShot(){this.anim=null;this.lastPath=[];this.ball=[0,.026,0];this.key=''}
 playShot(path,onDone){if(!path?.length)return;this.lastPath=path;this.anim={path,start:performance.now(),duration:Math.max(1900,Math.min(5200,path.at(-1).t*700)),onDone};}
 camera(){let b=this.ball;if(this.view==='follow'&&this.lastPath.length)return{eye:[b[0]+1.1,Math.max(.9,b[1]+.6),b[2]-3.2],target:[b[0],Math.max(.15,b[1]*.75),b[2]+4]};if(this.view==='downrange'){let z=this.lastPath.length?this.lastPath.at(-1).z/30:this.target/10;return{eye:[6,4.3,z+5],target:[0,.1,z-2]}}return{eye:[0,1.1,-3.1],target:[0,.25,18]}}
 setup(){const camera=this.camera();this.eye=camera.eye;this.forward=norm(sub(camera.target,this.eye));this.right=norm(cross([0,1,0],this.forward));this.up=cross(this.forward,this.right);this.f=this.h/(2*Math.tan(49*Math.PI/360));}
 project(p){if(!this.eye)return null;const d=sub(p,this.eye),z=dot(d,this.forward),x=this.w/2+dot(d,this.right)*this.f/z,y=this.h/2-dot(d,this.up)*this.f/z;return{x,y,z,visible:z>.03&&x>-50&&x<this.w+50&&y>-50&&y<this.h+50}}
 polygon(c,points,color){const pp=points.map(p=>this.project(p));if(pp.some(p=>p.z<.03))return;c.beginPath();pp.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle=color;c.fill();}
 color(x,z){let w=3+Math.sin(z*.11)*.65+z*.028,sway=Math.sin(z*.18)*.48,fair=Math.abs(x-sway)<w,col=fair?(Math.sin(z*1.65)>0?[112,145,66]:[95,129,54]):[68,94,39];
 for(const gz of[10,15,20,25])if(Math.hypot(x/1.55,(z-gz))<1)col=[135,162,83];
 if(Math.hypot((x+2.7)/.74,(z-15.5)/1.18)<1||Math.hypot((x-2.8)/.75,(z-20.5)/1.1)<1)col=[205,192,143];
 if(Math.hypot((x+6.8)/2.3,(z-16)/4.2)<1)col=[68,112,113];
 let n=(Math.sin(x*153.7+z*389.3)*4271)%1,shade=.96+n*.035,fog=Math.min(.36,Math.max(0,z-18)*.004);return `rgb(${col.map((v,i)=>Math.round(v*shade*(1-fog)+[190,207,190][i]*fog)).join(',')})`;
 }
 ground(c){
 // Ray-cast a textured ground plane at half resolution. Smooth edges without a GPU.
 const w=Math.ceil(this.w/2),h=Math.ceil(this.h/2),tex=document.createElement('canvas');tex.width=w;tex.height=h;
 const tc=tex.getContext('2d'),im=tc.createImageData(w,h),data=im.data;
 for(let y=0;y<h;y++){
  const sy=(this.h/2-y*2)/this.f,dy=this.forward[1]+this.up[1]*sy;if(dy>=-.0001)continue;
  const t=-this.eye[1]/dy;if(t<0||t>900)continue;
  const baseX=this.eye[0]+t*(this.forward[0]+this.up[0]*sy-this.right[0]*this.w/(2*this.f));
  const baseZ=this.eye[2]+t*(this.forward[2]+this.up[2]*sy-this.right[2]*this.w/(2*this.f));
  const dx=t*this.right[0]*2/this.f,dz=t*this.right[2]*2/this.f;
  for(let x=0;x<w;x++){
   const wx=baseX+x*dx,wz=baseZ+x*dz,width=3+Math.sin(wz*.11)*.65+wz*.028,sway=Math.sin(wz*.18)*.48;
   const fair=Math.abs(wx-sway)<width;let r=68,g=94,b=39;
   if(fair){let stripe=.5+.5*Math.tanh(Math.sin(wz*1.65)*10);r=95+stripe*13;g=129+stripe*12;b=54+stripe*8;}
   for(const gz of[10,15,20,25])if(wx*wx/2.4025+(wz-gz)**2<1){r=131;g=155;b=78;}
   if((wx+2.7)**2/.5476+(wz-15.5)**2/1.3924<1||(wx-2.8)**2/.5625+(wz-20.5)**2/1.21<1){r=205;g=192;b=143;}
   if((wx+6.8)**2/5.29+(wz-16)**2/17.64<1){r=66;g=110;b=112;}
   const noise=Math.sin(wx*214.7+wz*181.3)*4321,grain=.94+(noise-Math.floor(noise))*.12;
   const fog=Math.min(.86,Math.max(0,t-22)*.008),idx=(y*w+x)*4;
   data[idx]=r*grain*(1-fog)+189*fog;data[idx+1]=g*grain*(1-fog)+207*fog;data[idx+2]=b*grain*(1-fog)+190*fog;data[idx+3]=255;
  }
 }
 tc.putImageData(im,0,0);c.drawImage(tex,0,0,this.w,this.h);
 }
 tree(c,t){const base=this.project([t.x,0,t.z]),top=this.project([t.x,t.h,t.z]);if(base.z<.1||base.x<-200||base.x>this.w+200)return;let size=Math.abs(top.y-base.y);if(size<1)return;
 c.fillStyle='#514b2b';c.fillRect(base.x-size*.025,top.y,size*.05,size);
 let fog=Math.min(.45,t.z*.005);for(let j=0;j<100;j++){let a=j*2.399+t.seed,r=Math.sqrt(j/100)*size*.32,x=top.x+Math.cos(a)*r,y=top.y+Math.sin(a)*r*.85;let rad=size*(.067+.025*Math.sin(j*5+t.seed));let light=.75+(Math.sin(j*87+t.seed)+1)*.16;let col=[70,97,38].map((v,i)=>Math.round(v*light*(1-fog)+[186,204,182][i]*fog));const g=c.createRadialGradient(x-rad*.4,y-rad*.5,0,x,y,rad);g.addColorStop(0,`rgb(${col.map(v=>Math.min(255,v*1.15))})`);g.addColorStop(1,`rgb(${col.map(v=>v*.84)})`);c.fillStyle=g;c.beginPath();c.arc(x,y,rad,0,Math.PI*2);c.fill();}
 }
 scenery(){const c=this.cache.getContext('2d');this.cache.width=this.w;this.cache.height=this.h;
 const sky=c.createLinearGradient(0,0,0,this.h*.65);sky.addColorStop(0,'#73a8c5');sky.addColorStop(1,'#d0dfd8');c.fillStyle=sky;c.fillRect(0,0,this.w,this.h);
 // Atmospheric cloud layers, kept behind the rendered terrain.
 for(let i=0;i<6;i++){let x=this.w*(i*.23-.05),y=this.h*(.12+(i%3)*.025);const g=c.createRadialGradient(x,y,3,x,y,this.w*.16);g.addColorStop(0,'#ffffff65');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(x-this.w*.16,y-this.w*.16,this.w*.32,this.w*.32)}
 const horizon=this.project([0,0,400]).y;c.fillStyle='#70856b';c.beginPath();c.moveTo(0,horizon+8);for(let x=0;x<=this.w+20;x+=20)c.lineTo(x,horizon-8-Math.sin(x*.009)*9-Math.sin(x*.025)*4);c.lineTo(this.w,this.h);c.lineTo(0,this.h);c.fill();
 this.ground(c);this.trees.map(t=>({...t,d:this.project([t.x,0,t.z]).z})).sort((a,b)=>b.d-a.d).forEach(t=>this.tree(c,t));
 const foot=this.project([0,.02,this.target/10]),top=this.project([0,.70,this.target/10]);if(foot.z>.1){c.strokeStyle='#f7f4db';c.lineWidth=2;c.beginPath();c.moveTo(foot.x,foot.y);c.lineTo(top.x,top.y);c.stroke();c.fillStyle='#e1f583';c.beginPath();c.moveTo(top.x,top.y);c.lineTo(top.x+Math.max(8,(foot.y-top.y)*.4),top.y+4);c.lineTo(top.x,top.y+9);c.fill()}
 }
 frame(t){requestAnimationFrame(this.frame);let w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;this.w=w;this.h=h;const nativeDpr=Math.min(devicePixelRatio||1,1.5);const targetScale=this.quality==='4k'?Math.min(3840/w,2160/h):this.quality==='1080'?Math.min(1920/w,1080/h):nativeDpr;const dpr=this.quality==='auto'?nativeDpr:Math.max(1,targetScale);if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);this.key=''}this.ctx.setTransform(dpr,0,0,dpr,0,0);
 let u=1;if(this.anim){u=Math.min(1,(t-this.anim.start)/this.anim.duration);const index=u*(this.anim.path.length-1),i=Math.min(Math.floor(index),this.anim.path.length-2),f=index-i,a=this.anim.path[i],b=this.anim.path[i+1];this.ball=['x','y','z'].map(k=>(a[k]+(b[k]-a[k])*f)/30);if(u>=1){const done=this.anim.onDone;this.anim=null;done?.()}}
 this.setup();let key=[w,h,this.view,this.target,...this.eye.map(v=>v.toFixed(2))].join('|');if(this.key!==key){this.scenery();this.key=key}const c=this.ctx;c.drawImage(this.cache,0,0,w,h);
 let a=this.aim*Math.PI/180;c.strokeStyle='#e8f49b';c.lineWidth=1;c.setLineDash([7,6]);c.beginPath();for(let i=0;i<16;i++){const z=i*.25,p=this.project([Math.sin(a)*z,.012,Math.cos(a)*z]);if(p.z>.03)i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y)}c.stroke();c.setLineDash([]);
 if(this.showTracer&&this.lastPath.length){c.beginPath();let started=false;const count=Math.max(2,Math.ceil(u*this.lastPath.length));for(const p of this.lastPath.slice(0,count)){const q=this.project([p.x/30,p.y/30,p.z/30]);if(q.z<=.03){started=false;continue}if(started)c.lineTo(q.x,q.y);else{c.moveTo(q.x,q.y);started=true}}c.strokeStyle='#ffd165';c.lineWidth=3;c.shadowColor='#f9b934';c.shadowBlur=6;c.stroke();c.shadowBlur=0;}
 const ball=this.project(this.ball);if(ball.z>.03){c.fillStyle='white';c.beginPath();c.arc(ball.x,ball.y,Math.max(2.5,Math.min(7,this.f*.025/ball.z)),0,Math.PI*2);c.fill()}
 }
}
window.BurkeSoftwareRange=BurkeSoftwareRange;
})();
