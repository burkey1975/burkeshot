'use strict';
(function installTraceEditorV4(){
 const canvas=document.getElementById('trackingCanvas');
 const video=document.getElementById('video');
 const replay=document.querySelector('.replay-toolbar');
 if(!canvas||!video||!replay)return;

 const bar=document.createElement('div');
 bar.className='trace-editor-v4';
 bar.hidden=true;
 bar.innerHTML=`
  <div class="trace-editor-copy"><b>TRACE REVIEW</b><span id="traceEditStatus">Auto-track ready</span></div>
  <div class="trace-editor-actions">
   <button id="traceEditBtn" type="button">EDIT TRACE</button>
   <button id="traceUndoBtn" type="button" hidden>UNDO</button>
   <button id="traceApplyBtn" type="button" hidden>APPLY + RECALCULATE</button>
   <button id="traceCancelBtn" type="button" hidden>CANCEL</button>
  </div>`;
 replay.after(bar);

 const status=document.getElementById('traceEditStatus');
 const editBtn=document.getElementById('traceEditBtn');
 const undoBtn=document.getElementById('traceUndoBtn');
 const applyBtn=document.getElementById('traceApplyBtn');
 const cancelBtn=document.getElementById('traceCancelBtn');
 let editing=false,dragIndex=-1,backup=null,undoStack=[];

 const clone=v=>JSON.parse(JSON.stringify(v));
 const pts=()=>currentResult?.ball_track?.points||[];
 const observedIndices=()=>pts().map((p,i)=>({p,i})).filter(({p})=>p&&p.kind!=='address'&&p.kind!=='predicted'&&p.kind!=='interpolated'&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y)));

 function sourcePoint(e){
  const r=canvas.getBoundingClientRect();
  const w=Number(currentResult?.video?.width)||video.videoWidth;
  const h=Number(currentResult?.video?.height)||video.videoHeight;
  if(!(w>0&&h>0&&r.width>0&&r.height>0))return null;
  const scale=Math.min(r.width/w,r.height/h),ox=(r.width-w*scale)/2,oy=(r.height-h*scale)/2;
  const x=(e.clientX-r.left-ox)/scale,y=(e.clientY-r.top-oy)/scale;
  if(x<0||y<0||x>w||y>h)return null;
  return{x,y,scale,ox,oy,r};
 }
 function nearestIndex(e){
  const q=sourcePoint(e);if(!q)return-1;
  let best=-1,bestD=Infinity;
  for(const {p,i} of observedIndices()){
   const d=Math.hypot(Number(p.x)-q.x,Number(p.y)-q.y)*q.scale;
   if(d<bestD){bestD=d;best=i}
  }
  return bestD<=28?best:-1;
 }
 function paint(){
  if(currentResult)drawTracking(currentResult);
  if(!editing)return;
  const r=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1,w=Number(currentResult?.video?.width)||video.videoWidth,h=Number(currentResult?.video?.height)||video.videoHeight;
  if(!(w>0&&h>0))return;
  const ctx=canvas.getContext('2d'),scale=Math.min(r.width/w,r.height/h),ox=(r.width-w*scale)/2,oy=(r.height-h*scale)/2;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  for(const {p,i} of observedIndices()){
   const x=ox+Number(p.x)*scale,y=oy+Number(p.y)*scale,active=i===dragIndex;
   ctx.save();ctx.fillStyle=active?'#ffffff':'#ffd84d';ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,active?8:6,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
  }
 }
 function setEditing(on){
  editing=on;canvas.classList.toggle('trace-editing',on);canvas.style.pointerEvents=on?'auto':'none';
  editBtn.hidden=on;undoBtn.hidden=!on;applyBtn.hidden=!on;cancelBtn.hidden=!on;
  status.textContent=on?'Drag a yellow point onto the golf ball.':'Auto-track ready';
  paint();
 }
 function config(){
  const view=document.getElementById('calView')?.value||'unknown';
  const timing=els.capture.value==='120_real'?'original':els.capture.value;
  return{view,timing,timingConfirmed:document.getElementById('calTimingConfirmed')?.checked||false,distanceFactor:Number(els.profile.value)||1,planeConfirmed:document.getElementById('calPlane')?.checked||false,reference:null};
 }
 function applyCorrections(){
  if(!currentResult)return;
  const cfg=config();
  if(cfg.view!=='rear'){
   status.textContent='Trace saved visually. Automatic recalculation is currently rear-view v4 only.';
   currentResult.ball_track.manual_trace_correction=true;setEditing(false);drawTracking(currentResult);return;
  }
  try{
   const recalculated=window.BurkeMeasurement.calculate(currentResult,cfg,{});
   recalculated.ball_track={...(recalculated.ball_track||{}),manual_trace_correction:true,manual_trace_points:observedIndices().length};
   currentResult=recalculated;renderDetection(recalculated);
   window.dispatchEvent(new CustomEvent('burkeshot-shot',{detail:{result:recalculated,club:els.club.value}}));
   window.dispatchEvent(new CustomEvent('burkeshot-analysis-complete',{detail:recalculated}));
   setReady(recalculated.measurement_status==='calibrated_estimate'?'ESTIMATE READY':'VIDEO ONLY','MANUALLY CORRECTED TRACE');
   setEditing(false);
   status.textContent=`Manual trace applied · ${observedIndices().length} observed points`;
   els.resultNote.textContent='Manual trace correction applied. Rear-view v4 numbers were recalculated from the corrected observed points.';
  }catch(err){status.textContent='Could not recalculate: '+err.message;}
 }

 editBtn.addEventListener('click',()=>{
  if(!currentResult||observedIndices().length<2)return;
  backup=clone(currentResult.ball_track.points);undoStack=[];setEditing(true);video.pause();
 });
 cancelBtn.addEventListener('click',()=>{if(backup&&currentResult){currentResult.ball_track.points=clone(backup);drawTracking(currentResult)}setEditing(false)});
 undoBtn.addEventListener('click',()=>{const last=undoStack.pop();if(!last||!currentResult)return;currentResult.ball_track.points[last.i]={...currentResult.ball_track.points[last.i],x:last.x,y:last.y};paint();status.textContent=undoStack.length?'Previous correction restored.':'Back to the first edit state.'});
 applyBtn.addEventListener('click',applyCorrections);

 canvas.addEventListener('pointerdown',e=>{
  if(!editing)return;e.preventDefault();dragIndex=nearestIndex(e);if(dragIndex<0){status.textContent='Touch closer to a yellow trace point.';return}
  const p=pts()[dragIndex];undoStack.push({i:dragIndex,x:Number(p.x),y:Number(p.y)});canvas.setPointerCapture?.(e.pointerId);paint();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!editing||dragIndex<0)return;e.preventDefault();const q=sourcePoint(e);if(!q)return;const p=pts()[dragIndex];p.x=q.x;p.y=q.y;p.kind=p.kind==='predicted'?'manual':p.kind;p.manual_corrected=true;paint();status.textContent=`Point ${dragIndex+1} corrected · frame ${p.frame}`;
 });
 const release=e=>{if(dragIndex>=0){canvas.releasePointerCapture?.(e.pointerId);dragIndex=-1;paint()}};
 canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);

 window.addEventListener('burkeshot-analysis-complete',e=>{
  if(editing)return;const r=e.detail,n=r?.ball_track?.points?.length||0;bar.hidden=n<2;if(n>=2){status.textContent=r?.ball_track?.manual_trace_correction?'Manual trace applied':'Auto-track ready';editBtn.hidden=false;undoBtn.hidden=true;applyBtn.hidden=true;cancelBtn.hidden=true;canvas.style.pointerEvents='none';}
 });
 window.addEventListener('burkeshot-preview-loaded',()=>{bar.hidden=true;backup=null;undoStack=[];setEditing(false)});
 window.addEventListener('resize',()=>{if(editing)requestAnimationFrame(paint)});
})();
