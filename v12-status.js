'use strict';
document.querySelectorAll('.mobile-nav button').forEach(b=>{b.lastChild.textContent={simulator:'Course',camera:'Shot',session:'Records',coach:'Swing'}[b.dataset.page]});
const warningObserver=new MutationObserver(()=>{if(!els.warning.hidden&&els.warning.textContent&&!currentResult)els.resultNote.textContent=els.warning.textContent});
warningObserver.observe(els.warning,{attributes:true,childList:true,subtree:true});
fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(r=>{
 if(r.version!==12)els.resultNote.textContent='An older server is running. Close its console and run START_BURKESHOT_V12.bat.';
 else if(!r.camera_engine)els.resultNote.textContent='Camera dependencies are missing. Run INSTALL_CAMERA_ENGINE.bat.';
}).catch(()=>{els.resultNote.textContent='Camera service is disconnected. Run START_BURKESHOT_V12.bat; opening the HTML alone does not analyse videos.';});

/* Experimental rear-view perspective measurement. Side-on remains unchanged. */
(function installRearViewExperiment(){
 if(!window.BurkeMeasurement||typeof window.BurkeMeasurement.calculate!=='function')return;
 const normalCalculate=window.BurkeMeasurement.calculate.bind(window.BurkeMeasurement);
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const median=a=>{const b=[...a].sort((x,y)=>x-y);if(!b.length)return null;const m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};
 const BALL_DIAMETER_M=0.04267;
 const MPS_TO_MPH=2.2369362921;
 const emptyMetrics=()=>({ball_speed_mph:null,club_speed_mph:null,launch_angle_deg:null,attack_angle_deg:null,smash_factor:null,estimated_carry_yards:null,estimated_height_yards:null,estimated_total_yards:null,launch_direction_deg:null});

 function pairMedianSlope(samples,key){
  const values=[];
  for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++){
   const dt=samples[j].t-samples[i].t;
   if(dt>=0.006&&dt<=0.08)values.push((samples[j][key]-samples[i][key])/dt);
  }
  return median(values);
 }

 function rearEstimate(raw,config={}){
  const result={...raw,metrics:emptyMetrics(),measurement_status:'video_only',status:'trace_only',measurement_reasons:{},measurement_source:'Experimental rear-view perspective estimate'};
  const reasons=result.measurement_reasons;
  const stop=message=>{for(const key of ['ball','launch','club','carry'])reasons[key]=message;result.warnings=[message];return result};
  if(!raw?.video||!raw?.ball||!raw?.ball_track)return stop('Load and analyse a video first.');

  const distance=Number(document.getElementById('rearDistance')?.value);
  const cameraHeight=Number(document.getElementById('rearHeight')?.value);
  if(!finite(distance)||distance<1||distance>8)return stop('Enter the measured horizontal distance from the camera lens to the ball (1–8 m).');
  if(!finite(cameraHeight)||cameraHeight<0.3||cameraHeight>2.5)return stop('Enter the camera lens height above the hitting surface (0.3–2.5 m).');

  let fps;
  if(config.timing==='original'){
   fps=Number(raw.video.encoded_fps);
   if(!finite(fps)||fps<90||fps>300)return stop('Rear-view measurement needs the original 90–300 fps file, or a confirmed 120/240 fps slow-motion recording.');
  }else if(['120_slo','240_slo'].includes(config.timing)&&config.timingConfirmed){
   fps=config.timing==='120_slo'?120:240;
  }else return stop('Confirm the 120/240 fps slow-motion mapping before calculating rear-view numbers.');

  const anchorX=Number(raw.ball.x),anchorY=Number(raw.ball.y);
  const slant0=Math.hypot(distance,cameraHeight);
  const pitch=Math.atan2(cameraHeight,distance);
  const times=raw.video.frame_times_s||[];
  const impact=Number(raw.impact?.contact_frame);
  const impactTime=finite(times[impact])?times[impact]:impact/fps;

  let points=(raw.ball_track.points||[]).filter(p=>p&&p.kind!=='address'&&p.kind!=='predicted'&&p.kind!=='interpolated'&&finite(p.x)&&finite(p.y)&&Number.isInteger(p.frame)&&p.frame>impact&&finite(Number(p.blob_w))&&finite(Number(p.blob_h)));
  points=points.slice(0,10);
  if(points.length<4)return stop('Rear-view 3-D estimate needs at least four accepted Ronde ball observations just after impact.');

  const firstWidths=points.slice(0,Math.min(3,points.length)).map(p=>Math.min(Number(p.blob_w),Number(p.blob_h))).filter(v=>finite(v)&&v>=1.5);
  const effectiveBallPx=median(firstWidths);
  if(!finite(effectiveBallPx)||effectiveBallPx<1.5)return stop('The tracked ball is too small to estimate perspective depth in this clip.');

  const focalPx=effectiveBallPx*slant0/BALL_DIAMETER_M;
  const samples=[];
  for(const p of points){
   const minor=Math.min(Number(p.blob_w),Number(p.blob_h));
   const aspect=Math.max(Number(p.blob_w),Number(p.blob_h))/Math.max(1,minor);
   if(!finite(minor)||minor<1.25||minor>effectiveBallPx*1.8||aspect>14)continue;
   const slant=slant0*effectiveBallPx/minor;
   if(!finite(slant)||slant<slant0*0.72||slant>slant0+8)continue;
   const xCam=(Number(p.x)-anchorX)*slant/focalPx;
   const yCam=(anchorY-Number(p.y))*slant/focalPx;
   const forward=yCam*Math.sin(pitch)+slant*Math.cos(pitch)-distance;
   const height=yCam*Math.cos(pitch)-slant*Math.sin(pitch)+cameraHeight;
   const t=(finite(p.time_s)?Number(p.time_s):(finite(times[p.frame])?times[p.frame]:p.frame/fps))-impactTime;
   if(!finite(t)||t<=0||t>0.12||forward<-0.4||height<-0.35||height>5)continue;
   samples.push({t,lateral:xCam,forward,height,minor,frame:p.frame});
  }
  if(samples.length<4)return stop('The ball was tracked, but too few observations retained a usable apparent width for rear-view depth estimation.');

  const vx=pairMedianSlope(samples,'lateral');
  const vf=pairMedianSlope(samples,'forward');
  const vh=pairMedianSlope(samples,'height');
  if(![vx,vf,vh].every(finite)||vf<=4)return stop('The perspective fit could not establish a stable ball movement away from the camera.');
  const horizontal=Math.hypot(vf,vx);
  const speed=Math.hypot(horizontal,vh);
  const launch=Math.atan2(vh,horizontal)*180/Math.PI;
  const direction=Math.atan2(vx,vf)*180/Math.PI;
  if(speed<8||speed>90)return stop('Rear-view speed is outside the plausible golf-ball range. Recheck camera distance, timing and tracking.');
  if(launch<-5||launch>50)return stop('Rear-view launch angle is outside the supported experimental range. Recheck the camera setup.');
  if(Math.abs(direction)>45)return stop('The reconstructed ball direction is too far from the camera target line. Recheck camera alignment.');

  const pairSpeeds=[];
  for(let i=1;i<samples.length;i++){
   const a=samples[i-1],b=samples[i],dt=b.t-a.t;if(dt<=0)continue;
   pairSpeeds.push(Math.hypot((b.lateral-a.lateral)/dt,(b.forward-a.forward)/dt,(b.height-a.height)/dt));
  }
  const medStep=median(pairSpeeds);
  const spread=medStep?median(pairSpeeds.map(v=>Math.abs(v-medStep)))/medStep:1;
  if(!finite(spread)||spread>0.65)return stop('Rear-view depth changes are too noisy for a dependable estimate. Use brighter light, higher resolution, or move the camera closer.');

  const m=result.metrics;
  m.ball_speed_mph=speed*MPS_TO_MPH;
  m.launch_angle_deg=launch;
  m.launch_direction_deg=direction;
  const angle=launch*Math.PI/180;
  const factor=clamp(Number(config.distanceFactor)||1,.65,1.2);
  m.estimated_carry_yards=speed**2*Math.sin(2*angle)/9.80665/.9144*factor;
  m.estimated_height_yards=(speed*Math.sin(angle))**2/(2*9.80665)/.9144;

  reasons.club='Club speed and attack angle are not reconstructed from rear-view perspective in v2.';
  if(!finite(m.estimated_carry_yards)||m.estimated_carry_yards<0)reasons.carry='Carry model unavailable for this launch fit.';
  result.status='complete';
  result.measurement_status='calibrated_estimate';
  result.measurement_source='EXPERIMENTAL rear-view perspective model';
  result.calibration={
   mode:'rear_perspective_v2',fps,timing_source:raw.video.timing_source||'frame_rate_fallback',
   camera_distance_m:distance,camera_height_m:cameraHeight,focal_px:focalPx,
   effective_ball_px:effectiveBallPx,sample_count:samples.length,perspective_spread:spread,
   launch_direction_deg:direction,reference_metres:distance,reference_pixels:effectiveBallPx,
   distance_factor:factor,ball_source:'Ronde observed track',club_source:'not measured',
   ball_fit:{speed_mps:speed,angle_deg:launch,direction_deg:direction,frames:samples.length,spread},
   club_fit:{reason:reasons.club}
  };
  result.warnings=[
   'Experimental rear-view estimate: camera geometry and apparent ball width are used to reconstruct depth. Validate against a launch monitor before relying on the numbers.',
   reasons.club
  ];
  return result;
 }

 window.BurkeMeasurement.calculate=function(raw,config={},corrections={}){
  if(config.view==='rear')return rearEstimate(raw,config,corrections);
  return normalCalculate(raw,config,corrections);
 };

 document.addEventListener('DOMContentLoaded',()=>{
  const view=document.getElementById('calView');
  const fields=document.querySelector('.calibration-fields');
  if(!view||!fields)return;
  const rearOption=[...view.options].find(o=>o.value==='rear');
  if(rearOption)rearOption.textContent='Behind player · experimental 3-D estimate';

  const distanceLabel=document.createElement('label');
  distanceLabel.className='rear-calibration-field';
  distanceLabel.innerHTML='Camera → ball (m)<input id="rearDistance" type="number" value="3.00" min="1" max="8" step="0.05">';
  const heightLabel=document.createElement('label');
  heightLabel.className='rear-calibration-field';
  heightLabel.innerHTML='Camera height (m)<input id="rearHeight" type="number" value="1.20" min="0.3" max="2.5" step="0.05">';
  fields.append(distanceLabel,heightLabel);

  const plane=document.getElementById('calPlane')?.closest('label');
  const metres=document.getElementById('calMetres')?.closest('label');
  const mark=document.getElementById('calMark');
  const reference=document.getElementById('calReference');
  const sync=()=>{
   const rear=view.value==='rear';
   distanceLabel.hidden=!rear;heightLabel.hidden=!rear;
   if(plane)plane.hidden=rear;
   if(metres)metres.hidden=rear;
   if(mark)mark.hidden=rear;
   if(reference)reference.textContent=rear?'Measure horizontally from the camera lens to the golf ball and enter the lens height. Keep the camera fixed, centred behind the target line and aimed at the ball.':'Use a measured horizontal reference along the target line, at the ball’s distance from the camera. Do not use a projected screen or a mat edge pointing away from the camera.';
  };
  view.addEventListener('change',sync);sync();
  [distanceLabel.querySelector('input'),heightLabel.querySelector('input')].forEach(input=>input.addEventListener('change',()=>view.dispatchEvent(new Event('change'))));

  window.addEventListener('burkeshot-analysis-complete',e=>{
   const r=e.detail;if(r?.calibration?.mode!=='rear_perspective_v2')return;
   const title=document.getElementById('measurementTitle');
   const help=document.getElementById('measurementHelp');
   const msg=document.getElementById('calMessage');
   const note=document.getElementById('resultNote');
   if(title)title.textContent='REAR-VIEW EXPERIMENT';
   if(help)help.textContent=`Perspective estimate from ${r.calibration.sample_count} Ronde ball observations. Validate against a launch monitor.`;
   if(msg)msg.textContent=`Rear v2 · camera ${r.calibration.camera_distance_m.toFixed(2)} m behind ball · lens ${r.calibration.camera_height_m.toFixed(2)} m high · ${r.calibration.fps.toFixed(0)} fps · direction ${r.calibration.launch_direction_deg.toFixed(1)}°.`;
   if(note)note.textContent='Experimental rear-view reconstruction. Ball speed/launch are camera estimates; carry remains a no-spin ballistic model. Club speed and attack are withheld.';
  });
 });
})();
