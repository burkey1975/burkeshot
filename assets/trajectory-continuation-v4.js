'use strict';
(function installTrajectoryContinuationV4(){
 const finite=v=>Number.isFinite(Number(v));
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const median=a=>{const b=(a||[]).filter(finite).map(Number).sort((x,y)=>x-y);if(!b.length)return null;const m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};

 function cleanMeasured(points){
  return (points||[]).filter(p=>p&&p.kind!=='predicted'&&p.kind!=='interpolated'&&p.kind!=='address'&&finite(p.x)&&finite(p.y)&&Number.isInteger(p.frame)).sort((a,b)=>a.frame-b.frame);
 }
 function stripContinuation(result){
  if(!result?.ball_track?.points)return;
  result.ball_track.points=result.ball_track.points.filter(p=>!(p&&p.kind==='predicted'&&p.prediction_source==='trajectory_continuation_v4'));
  delete result.ball_track.predicted_count;
  delete result.ball_track.continuation_v4;
 }
 function buildContinuation(result){
  if(!result?.ball_track?.points||!result?.video)return result;
  stripContinuation(result);
  const measured=cleanMeasured(result.ball_track.points);
  if(measured.length<4)return result;
  const recent=measured.slice(-Math.min(6,measured.length));
  const frameSteps=[];
  for(let i=1;i<recent.length;i++){const d=recent[i].frame-recent[i-1].frame;if(d>0&&d<=5)frameSteps.push(d)}
  const frameStep=Math.max(1,Math.round(median(frameSteps)||1));
  const vx=[],vy=[];
  for(let i=1;i<recent.length;i++){const a=recent[i-1],b=recent[i],df=b.frame-a.frame;if(df<=0)continue;vx.push((Number(b.x)-Number(a.x))/df);vy.push((Number(b.y)-Number(a.y))/df)}
  let dx=median(vx),dy=median(vy);if(!finite(dx)||!finite(dy)||Math.hypot(dx,dy)<.25)return result;
  let ax=0,ay=0;
  if(vx.length>=2){const dax=[],day=[];for(let i=1;i<vx.length;i++){dax.push(vx[i]-vx[i-1]);day.push(vy[i]-vy[i-1])}ax=clamp(median(dax)||0,-Math.abs(dx)*.12,Math.abs(dx)*.12);ay=clamp(median(day)||0,-Math.max(.25,Math.abs(dy)*.14),Math.max(.25,Math.abs(dy)*.14))}
  const last=recent.at(-1),width=Number(result.video.width),height=Number(result.video.height);if(!(width>0&&height>0))return result;
  const predicted=[];let x=Number(last.x),y=Number(last.y),vxNow=dx,vyNow=dy;
  for(let n=1;n<=12;n++){vxNow=(vxNow+ax)*.985;vyNow=(vyNow+ay)*.985;x+=vxNow*frameStep;y+=vyNow*frameStep;if(x<-20||x>width+20||y<-20||y>height+20)break;predicted.push({x,y,frame:last.frame+n*frameStep,kind:'predicted',predicted:true,prediction_source:'trajectory_continuation_v4',detector_quality:0,time_s:finite(last.time_s)?Number(last.time_s)+n*frameStep/(Number(result.video.encoded_fps)||30):undefined})}
  if(!predicted.length)return result;
  result.ball_track.points=[...result.ball_track.points,...predicted].sort((a,b)=>(a.frame||0)-(b.frame||0));
  result.ball_track.predicted_count=predicted.length;
  result.ball_track.continuation_v4={source_points:recent.length,predicted_points:predicted.length,frame_step:frameStep,initial_dx_per_frame:dx,initial_dy_per_frame:dy,note:'Visual continuation only. Predicted points are excluded from speed/launch measurement.'};
  return result;
 }
 function installDrawOverlay(){
  if(typeof window.drawTracking!=='function'||window.__burkeshotContinuationDrawInstalled)return;
  const original=window.drawTracking;
  window.drawTracking=function(r){
   const all=r?.ball_track?.points||[],predicted=all.filter(p=>p?.kind==='predicted'&&p.prediction_source==='trajectory_continuation_v4'&&finite(p.x)&&finite(p.y));
   // Core drawTracking predates continuation and would paint predicted points solid red.
   // Temporarily present only observed points to it, then restore the complete data.
   if(predicted.length&&r?.ball_track){r.ball_track.points=all.filter(p=>p?.kind!=='predicted');try{original(r)}finally{r.ball_track.points=all}}else original(r);
   if(!predicted.length)return;
   const measured=cleanMeasured(all);if(!measured.length)return;
   const anchor=measured.at(-1),v=r.video||{},canvas=els.tracking,g=canvasGeom(canvas,v.width||512,v.height||910),c=g.c,P=q=>({x:g.ox+Number(q.x)*g.scale,y:g.oy+Number(q.y)*g.scale});
   const seq=[anchor,...predicted].map(P);
   c.save();c.strokeStyle='#ffb020';c.lineWidth=2.5;c.setLineDash([7,7]);c.lineCap='round';c.lineJoin='round';c.globalAlpha=.9;c.beginPath();c.moveTo(seq[0].x,seq[0].y);for(let i=1;i<seq.length;i++)c.lineTo(seq[i].x,seq[i].y);c.stroke();c.setLineDash([]);predicted.forEach((p,i)=>{const q=P(p);c.fillStyle='#ffb020';c.globalAlpha=i===predicted.length-1?.85:.55;c.beginPath();c.arc(q.x,q.y,i===predicted.length-1?3.2:1.8,0,Math.PI*2);c.fill()});c.restore();
  };
  window.__burkeshotContinuationDrawInstalled=true;
 }
 function updateUi(r){const n=r?.ball_track?.predicted_count||0,status=document.getElementById('traceEditStatus');if(status&&n)status.textContent=`Auto-track ready · +${n} predicted continuation points`;if(n&&els?.tracePoints)els.tracePoints.textContent=`${cleanMeasured(r.ball_track.points).length} measured + ${n} predicted`}
 function process(r){if(!r?.ball_track?.points)return;buildContinuation(r);installDrawOverlay();if(typeof window.drawTracking==='function')window.drawTracking(r);updateUi(r)}
 window.BurkeTrajectoryContinuationV4={build:buildContinuation,strip:stripContinuation};
 window.addEventListener('burkeshot-analysis-complete',e=>process(e.detail));
 installDrawOverlay();
})();
