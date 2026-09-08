 'use strict';
const $=id=>document.getElementById(id);
const fmt=(v,d=1)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(d);
const pct=v=>v==null?'—':Math.round(Number(v)*100)+'%';

const CLUBS={
 driver:{name:'Driver',spin:2400},'3w':{name:'3 Wood',spin:3300},'5w':{name:'5 Wood',spin:3800},hybrid:{name:'Hybrid',spin:4200},
 '4i':{name:'4 Iron',spin:4500},'5i':{name:'5 Iron',spin:4900},'6i':{name:'6 Iron',spin:5300},'7i':{name:'7 Iron',spin:5800},
 '8i':{name:'8 Iron',spin:6500},'9i':{name:'9 Iron',spin:7300},pw:{name:'PW',spin:8200},gw:{name:'GW',spin:9000},sw:{name:'SW',spin:9600},lw:{name:'LW',spin:10000}
};

const els={
 club:$('clubSelect'),readyTitle:$('readyTitle'),readySub:$('readySub'),
 video:$('video'),still:$('impactStill'),tracking:$('trackingCanvas'),file:$('fileInput'),capture:$('captureMode'),profile:$('ballProfile'),
 test240:$('test240'),test120:$('test120'),setupToggle:$('setupToggle'),setupGuide:$('setupGuide'),cameraState:$('cameraState'),
 loader:$('analysisLoader'),stage:$('analysisStage'),progress:$('progressBar'),warning:$('cameraWarning'),headline:$('cameraHeadline'),message:$('cameraMessage'),
 resultClub:$('resultClub'),quality:$('quality'),carry:$('carry'),carryLabel:$('carryLabel'),ballSpeed:$('ballSpeed'),launch:$('launch'),
 clubSpeed:$('clubSpeed'),smash:$('smash'),attack:$('attack'),tracePoints:$('tracePoints'),ballLock:$('ballLock'),impactLock:$('impactLock'),geometry:$('geometry'),
 resultNote:$('resultNote'),reanalyse:$('reanalyseBtn'),resetZone:$('resetBallZone'),viewRangeBtn:$('viewRangeBtn'),
 sessionShots:$('sessionShots'),avgBall:$('avgBall'),avgCarry:$('avgCarry'),bestCarry:$('bestCarry'),scatter:$('scatterCanvas'),clubAverages:$('clubAverages'),
 history:$('historyList'),shotCount:$('shotCount'),clearSession:$('clearSession'),
 smartShotBar:$('smartShotBar'),smartShotNo:$('smartShotNo'),smartClub:$('smartClub'),smartCarry:$('smartCarry'),smartBall:$('smartBall'),smartLaunch:$('smartLaunch'),
 coachVideo:$('coachVideo'),coachEmpty:$('coachEmpty'),coachLoader:$('coachLoader'),coachFile:$('coachFile'),coachView:$('coachView'),coachHand:$('coachHand'),
 coachScore:$('coachScore'),coachEngine:$('coachEngine'),coachNote:$('coachNote'),coachPhases:$('coachPhases'),coachCheckpoints:$('coachCheckpoints'),coachTips:$('coachTips'),
 rangeCanvas:$('rangeCanvas'),simCarry:$('simCarry'),simBall:$('simBall'),simLaunch:$('simLaunch'),demo:$('demoShotBtn')
};

let currentFile=null,currentURL=null,currentResult=null,currentLabel='';
function readSaved(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
let ballHint=readSaved('burkeshot_v5_ball_hint',null);
let shots=readSaved('burkeshot_v5_shots',[]);if(!Array.isArray(shots))shots=[];
let fakeTimer=null,coachURL=null;
let range=null;let analysisBusy=false;window.burkeshotReplayMode=false;

function club(){return CLUBS[els.club.value]||CLUBS['7i']}

function setReady(title,sub,bad=false){
 els.readyTitle.textContent=title;els.readySub.textContent=sub;
 const c=bad?'var(--red)':'var(--green)';
 els.readyTitle.style.color=c;document.querySelector('.ready>i').style.background=c;
}
function cameraState(title,sub,bad=false){
 const b=els.cameraState.querySelector('b'),s=els.cameraState.querySelector('span'),i=els.cameraState.querySelector('i');
 b.textContent=title;s.textContent=sub;
 const c=bad?'var(--red)':'var(--green)';b.style.color=c;i.style.background=c;
}
function captureCfg(){return els.capture.value==='240_slo'?{fps:240,mode:'240_slo'}:els.capture.value==='120_slo'?{fps:120,mode:'120_slo'}:{fps:120,mode:'real_auto'}}
function clearMetrics(){
 ['carry','ballSpeed','launch'].forEach(k=>els[k].textContent='—');
 els.clubSpeed.textContent='— mph';els.smash.textContent='—';els.attack.textContent='—°';els.tracePoints.textContent='— pts';
 els.ballLock.textContent='—';els.impactLock.textContent='—';els.geometry.textContent='—';els.quality.textContent='—';
 els.smartShotBar.classList.add('idle');els.smartShotNo.textContent='NEXT SHOT';els.smartClub.textContent=club().name.toUpperCase();
 els.smartCarry.textContent='—';els.smartBall.textContent='—';els.smartLaunch.textContent='—';
}
function showLoader(on){
 els.loader.hidden=!on;
 if(!on){clearInterval(fakeTimer);fakeTimer=null;return}
 let p=7;els.progress.style.width=p+'%';
 const stages=['Finding golf ball…','Confirming hitting zone…','Detecting impact…','Following launch streak…','Recovering missed frames…','Calculating shot data…'];
 let i=0;els.stage.textContent=stages[0];
 fakeTimer=setInterval(()=>{p=Math.min(91,p+Math.random()*8);els.progress.style.width=p+'%';if(i<stages.length-1&&p>(i+1)*14){i++;els.stage.textContent=stages[i]}},420);
}
function loadPreview(f){
 currentFile=f;currentLabel=f.name;
 if(currentURL)URL.revokeObjectURL(currentURL);currentURL=URL.createObjectURL(f);
 els.setupGuide.classList.add('hidden');els.video.src=currentURL;els.video.style.display='block';els.still.style.display='none';els.video.pause();window.dispatchEvent(new CustomEvent('burkeshot-preview-loaded'));
}
function canvasGeom(canvas,sw,sh){
 const r=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;
 canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));
 const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
 const scale=Math.min(r.width/sw,r.height/sh);
 return{r,c,scale,ox:(r.width-sw*scale)/2,oy:(r.height-sh*scale)/2};
}
function drawTracking(r){
 const v=r.video||{},g=canvasGeom(els.tracking,v.width||512,v.height||910),c=g.c;c.clearRect(0,0,g.r.width,g.r.height);
 const P=q=>({x:g.ox+q.x*g.scale,y:g.oy+q.y*g.scale}),ball=r.ball,frame=els.video.currentTime*(r.video?.encoded_fps||30),allPts=r.ball_track?.points||[],pts=window.burkeshotReplayMode?allPts.filter(p=>p.frame<=frame+.6):allPts;
 if(ball){
   const q=P(ball),rad=Math.max(8,(ball.diameter_px||12)*g.scale*.9);
   c.strokeStyle='#a8ff32';c.lineWidth=3;c.shadowColor='#a8ff32';c.shadowBlur=8;c.beginPath();c.arc(q.x,q.y,rad,0,Math.PI*2);c.stroke();c.shadowBlur=0;
 }
 if(pts.length>1){
   const sp=pts.map(P);
   c.save();c.strokeStyle='#ff3b30';c.lineWidth=6;c.lineCap='round';c.lineJoin='round';c.shadowColor='#ff3b30';c.shadowBlur=8;
   c.beginPath();c.moveTo(sp[0].x,sp[0].y);for(let i=1;i<sp.length;i++)c.lineTo(sp[i].x,sp[i].y);c.stroke();c.restore();
   sp.forEach((q,i)=>{c.fillStyle=i===0?'#fff':'#ff3b30';c.beginPath();c.arc(q.x,q.y,i===0?4:2.5,0,Math.PI*2);c.fill()});

 }
}
function renderDetection(r){
 const b=r.ball||{},im=r.impact||{},bt=r.ball_track||{},m=r.metrics||{};
 els.ballLock.textContent=b.x!=null?pct(b.confidence):'NO';
 els.impactLock.textContent=im.contact_frame!=null?pct(im.confidence):'NO';
 els.tracePoints.textContent=(bt.points?.length||0)+' pts';
 els.geometry.textContent=r.camera_geometry==='side_on_ok'?'SIDE-ON':r.camera_geometry==='not_side_on'?'ANGLE':'UNKNOWN';
 els.quality.textContent=pct(r.confidence);
 els.resultClub.textContent=club().name.toUpperCase();
 els.carry.textContent=fmt(m.estimated_carry_yards,0);
 els.ballSpeed.textContent=fmt(m.ball_speed_mph,1);
 els.launch.textContent=fmt(m.launch_angle_deg,1);
 els.smartShotBar.classList.remove('idle');els.smartShotNo.textContent=`SHOT #${shots.length+1}`;els.smartClub.textContent=club().name.toUpperCase();
 els.smartCarry.textContent=fmt(m.estimated_carry_yards,0);els.smartBall.textContent=fmt(m.ball_speed_mph,1);els.smartLaunch.textContent=fmt(m.launch_angle_deg,1);
 els.clubSpeed.textContent=m.club_speed_mph==null?'— mph':fmt(m.club_speed_mph,1)+' mph';
 els.smash.textContent=fmt(m.smash_factor,2);
 els.attack.textContent=m.attack_angle_deg==null?'—°':fmt(m.attack_angle_deg,1)+'°';
 els.carryLabel.textContent=m.estimated_carry_yards==null?'Trace only — no calibrated carry':'Estimated from camera launch data';

 if(b.normalized_x!=null){
   ballHint={x:b.normalized_x,y:b.normalized_y};localStorage.setItem('burkeshot_v5_ball_hint',JSON.stringify(ballHint));
 }
 if(r.impact_image){els.still.src=r.impact_image}
 drawTracking(r);

 const recovery=!!bt.recovery_used;
 cameraState(b.x!=null?(recovery?'BALL RECOVERED':'BALL LOCKED'): 'NO BALL',
   im.contact_frame!=null?(recovery?'TRACK RECOVERY ACTIVE':'SHOT DETECTED'):'CHECK SETUP',b.x==null);
 els.headline.textContent=recovery?'TRACK RECOVERY COMPLETE':'SHOT ANALYSIS';
 els.message.textContent=recovery?'BURKESHOT reacquired the post-impact ball streak after the primary tracker lost it.':'Measured trajectory is drawn directly over the video.';

 const warnings=r.warnings||[];
 if(warnings.length){els.warning.hidden=false;els.warning.textContent=warnings.join(' ');els.resultNote.textContent=warnings[0]}
 else{els.warning.hidden=true;els.resultNote.textContent='Displayed measurements passed the current confidence checks.'}
}
async function analyse(f,label){
 if(!f||analysisBusy)return;
 analysisBusy=true;[els.file,els.test240,els.test120,els.reanalyse,els.club,els.capture,els.profile].forEach(e=>e.disabled=true);
 currentFile=f;currentLabel=label||f.name;currentResult=null;clearMetrics();els.warning.hidden=true;
 window.dispatchEvent(new CustomEvent('burkeshot-analysis-start'));
 setReady('ANALYSING','AUTOMATIC SHOT DETECTION');cameraState('MEASURING','AUTOMATIC BALL SEARCH');showLoader(true);
 const cfg=captureCfg(),ext=f.name?.includes('.')?'.'+f.name.split('.').pop():'.mp4';
 let q=`capture_fps=${cfg.fps}&capture_mode=${cfg.mode}&distance_factor=${els.profile.value}`;
 if(ballHint)q+=`&ball_hint_x=${ballHint.x}&ball_hint_y=${ballHint.y}`;
 try{
   const res=await fetch('/api/analyze?'+q,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Ext':ext},body:f});
   let r=await res.json();if(!res.ok||r.error)throw new Error(r.error||'Analysis failed');
   if(window.burkeshotMeasureResult)r=window.burkeshotMeasureResult(r);
   currentResult=r;renderDetection(r);window.dispatchEvent(new CustomEvent('burkeshot-shot',{detail:{result:r,club:els.club.value}}));setReady(r.measurement_status==='calibrated_estimate'?'ESTIMATE READY':'VIDEO ONLY','CALIBRATION & TRACKING');
   if(r.impact&&r.video?.encoded_fps){els.video.currentTime=Math.max(0,(r.impact.contact_frame-12)/r.video.encoded_fps);els.video.pause();drawTracking(r)}
 }catch(e){
   els.warning.hidden=false;els.warning.textContent='BURKESHOT could not analyse this video: '+e.message;
   cameraState('ERROR','ANALYSIS FAILED',true);setReady('ERROR','CHECK CAMERA ENGINE',true);
 }finally{showLoader(false);els.progress.style.width='100%';analysisBusy=false;[els.file,els.test240,els.test120,els.reanalyse,els.club,els.capture,els.profile].forEach(e=>e.disabled=false);window.dispatchEvent(new CustomEvent('burkeshot-analysis-complete',{detail:currentResult}));}
}
function loadSample(name,mode){
 els.capture.value=mode;
 fetch('sample/'+name).then(r=>{if(!r.ok)throw Error('Sample request failed');return r.blob()}).then(b=>{const f=new File([b],name,{type:'video/mp4'});loadPreview(f);analyse(f,name)}).catch(()=>{els.warning.hidden=false;els.warning.textContent='Sample video could not be loaded.'});
}
function saveShot(r,label){
 const m=r.metrics||{},bt=r.ball_track||{},item={
   id:Date.now(),date:new Date().toISOString(),club:club().name,label:label||currentLabel,
   carry:m.estimated_carry_yards,ballSpeed:m.ball_speed_mph,launch:m.launch_angle_deg,clubSpeed:m.club_speed_mph,
   smash:m.smash_factor,attack:m.attack_angle_deg,confidence:r.confidence,trace:bt.points?.length||0,
   measurementStatus:r.measurement_status,source:r.measurement_source,calibration:r.calibration,version:11
 };
 shots.unshift(item);shots=shots.slice(0,80);localStorage.setItem('burkeshot_v5_shots',JSON.stringify(shots));renderSession();
}

/* Session */
function avg(arr){const a=arr.filter(v=>v!=null&&Number.isFinite(Number(v))).map(Number);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function renderSession(){
 els.sessionShots.textContent=shots.length;els.shotCount.textContent=`${shots.length} shot${shots.length===1?'':'s'}`;
 els.avgBall.textContent=fmt(avg(shots.map(s=>s.ballSpeed)),1);
 els.avgCarry.textContent=fmt(avg(shots.map(s=>s.carry)),0);
 const carries=shots.map(s=>s.carry).filter(v=>v!=null);els.bestCarry.textContent=carries.length?fmt(Math.max(...carries),0):'—';

 const groups={};
 shots.forEach(s=>{groups[s.club]=groups[s.club]||[];groups[s.club].push(s)});
 els.clubAverages.innerHTML='<div class="club-row head"><span>CLUB</span><span>SHOTS</span><span>AVG CARRY</span><span>AVG BALL</span></div>';
 Object.entries(groups).forEach(([name,arr])=>{
   const carry=avg(arr.map(x=>x.carry)),d=document.createElement('div');d.className='club-row';
   d.style.setProperty('--club-distance',Math.max(4,Math.min(100,(carry||0)/260*100))+'%');
   d.innerHTML=`<b>${name}</b><span>${arr.length}</span><span>${fmt(carry,0)} yd</span><span>${fmt(avg(arr.map(x=>x.ballSpeed)),1)} mph</span>`;
   els.clubAverages.appendChild(d);
 });
 els.history.innerHTML='';
 if(!shots.length)els.history.innerHTML='<div class="session-empty"><b>No shots yet</b><span>Load a swing video from Camera to start this session.</span></div>';
 shots.slice(0,40).forEach((s,index)=>{const d=document.createElement('article'),date=new Date(s.date);d.className='shot-item';d.innerHTML=`<div class="shot-number"><span>${shots.length-index}</span></div><div class="shot-main"><small>${date.toLocaleDateString([], {day:'2-digit',month:'2-digit'})} ${date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · ${s.club}</small><strong>${s.carry!=null?Math.round(s.carry):'—'}<em>yd</em></strong></div><div class="shot-stat"><span>BALL SPEED</span><b>${s.ballSpeed!=null?fmt(s.ballSpeed,1):'—'} <em>mph</em></b></div><div class="shot-stat"><span>LAUNCH ANGLE</span><b>${s.launch!=null?fmt(s.launch,1):'—'} <em>°</em></b></div><button class="delete-shot" data-shot-id="${s.id}" aria-label="Delete shot ${shots.length-index}">×</button>`;els.history.appendChild(d)});
 els.history.querySelectorAll('.delete-shot').forEach(b=>b.onclick=()=>{shots=shots.filter(s=>String(s.id)!==b.dataset.shotId);localStorage.setItem('burkeshot_v5_shots',JSON.stringify(shots));renderSession()});
 drawScatter();
}
function drawScatter(){
 const r=els.scatter.getBoundingClientRect(),dpr=devicePixelRatio||1;els.scatter.width=Math.round(r.width*dpr);els.scatter.height=Math.round(r.height*dpr);
 const c=els.scatter.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);
 const pad={l:48,r:18,t:18,b:35},w=r.width-pad.l-pad.r,h=r.height-pad.t-pad.b;
 c.strokeStyle='#303736';c.lineWidth=1;c.font='12px Segoe UI';c.fillStyle='#7f8985';
 for(let i=0;i<=5;i++){const y=pad.t+h*i/5;c.beginPath();c.moveTo(pad.l,y);c.lineTo(pad.l+w,y);c.stroke();c.fillText(String(30-i*6)+'°',8,y+3)}
 for(let i=0;i<=5;i++){const x=pad.l+w*i/5;c.beginPath();c.moveTo(x,pad.t);c.lineTo(x,pad.t+h);c.stroke();c.fillText(String(70+i*20),x-8,r.height-10)}
 c.fillText('Ball speed (mph)',pad.l+w/2-28,r.height-3);
 const pts=shots.filter(s=>s.ballSpeed!=null&&s.launch!=null);
 pts.forEach((s,i)=>{const x=pad.l+(Math.max(70,Math.min(170,s.ballSpeed))-70)/100*w;const y=pad.t+(30-Math.max(0,Math.min(30,s.launch)))/30*h;c.fillStyle=i===0?'#dfff55':'#a8ff32aa';c.beginPath();c.arc(x,y,i===0?5:3.5,0,Math.PI*2);c.fill()});
}

/* Coach */
function coachLoadPreview(f){if(coachURL)URL.revokeObjectURL(coachURL);coachURL=URL.createObjectURL(f);els.coachVideo.src=coachURL;els.coachEmpty.hidden=true;els.coachVideo.play().catch(()=>{})}
function renderCoach(r){
 els.coachScore.textContent=r.score==null?'—':r.score;els.coachEngine.textContent=r.pose_available?'33-POINT POSE':'MOTION ONLY';els.coachNote.textContent=r.note||'';
 els.coachPhases.innerHTML='';(r.phases||[]).forEach(ph=>{const d=document.createElement('div');d.className='coach-phase';d.innerHTML=`${ph.image?`<img src="${ph.image}">`:''}<div><b>${ph.name}</b><span>FRAME ${ph.frame}</span></div>`;els.coachPhases.appendChild(d)});
 els.coachCheckpoints.innerHTML='';if(!(r.checkpoints||[]).length)els.coachCheckpoints.innerHTML='<div style="font-size:14px;color:#7e8884">Install the optional MediaPipe Coach Engine for body checkpoints.</div>';
 else r.checkpoints.forEach(cp=>{const d=document.createElement('div');d.className='coach-cp '+(cp.status==='IN RANGE'?'good':'');d.innerHTML=`<span>${cp.name}</span><b>${cp.value==null?'—':cp.value+' '+cp.unit}</b><em>${cp.status}</em><small>baseline ${cp.band}</small>`;els.coachCheckpoints.appendChild(d)});
 els.coachTips.innerHTML='';(r.tips||[]).forEach(t=>{const li=document.createElement('li');li.textContent=t;els.coachTips.appendChild(li)});
}
async function analyseCoach(f){
 els.coachLoader.hidden=false;const ext=f.name?.includes('.')?'.'+f.name.split('.').pop():'.mp4';const q=`handedness=${els.coachHand.value}&view=${els.coachView.value}`;
 try{const res=await fetch('/api/coach?'+q,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Ext':ext},body:f});const r=await res.json();if(!res.ok||r.error)throw new Error(r.error||'Coach failed');renderCoach(r)}
 catch(e){els.coachNote.textContent='Coach analysis failed: '+e.message}finally{els.coachLoader.hidden=true}
}

/* Simulator */
function ensureRange(){
 if(range)return range;
 try{range=new BurkeRangeHD(els.rangeCanvas)}
 catch(e){console.info("WebGL renderer unavailable; using compatibility renderer");try{
   const old=els.rangeCanvas,fresh=old.cloneNode();old.replaceWith(fresh);els.rangeCanvas=fresh;
   range=new BurkeSoftwareRange(fresh);$('rangeHint').textContent='Basic graphics: WebGL2 is unavailable. Enable hardware acceleration in Chrome or Edge for the textured course.';range.isCompatibility=true;
 }catch(failure){$('rangeError').hidden=false;$('rangeError').textContent='Range graphics could not start. Try Chrome or Edge with hardware acceleration. Camera and Coach remain available.';return null}}

 const graphicsMessage=()=>{
   const status=range.getQualityStatus?.()||'Basic graphics';
   $('graphicsStatus').textContent=status;$('rendererBadge').textContent=status;
   $('save4kBtn').disabled=!!(range.isCompatibility||range.loading||range.error);
   $('graphicsQuality').disabled=!!range.isCompatibility;
   if(range.error){$('rangeError').hidden=false;$('rangeError').textContent=range.error.message+' Camera and Coach remain available.';}
 };
 els.rangeCanvas.addEventListener('graphics-status',graphicsMessage);
 range.ready?.then(graphicsMessage).catch(graphicsMessage);graphicsMessage();
 return range;
}
/* UI */
document.querySelectorAll('.main-tabs button,.mobile-nav button').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===b.dataset.page));
 document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));$('page-'+b.dataset.page).classList.add('active');
 window.scrollTo({top:0,behavior:'instant'});
 if(b.dataset.page==='session')renderSession();
 if(b.dataset.page==='simulator'){ensureRange();setTimeout(()=>window.dispatchEvent(new Event('resize')),40)}
});
document.querySelectorAll('[data-session-view]').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('[data-session-view]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',String(active))});
 document.querySelectorAll('[data-session-panel]').forEach(x=>x.hidden=x.dataset.sessionPanel!==b.dataset.sessionView);
 if(b.dataset.sessionView==='graph')requestAnimationFrame(drawScatter);
});
els.file.onchange=e=>{const f=e.target.files?.[0];if(f){loadPreview(f);analyse(f,f.name)}};
els.test240.onclick=()=>loadSample('IMG_3988.mp4','240_slo');
els.test120.onclick=()=>loadSample('IMG_3983.mp4','original');
els.reanalyse.onclick=()=>{if(currentFile)analyse(currentFile,currentLabel)};
els.resetZone.onclick=()=>{ballHint=null;localStorage.removeItem('burkeshot_v5_ball_hint');els.resultNote.textContent='Learned ball zone reset. The next shot will establish a new ball location.'};
els.setupToggle.onclick=()=>{els.setupGuide.classList.toggle('hidden')};
els.club.onchange=()=>{els.resultClub.textContent=club().name.toUpperCase();els.smartClub.textContent=club().name.toUpperCase()};
els.clearSession.onclick=()=>{shots=[];localStorage.removeItem('burkeshot_v5_shots');renderSession()};
els.coachFile.onchange=e=>{const f=e.target.files?.[0];if(f){coachLoadPreview(f);analyseCoach(f)}};

document.querySelectorAll('.sim-cameras button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.sim-cameras button').forEach(x=>x.classList.remove('active'));b.classList.add('active');ensureRange()?.setView(b.dataset.view)});
window.addEventListener('resize',()=>{if(currentResult)drawTracking(currentResult);if(document.querySelector('#page-session.active'))drawScatter()});

clearMetrics();renderSession();setReady('READY','LOAD A SHOT');
