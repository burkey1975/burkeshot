'use strict';
(function installRearViewV3(){
 if(!window.BurkeMeasurement||typeof window.BurkeMeasurement.calculate!=='function')return;
 const previousCalculate=window.BurkeMeasurement.calculate.bind(window.BurkeMeasurement);
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const median=a=>{const b=(a||[]).filter(finite).sort((x,y)=>x-y);if(!b.length)return null;const m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};
 const BALL_DIAMETER_M=0.04267;
 const MPS_TO_MPH=2.2369362921;
 const RAD=Math.PI/180;
 const emptyMetrics=()=>({ball_speed_mph:null,club_speed_mph:null,launch_angle_deg:null,attack_angle_deg:null,smash_factor:null,estimated_carry_yards:null,estimated_height_yards:null,estimated_total_yards:null,launch_direction_deg:null});

 function robustSlope(samples,key){
  const slopes=[];
  for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++){
   const dt=samples[j].t-samples[i].t;
   if(dt>=0.004&&dt<=0.065)slopes.push((samples[j][key]-samples[i][key])/dt);
  }
  return median(slopes);
 }

 function rearEstimateV3(raw,config={}){
  const result={...raw,metrics:emptyMetrics(),measurement_status:'video_only',status:'trace_only',measurement_reasons:{},measurement_source:'Experimental rear-view perspective v3'};
  const reasons=result.measurement_reasons;
  const stop=message=>{for(const key of ['ball','launch','club','carry'])reasons[key]=message;result.warnings=[message];return result};
  if(!raw?.video||!raw?.ball||!raw?.ball_track||!raw?.impact)return stop('Load and analyse a video first.');

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

  const width=Number(raw.video.width),height=Number(raw.video.height);
  const cx=width/2,cy=height/2;
  const anchorX=Number(raw.ball.x),anchorY=Number(raw.ball.y);
  const stationaryPx=Number(raw.ball.diameter_px);
  if(![width,height,anchorX,anchorY,stationaryPx].every(finite)||stationaryPx<3)return stop('The stationary ball lock is not strong enough for rear-view perspective calibration.');

  const slant0=Math.hypot(distance,cameraHeight);
  const focalPx=stationaryPx*slant0/BALL_DIAMETER_M;
  if(!finite(focalPx)||focalPx<100)return stop('Could not establish a usable camera scale from the stationary ball.');

  const anchorAz=Math.atan((anchorX-cx)/focalPx);
  const anchorEl=Math.atan((cy-anchorY)/focalPx);
  const worldAnchorEl=-Math.atan2(cameraHeight,distance);

  const times=raw.video.frame_times_s||[];
  const impact=Number(raw.impact.contact_frame);
  const impactTime=finite(times[impact])?Number(times[impact]):impact/fps;
  let points=(raw.ball_track.points||[]).filter(p=>p&&p.kind!=='address'&&p.kind!=='predicted'&&p.kind!=='interpolated'&&finite(Number(p.x))&&finite(Number(p.y))&&Number.isInteger(p.frame)&&p.frame>impact&&finite(Number(p.blob_w))&&finite(Number(p.blob_h)));
  points=points.slice(0,12);
  if(points.length<4)return stop('Rear-view 3-D estimate needs at least four accepted Ronde observations just after impact.');

  const earlyMinors=points.slice(0,Math.min(4,points.length)).map(p=>Math.min(Number(p.blob_w),Number(p.blob_h))).filter(v=>finite(v)&&v>=1.5);
  const earlyMinor=median(earlyMinors);
  const blurInflation=finite(earlyMinor)?clamp(earlyMinor-stationaryPx*0.98,0,stationaryPx*0.45):0;

  const samples=[{t:0,lateral:0,forward:0,height:0,minor:stationaryPx,frame:impact,quality:1}];
  for(const p of points){
   const rawMinor=Math.min(Number(p.blob_w),Number(p.blob_h));
   const major=Math.max(Number(p.blob_w),Number(p.blob_h));
   const aspect=major/Math.max(1,rawMinor);
   if(!finite(rawMinor)||rawMinor<1.2||aspect>14)continue;
   const minor=Math.max(1.05,rawMinor-blurInflation);
   if(minor>stationaryPx*1.35)continue;

   const range=slant0*stationaryPx/minor;
   if(!finite(range)||range<slant0*0.78||range>slant0+10)continue;

   const az=Math.atan((Number(p.x)-cx)/focalPx)-anchorAz;
   const imageEl=Math.atan((cy-Number(p.y))/focalPx)-anchorEl;
   const worldEl=worldAnchorEl+imageEl;
   const horizontalRange=range*Math.cos(worldEl);
   const lateral=horizontalRange*Math.sin(az);
   const forwardFromCamera=horizontalRange*Math.cos(az);
   const heightFromCamera=range*Math.sin(worldEl);
   const forward=forwardFromCamera-distance;
   const z=heightFromCamera+cameraHeight;
   const t=(finite(Number(p.time_s))?Number(p.time_s):(finite(times[p.frame])?Number(times[p.frame]):p.frame/fps))-impactTime;
   const quality=finite(Number(p.detector_quality))?Number(p.detector_quality):0.5;
   if(!finite(t)||t<=0||t>0.095||forward<-0.25||forward>8||z<-0.25||z>4.5)continue;
   samples.push({t,lateral,forward,height:z,minor,rawMinor,frame:p.frame,quality});
  }
  if(samples.length<5)return stop('Too few early Ronde observations retained stable ball width for rear-view v3.');

  const fit=samples.filter((s,i)=>i===0||(s.t<=0.065&&s.quality>=0.18));
  if(fit.length<5)return stop('Rear-view v3 needs four clean early observations plus impact.');

  const vx=robustSlope(fit,'lateral');
  const vf=robustSlope(fit,'forward');
  const vh=robustSlope(fit,'height');
  if(![vx,vf,vh].every(finite)||vf<=4)return stop('Rear-view v3 could not establish stable movement away from the camera.');

  const horizontal=Math.hypot(vf,vx);
  const speed=Math.hypot(horizontal,vh);
  const launch=Math.atan2(vh,horizontal)/RAD;
  const direction=Math.atan2(vx,vf)/RAD;
  if(speed<8||speed>95)return stop('Rear-view speed is outside the plausible golf-ball range. Recheck camera distance, timing and tracking.');
  if(launch<-5||launch>50)return stop('Rear-view launch angle is outside the supported experimental range. Recheck camera height and alignment.');
  if(Math.abs(direction)>45)return stop('The reconstructed launch direction is too far from the camera target line. Recheck camera alignment.');

  const segmentSpeeds=[];
  for(let i=1;i<fit.length;i++){
   const a=fit[i-1],b=fit[i],dt=b.t-a.t;if(dt<=0)continue;
   const v=Math.hypot((b.lateral-a.lateral)/dt,(b.forward-a.forward)/dt,(b.height-a.height)/dt);
   if(finite(v))segmentSpeeds.push(v);
  }
  const medStep=median(segmentSpeeds);
  const spread=medStep?median(segmentSpeeds.map(v=>Math.abs(v-medStep)))/medStep:1;
  if(!finite(spread)||spread>0.75)return stop('Rear-view v3 depth estimates are too noisy. Use brighter light, higher resolution, or move the camera closer.');

  const m=result.metrics;
  m.ball_speed_mph=speed*MPS_TO_MPH;
  m.launch_angle_deg=launch;
  m.launch_direction_deg=direction;

  // Carry remains deliberately modelled, not measured. v3 uses a modest aerodynamic
  // range factor rather than the old vacuum-only formula, because real golf balls
  // retain lift from spin. No spin value is claimed or displayed.
  const angle=launch*RAD;
  const ballFactor=clamp(Number(config.distanceFactor)||1,.65,1.2);
  const vacuum=speed**2*Math.max(0,Math.sin(2*Math.max(0,angle)))/9.80665;
  const aeroFactor=clamp(1.42+0.0075*Math.max(0,launch),1.42,1.75);
  m.estimated_carry_yards=vacuum*aeroFactor/.9144*ballFactor;
  m.estimated_height_yards=(speed*Math.sin(Math.max(0,angle)))**2/(2*9.80665)/.9144;

  reasons.club='Club speed and attack angle are not reconstructed from rear-view perspective in v3.';
  result.status='complete';
  result.measurement_status='calibrated_estimate';
  result.measurement_source='EXPERIMENTAL rear-view perspective v3';
  result.calibration={
   mode:'rear_perspective_v3',fps,timing_source:raw.video.timing_source||'frame_rate_fallback',
   camera_distance_m:distance,camera_height_m:cameraHeight,focal_px:focalPx,
   stationary_ball_px:stationaryPx,blur_inflation_px:blurInflation,sample_count:fit.length,
   perspective_spread:spread,launch_direction_deg:direction,distance_factor:ballFactor,
   ball_source:'Ronde observed track',club_source:'not measured',
   ball_fit:{speed_mps:speed,angle_deg:launch,direction_deg:direction,frames:fit.length,spread},
   club_fit:{reason:reasons.club}
  };
  result.warnings=[
   'Experimental rear-view v3: 3-D launch is reconstructed from the known golf-ball size, camera geometry and Ronde observations. Validate against a launch monitor before relying on the numbers.',
   'Carry is a modelled aerodynamic estimate; spin is not measured.',
   reasons.club
  ];
  return result;
 }

 window.BurkeMeasurement.calculate=function(raw,config={},corrections={}){
  if(config.view==='rear')return rearEstimateV3(raw,config,corrections);
  return previousCalculate(raw,config,corrections);
 };

 window.addEventListener('burkeshot-analysis-complete',e=>{
  const r=e.detail;
  if(r?.calibration?.mode!=='rear_perspective_v3')return;
  const title=document.getElementById('measurementTitle');
  const help=document.getElementById('measurementHelp');
  const msg=document.getElementById('calMessage');
  const note=document.getElementById('resultNote');
  if(title)title.textContent='REAR-VIEW V3 EXPERIMENT';
  if(help)help.textContent=`Angular/perspective fit from ${r.calibration.sample_count-1} early Ronde observations plus impact.`;
  if(msg)msg.textContent=`Rear v3 · camera ${r.calibration.camera_distance_m.toFixed(2)} m behind ball · lens ${r.calibration.camera_height_m.toFixed(2)} m high · ${r.calibration.fps.toFixed(0)} fps · direction ${r.calibration.launch_direction_deg.toFixed(1)}°.`;
  if(note)note.textContent='Experimental rear-view v3. Ball speed/launch use corrected perspective geometry; carry is modelled and spin is not measured.';
 });
})();
