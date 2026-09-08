/* Burkeshot textured 3D range. Camera analysis remains in app.js. */
'use strict';
let rangeUnits='m',targetYards=150,aimDegrees=0,rangeShot=null;
const unitDistance=yd=>rangeUnits==='m'?yd*.9144:yd;
const hasNumber=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
function goPage(name){document.querySelector(`.main-tabs [data-page="${name}"]`).click()}
function flightForShot(speed,launch,carryYards){
 // A visual ballistic arc; it does not infer spin, sidespin or measured offline.
 const v=speed*.44704,angle=launch*Math.PI/180,T=Math.max(.25,2*v*Math.sin(angle)/9.80665);
 const ballisticCarry=v*Math.cos(angle)*T/.9144;
 const carry=hasNumber(carryYards)&&carryYards>0?carryYards:ballisticCarry;
 const a=aimDegrees*Math.PI/180,path=[];
 const apex=v*v*Math.sin(angle)**2/(2*9.80665);
 for(let i=0;i<=150;i++){const u=i/150,forward=carry*3*u;
  path.push({t:T*u,x:forward*Math.sin(a),y:4*apex*u*(1-u)/.3048,z:forward*Math.cos(a)});
 }
 return{path,carry,apexYards:apex/.9144};
}
function refreshRangeData(){
 document.querySelectorAll('.range-unit').forEach(e=>e.textContent=rangeUnits);
 $('targetDistance').textContent=Math.round(unitDistance(targetYards));$('mapScale').textContent=Math.round(unitDistance(350))+' '+rangeUnits;
 $('mapTarget').setAttribute('transform',`translate(0 ${102-targetYards/350*235})`);
 Array.from($('targetSelect').options).forEach(o=>o.textContent=Math.round(unitDistance(Number(o.value)))+' '+rangeUnits);
 if(!rangeShot)return;
 $('simCarry').textContent=fmt(unitDistance(rangeShot.flight.carry),1);
 $('simBall').textContent=fmt(rangeShot.speed,1);$('simLaunch').textContent=fmt(rangeShot.launch,1);
 $('simApex').textContent=fmt(unitDistance(rangeShot.flight.apexYards),1);
 $('simSource').textContent=rangeShot.manual?'MANUAL':rangeShot.demo?'DEMO':'VIDEO EST.';
 $('simModel').textContent=rangeShot.manual?'Entered readings · not camera data':rangeShot.demo?'Sample inputs · not saved':'Calibrated plane · no spin or drag';
 $('rangeSource').textContent=rangeShot.manual?'MANUALLY ENTERED SHOT':rangeShot.demo?'DEMO SHOT':rangeShot.club.toUpperCase()+' · CAMERA ESTIMATE';
}
function showRangeShot(shot){
 rangeShot={...shot,flight:flightForShot(shot.speed,shot.launch,shot.carry)};
 refreshRangeData();$('replayShotBtn').disabled=false;
 $('rangeHint').textContent=shot.manual?'Flight from your entered readings; curvature is not measured.':shot.demo?'Sample flight. Load a video to use your own shot.':'Flight uses camera speed and launch; curvature is not measured.';
 const r=ensureRange();if(!r)return;
 r.setAim(aimDegrees);r.playShot(rangeShot.flight.path,()=>{$('rangeHint').textContent=shot.manual?'Manual shot complete · replay or enter another shot.':shot.demo?'Demo complete · replay or load your own video.':'Shot complete · replay or analyse the next video.'});
 const p=rangeShot.flight.path.at(-1),x=80+p.x/3/350*235,y=229-p.z/3/350*235;
 $('mapTrace').setAttribute('d',`M80 229 L${x} ${y}`);$('mapLanding').setAttribute('cx',x);$('mapLanding').setAttribute('cy',y);$('mapLanding').setAttribute('visibility','visible');
}
function useCameraShot(){
 const m=currentResult?.metrics;
 const latest=m&&hasNumber(m.ball_speed_mph)&&hasNumber(m.launch_angle_deg)?{speed:m.ball_speed_mph,launch:m.launch_angle_deg,carry:m.estimated_carry_yards,club:club().name}:null;
 const saved=shots.find(s=>s.version===11&&s.measurementStatus==='calibrated_estimate'&&hasNumber(s.ballSpeed)&&hasNumber(s.launch));
 const s=latest||(!currentResult&&saved?{speed:saved.ballSpeed,launch:saved.launch,carry:saved.carry,club:saved.club}:null);
 goPage('simulator');
 if(s)showRangeShot({...s,demo:false});
 else{rangeShot=null;ensureRange()?.clearShot();['simCarry','simBall','simLaunch','simApex','simSource'].forEach(id=>$(id).textContent='—');$('replayShotBtn').disabled=true;$('mapTrace').setAttribute('d','');$('mapLanding').setAttribute('visibility','hidden');$('rangeSource').textContent='VIDEO TRACE ONLY · NO MEASURED FLIGHT';$('simModel').textContent='No calibrated shot data';$('rangeHint').textContent='Course is ready. Enter your own launch-monitor readings, or choose Demo shot to explore. Neither option measures this video.'}
}
$('viewRangeBtn').onclick=useCameraShot;
$('cameraFromRange').onclick=()=>goPage('camera');
$('demoShotBtn').onclick=()=>{
 const key=els.club.value;
 const demos={driver:[150,13,240],'3w':[139,14,217],'5w':[132,16,203],hybrid:[126,17,185],'4i':[122,15,178],'5i':[117,17,168],'6i':[111,19,155],'7i':[105,21,143],'8i':[98,24,130],'9i':[90,27,115],pw:[82,30,99],gw:[75,32,85],sw:[67,35,70],lw:[58,38,55]};
 const d=demos[key]||demos['7i'];showRangeShot({speed:d[0],launch:d[1],carry:d[2],club:club().name,demo:true});
};
$('replayShotBtn').onclick=()=>{if(rangeShot)showRangeShot(rangeShot)};
$('rangeSettings').onclick=()=>{const on=$('rangeOptions').hidden;$('rangeOptions').hidden=!on;$('rangeSettings').setAttribute('aria-expanded',String(on))};
$('rangeUnits').onchange=e=>{rangeUnits=e.target.value;refreshRangeData()};
$('targetSelect').onchange=e=>{targetYards=Number(e.target.value);ensureRange()?.setTarget(targetYards);refreshRangeData()};
$('traceToggle').onchange=e=>{const r=ensureRange();if(r)r.showTracer=e.target.checked};
function aim(delta){aimDegrees=Math.max(-15,Math.min(15,aimDegrees+delta));$('aimValue').textContent=(aimDegrees>0?'+':'')+aimDegrees+'°';ensureRange()?.setAim(aimDegrees)}
$('aimLeft').onclick=()=>aim(-1);$('aimRight').onclick=()=>aim(1);
$('resetRangeBtn').onclick=()=>{ensureRange()?.clearShot();rangeShot=null;['simCarry','simBall','simLaunch','simApex','simSource'].forEach(id=>$(id).textContent='—');$('rangeSource').textContent='NO SHOT LOADED';$('rangeHint').textContent='Load a camera video or try a demo shot.';$('replayShotBtn').disabled=true;$('mapTrace').setAttribute('d','');$('mapLanding').setAttribute('visibility','hidden')};
$('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{$('rangeHint').textContent='Fullscreen unavailable. Use F11 in your desktop browser.'}};
function clearCameraRange(){rangeShot=null;range?.clearShot();['simCarry','simBall','simLaunch','simApex','simSource'].forEach(id=>$(id).textContent='—');$('replayShotBtn').disabled=true;$('mapTrace').setAttribute('d','');$('mapLanding').setAttribute('visibility','hidden');$('rangeSource').textContent='NO CALIBRATED SHOT';$('simModel').textContent='Set up measurements in Shot';}
window.addEventListener('burkeshot-analysis-start',clearCameraRange);
window.addEventListener('burkeshot-shot',e=>{const m=e.detail.result.metrics||{};if(hasNumber(m.ball_speed_mph)&&hasNumber(m.launch_angle_deg)){rangeShot={speed:m.ball_speed_mph,launch:m.launch_angle_deg,carry:m.estimated_carry_yards,club:club().name,demo:false};rangeShot.flight=flightForShot(rangeShot.speed,rangeShot.launch,rangeShot.carry);refreshRangeData();$('replayShotBtn').disabled=false;$('rangeHint').textContent='Calibrated estimate loaded. Replay shows a no-spin ballistic flight.'}else clearCameraRange()});

function openShotEntry(){const d=$('shotEntryDialog');if(d?.showModal)d.showModal();else d?.setAttribute('open','')}
function closeShotEntry(){const d=$('shotEntryDialog');if(d?.close)d.close();else d?.removeAttribute('open')}
$('manualShotBtn').onclick=openShotEntry;$('closeShotEntry').onclick=closeShotEntry;
$('shotEntryForm').onsubmit=e=>{e.preventDefault();const speed=Number($('inputBallSpeed').value),launch=Number($('inputLaunch').value),carryMeters=Number($('inputCarry').value)||null,carry=carryMeters!=null?carryMeters/.9144:null;if(!(speed>0&&launch>0)){ $('shotEntryError').hidden=false;$('shotEntryError').textContent='Enter a positive ball speed and launch angle.';return }closeShotEntry();showRangeShot({speed,launch,carry,club:club().name,manual:true});};
function updateGraphicsStatus(){const r=ensureRange();if(!r)return;const quality=$('graphicsQuality').value;if(!r.isCompatibility)r.setQuality?.(quality);const status=r.getQualityStatus?.()||'Basic graphics';$('graphicsStatus').textContent=status;$('rendererBadge').textContent=status;}
$('graphicsQuality').onchange=updateGraphicsStatus;
$('save4kBtn').onclick=async()=>{
 const r=ensureRange();if(!r||r.isCompatibility||!r.export4K)return;
 const button=$('save4kBtn');button.disabled=true;$('graphicsStatus').textContent='Rendering 3840 × 2160 image…';
 try{const url=await r.export4K();const a=document.createElement('a');a.download='burkeshot-range-3840x2160.png';a.href=url;a.click();$('graphicsStatus').textContent='3840 × 2160 image sent to browser downloads.';}
 catch(e){$('graphicsStatus').textContent='Image export failed: '+e.message;}
 finally{button.disabled=!!r.error;}
};

const distanceLabels=[100,150,200,250,300].map(yd=>{const e=document.createElement('span');e.className='distance-label';$('rangeLabels').appendChild(e);return{yd,e}});
let lastLabelTime=0;
function labelLoop(t){requestAnimationFrame(labelLoop);if(t-lastLabelTime<60||!$('page-simulator').classList.contains('active'))return;lastLabelTime=t;
 const r=range;if(!r)return;
 const placed=[];for(const {yd,e} of distanceLabels){const p=r.project([-3.1,.08,yd/10]);e.textContent=Math.round(unitDistance(yd))+' '+rangeUnits;const visible=p?.visible&&!placed.some(q=>Math.abs(q.x-p.x)<65&&Math.abs(q.y-p.y)<28);e.style.display=visible?'block':'none';if(visible){placed.push(p);e.style.left=p.x+'px';e.style.top=p.y+'px'}}
}
// Camera is the V9 home screen. Defer the GPU-heavy range until the player
// actually opens Range or sends a shot there.
requestAnimationFrame(labelLoop);refreshRangeData();
// Keep compatible saved camera shots available for replay, without making up a shot on startup.
const previous=shots.find(s=>s.version===11&&s.measurementStatus==='calibrated_estimate'&&hasNumber(s.ballSpeed)&&hasNumber(s.launch));
if(previous){rangeShot={speed:previous.ballSpeed,launch:previous.launch,carry:previous.carry,club:previous.club,demo:false};rangeShot.flight=flightForShot(rangeShot.speed,rangeShot.launch,rangeShot.carry);refreshRangeData();$('replayShotBtn').disabled=false;$('rangeHint').textContent='Last camera shot loaded. Select Replay shot to view it.'}
