'use strict';
(function installRangeBallVisibilityV4(){
 let raf=0,hideTimer=0;
 function ensureOverlay(){
  const canvas=document.getElementById('rangeCanvas');if(!canvas)return null;
  const host=canvas.parentElement;if(!host)return null;
  const pos=getComputedStyle(host).position;if(pos==='static')host.style.position='relative';
  let layer=document.getElementById('rangeBallVisibilityV4');
  if(layer)return layer;
  layer=document.createElement('div');layer.id='rangeBallVisibilityV4';
  layer.innerHTML='<svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><polyline id="rangeHudTail" fill="none" stroke="#dfff55" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".88"/></svg><div id="rangeHudBall"><i></i></div><span>VISUAL BALL TRACKER</span>';
  layer.style.cssText='position:absolute;inset:0;z-index:18;pointer-events:none;overflow:hidden;display:none';
  const svg=layer.querySelector('svg');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 0 5px rgba(223,255,85,.95))';
  const ball=layer.querySelector('#rangeHudBall');ball.style.cssText='position:absolute;left:50%;top:78%;width:18px;height:18px;transform:translate(-50%,-50%);border-radius:50%;background:#fff;border:3px solid #111;box-shadow:0 0 0 3px #dfff55,0 0 16px 7px rgba(223,255,85,.95),0 0 30px 12px rgba(255,255,255,.7);will-change:left,top,width,height';
  ball.querySelector('i').style.cssText='position:absolute;left:4px;top:3px;width:4px;height:4px;border-radius:50%;background:#fff;box-shadow:0 0 3px #fff';
  const label=layer.querySelector('span');label.style.cssText='position:absolute;top:18px;left:50%;transform:translateX(-50%);padding:5px 8px;border-radius:5px;background:rgba(7,18,15,.62);color:#dfff55;font:800 10px/1 system-ui,sans-serif;letter-spacing:.12em;opacity:.82';
  host.appendChild(layer);return layer;
 }
 function stop(){cancelAnimationFrame(raf);raf=0;clearTimeout(hideTimer);const layer=document.getElementById('rangeBallVisibilityV4');if(layer)layer.style.display='none'}
 function animate(path){
  const layer=ensureOverlay();if(!layer||!Array.isArray(path)||path.length<2)return;
  cancelAnimationFrame(raf);clearTimeout(hideTimer);layer.style.display='block';
  const ball=layer.querySelector('#rangeHudBall'),tail=layer.querySelector('#rangeHudTail');
  const duration=Math.max(.65,Number(path.at(-1)?.t)||2.2)*1000;
  const final=path.at(-1)||{},direction=Math.atan2(Number(final.x)||0,Math.max(1,Number(final.z)||1));
  const lateral=Math.max(-18,Math.min(18,direction/(15*Math.PI/180)*16));
  const start=performance.now(),history=[];
  function tick(now){
   const u=Math.max(0,Math.min(1,(now-start)/duration));
   const arc=4*u*(1-u);
   // High-visibility HUD marker follows the same shot duration and approximate screen arc.
   // It is visual only and never changes launch-monitor measurements or course physics.
   const x=50+lateral*u;
   const y=79-48*arc-18*u;
   const size=18-6*u;
   ball.style.left=x+'%';ball.style.top=y+'%';ball.style.width=size+'px';ball.style.height=size+'px';
   history.push([x*10,y*6]);if(history.length>22)history.shift();tail.setAttribute('points',history.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '));
   if(u<1)raf=requestAnimationFrame(tick);else hideTimer=setTimeout(()=>{layer.style.display='none'},1100);
  }
  raf=requestAnimationFrame(tick);
 }
 function patch(Ctor){
  if(!Ctor?.prototype||Ctor.prototype.__burkeshotBallVisibilityV4)return false;
  const original=Ctor.prototype.playShot;if(typeof original!=='function')return false;
  Ctor.prototype.playShot=function(path,done){animate(path);return original.call(this,path,done)};
  Ctor.prototype.__burkeshotBallVisibilityV4=true;return true;
 }
 function globals(){
  const HD=typeof BurkeRangeHD!=='undefined'?BurkeRangeHD:window.BurkeRangeHD;
  const SW=typeof BurkeSoftwareRange!=='undefined'?BurkeSoftwareRange:window.BurkeSoftwareRange;
  const ui=typeof els!=='undefined'?els:window.els;
  const result=typeof currentResult!=='undefined'?currentResult:window.currentResult;
  return{HD,SW,ui,result};
 }
 function fixBadge(result){const g=globals();if(result?.calibration?.mode==='rear_perspective_v4'&&g.ui?.geometry)g.ui.geometry.textContent='REAR VIEW V4'}
 function install(){const g=globals();const ok=patch(g.HD)|patch(g.SW);fixBadge(g.result);return!!ok}
 window.addEventListener('burkeshot-analysis-complete',e=>fixBadge(e.detail));
 window.addEventListener('burkeshot-analysis-start',stop);
 let tries=0;const timer=setInterval(()=>{if(install()||++tries>80)clearInterval(timer)},100);
 install();
})();
