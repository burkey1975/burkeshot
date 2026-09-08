'use strict';
(function(){
 const panel=document.createElement('section');panel.className='calibration-panel';
 panel.innerHTML=`<header><div><b>Set up your measurements</b><p>A known distance replaces the old ball-size guess. Use a fixed side-on camera.</p></div><span id="calStatus">Not calibrated</span></header>
 <div class="calibration-fields"><label>Camera view<select id="calView"><option value="unknown">Choose camera view…</option><option value="side">Side-on · ball travels across image</option><option value="rear">Behind player · replay only</option></select></label><label>Known reference length (m)<input id="calMetres" type="number" value="1" min="0.1" max="3" step="0.01"></label><button id="calMark" type="button">1. Mark reference A → B</button></div>
 <p id="calReference">Use a measured horizontal reference along the target line, at the ball’s distance from the camera. Do not use a projected screen or a mat edge pointing away from the camera.</p>
 <label class="cal-check"><input id="calPlane" type="checkbox">Camera is fixed and side-on; reference, ball and clubhead are in the same plane. The analysed frames have uniform timing.</label>
 <label class="cal-check" id="calTimingRow"><input id="calTimingConfirmed" type="checkbox">For slow motion: each frame near impact is one original 120/240 fps frame, with no duplicated, dropped or interpolated frames. The capture mode below matches the recording.</label>
 <div class="cal-actions"><button id="calApply" type="button">2. Calculate numbers</button><button id="calSave" type="button" disabled>Save calibrated shot</button><button id="calCancel" type="button" hidden>Cancel marking</button></div>
 <p id="calMessage" role="status">Load a video. Then mark your reference and calculate.</p>
 <details><summary>Correct missed tracking</summary><p>Use these if automatic tracking failed. Each button starts four consecutive frames near impact. Click the centre of the ball or clubhead once in each frame. The video advances after each click. These are manually marked estimates.</p><div class="cal-actions"><button id="calBall" type="button">Mark 4 ball frames</button><button id="calClub" type="button">Mark 4 clubhead frames</button><button id="calClear" type="button">Clear marked tracks</button></div><p id="calCounts">Ball: automatic · Clubhead: automatic</p></details>`;
 document.querySelector('.viewer-top').after(panel);
 const area=document.createElement('div');area.id='calibrationHitArea';area.hidden=true;area.setAttribute('aria-label','Click the requested reference or tracked point in the video');document.querySelector('.video-stage').appendChild(area);
 const calCanvas=document.createElement('canvas');calCanvas.id='calibrationCanvas';calCanvas.setAttribute('aria-hidden','true');document.querySelector('.video-stage').appendChild(calCanvas);
 const reasons=document.createElement('div');reasons.className='measurement-details';reasons.id='measurementDetails';$('resultNote').after(reasons);
 let raw=null,reference=[],corrections={ball:[],club:[]},marking=null,saved=false;
 const conf=()=>({view:$('calView').value,reference:reference.length===2?{a:reference[0],b:reference[1],metres:Number($('calMetres').value)}:null,planeConfirmed:$('calPlane').checked,timing:els.capture.value==='120_real'?'original':els.capture.value,timingConfirmed:$('calTimingConfirmed').checked});
 const dimensions=()=>({width:raw?.video?.width||els.video.videoWidth,height:raw?.video?.height||els.video.videoHeight});
 function markMessage(text){$('calMessage').textContent=text}
 function stopMarking(){marking=null;area.hidden=true;$('calCancel').hidden=true;paint()}
 function paint(){
  const dim=dimensions();if(!dim.width||!dim.height)return;
  const g=canvasGeom(calCanvas,dim.width,dim.height),ctx=g.c;ctx.clearRect(0,0,g.r.width,g.r.height);
  const currentFrame=raw?Math.round(els.video.currentTime*raw.video.encoded_fps):0;
  function point(p,label,color){const x=g.ox+p.x*g.scale,y=g.oy+p.y*g.scale;ctx.fillStyle=color;ctx.strokeStyle='#152a3b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font='bold 14px sans-serif';ctx.fillText(label,x+10,y-10)}
  if(reference.length===2){ctx.strokeStyle='#52e1e8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(g.ox+reference[0].x*g.scale,g.oy+reference[0].y*g.scale);ctx.lineTo(g.ox+reference[1].x*g.scale,g.oy+reference[1].y*g.scale);ctx.stroke()}
  reference.forEach((p,i)=>point(p,i?'B':'A','#52e1e8'));
  for(const kind of ['ball','club'])for(const p of corrections[kind])if(p.frame===currentFrame)point(p,kind==='ball'?'Ball':'Club','#ffd064');
 }
 function invalidate(){saved=false;$('calSave').disabled=true;if(raw)apply(false);paint()}
 function describe(r){
  const m=r.metrics||{},why=r.measurement_reasons||{},calibrated=r.measurement_status==='calibrated_estimate';
  $('calStatus').textContent=calibrated?'Calibrated estimate':'Setup / tracking needed';
  els.quality.textContent='Detection '+pct(r.confidence);els.quality.parentElement.title='Confidence in detected objects only. This is not measurement accuracy.';
  $('cameraMetricLabel').textContent='MODELLED CARRY';els.carryLabel.textContent=m.estimated_carry_yards!=null?'No-spin ballistic baseline · not measured carry':'Needs calibrated ball speed and launch';
  els.smartShotNo.textContent=calibrated?'ESTIMATE':'VIDEO ONLY';
  els.geometry.textContent=$('calView').value==='side'?'SIDE-ON SETUP':$('calView').value==='rear'?'REAR VIEW':'CHOOSE VIEW';
  $('measurementState').hidden=false;$('measurementTitle').textContent=calibrated?'CALIBRATED VIDEO ESTIMATE':'MEASUREMENTS NOT READY';
  $('measurementHelp').textContent=calibrated?'Calculated from positions, your reference scale and source timing. Not validated against a launch monitor.':why.ball||'Set the camera view and reference scale.';
  els.resultNote.textContent='Carry is a no-spin ballistic model, excluding drag, lift, wind and roll. Clubhead speed is calculated independently; it is never inferred from an assumed smash factor.';
  const data=[['Ball speed',m.ball_speed_mph,why.ball],['Launch angle',m.launch_angle_deg,why.launch],['Clubhead speed',m.club_speed_mph,why.club],['Modelled carry',m.estimated_carry_yards,why.carry]];
  reasons.replaceChildren();for(const [name,value,reason]of data){const row=document.createElement('div'),b=document.createElement('b'),s=document.createElement('span');b.textContent=name;s.textContent=value!=null?(name==='Modelled carry'?'Ballistic model only':name==='Clubhead speed'?`${r.calibration.club_source} positions · calibrated scale`:`${r.calibration.ball_source} positions · calibrated scale`):(reason||'Unavailable');row.append(b,s);reasons.append(row)}
  if(r.calibration){markMessage(`Using ${r.calibration.fps.toFixed(2)} source fps · ${r.calibration.reference_metres} m = ${r.calibration.reference_pixels.toFixed(1)} image pixels.`)}
  else markMessage(why.ball||'Complete calibration to continue.');
  $('calSave').disabled=!calibrated||saved;els.viewRangeBtn.disabled=false;
  els.viewRangeBtn.textContent=m.ball_speed_mph!=null&&m.launch_angle_deg!=null?'SIMULATE CALIBRATED ESTIMATE':'OPEN COURSE · NO FLIGHT DATA';
 }
 function apply(announce=true){
  if(analysisBusy){if(announce)markMessage('Wait for the video analysis to finish.');return}
  if(!raw){if(announce)markMessage('Choose a video and wait for impact analysis first.');return}
  stopMarking();const r=BurkeMeasurement.calculate(raw,conf(),corrections);currentResult=r;renderDetection(r);
  window.dispatchEvent(new CustomEvent('burkeshot-shot',{detail:{result:r,club:els.club.value}}));
  window.dispatchEvent(new CustomEvent('burkeshot-analysis-complete',{detail:r}));
  setReady(r.measurement_status==='calibrated_estimate'?'ESTIMATE READY':'VIDEO ONLY','CALIBRATION & TRACKING');
 }
 window.burkeshotMeasureResult=r=>{raw=r;saved=false;return BurkeMeasurement.calculate(r,conf(),corrections)};
 window.addEventListener('burkeshot-analysis-start',()=>{saved=false;$('calSave').disabled=true;$('calStatus').textContent='Analysing';reasons.replaceChildren();$('measurementState').hidden=true;stopMarking()});
 window.addEventListener('burkeshot-analysis-complete',e=>{if(e.detail)describe(e.detail);else{markMessage('Analysis failed. Check the message beside the video.');$('calSave').disabled=true}});
 window.addEventListener('burkeshot-preview-loaded',()=>{
  raw=null;reference=[];corrections={ball:[],club:[]};saved=false;stopMarking();currentResult=null;clearMetrics();reasons.replaceChildren();$('measurementState').hidden=true;
  $('calSave').disabled=true;$('calPlane').checked=false;$('calTimingConfirmed').checked=false;$('calStatus').textContent='Not calibrated';$('calReference').textContent='Mark a measured reference for this clip. Previous reference points have been cleared.';$('calCounts').textContent='Ball: automatic · Clubhead: automatic';markMessage('Analysing video. Calibration is reset for each new clip.');
 });
 $('calApply').onclick=()=>apply();
 $('calSave').onclick=()=>{if(!saved&&currentResult?.measurement_status==='calibrated_estimate'){saveShot(currentResult,currentLabel);saved=true;$('calSave').disabled=true;markMessage('Calibrated estimate saved to Records.')}};
 $('calMark').onclick=()=>{
  if(analysisBusy)return markMessage('Wait for video analysis to finish.');
  if(!els.video.videoWidth)return markMessage('Load a video first.');
  if($('calView').value!=='side')return markMessage('Select a genuine side-on clip. Rear-view video cannot use this scale.');
  reference=[];invalidate();marking='reference';area.hidden=false;$('calCancel').hidden=false;els.video.pause();els.video.currentTime=0;markMessage('Click end A of the measured reference, then end B towards the target.');paint();
 };
 function startTrack(kind){
  if(analysisBusy||!raw?.impact)return markMessage('Wait for a video with detected impact.');
  if($('calView').value!=='side')return markMessage('Manual positions still require a side-on camera.');
  corrections[kind]=[];invalidate();marking=kind;area.hidden=false;$('calCancel').hidden=false;els.video.pause();
  els.video.currentTime=(raw.impact.contact_frame+(kind==='ball'?1:-4))/raw.video.encoded_fps;
  markMessage(`Click the ${kind==='ball'?'ball':'clubhead'} centre in each of four frames. The video advances automatically. Use Cancel to stop.`);
 }
 $('calBall').onclick=()=>startTrack('ball');$('calClub').onclick=()=>startTrack('club');
 $('calCancel').onclick=()=>{stopMarking();markMessage('Marking stopped. You can start again or calculate with the marked points.')};
 $('calClear').onclick=()=>{stopMarking();corrections={ball:[],club:[]};$('calCounts').textContent='Ball: automatic · Clubhead: automatic';invalidate()};
 area.addEventListener('pointerdown',e=>{
  e.preventDefault();if(!marking||els.video.seeking)return;
  const dim=dimensions(),p=BurkeMeasurement.videoPoint(els.video.getBoundingClientRect(),dim.width,dim.height,e.clientX,e.clientY);if(!p)return markMessage('Click inside the video picture, not the black bars.');
  if(marking==='reference'){
   reference.push(p);paint();if(reference.length<2)return markMessage('Now click end B towards the target.');
   stopMarking();$('calReference').textContent=`A → B marked (${Math.hypot(reference[1].x-reference[0].x,reference[1].y-reference[0].y).toFixed(1)} image pixels). Enter the measured length and confirm the setup.`;invalidate();return;
  }
  const kind=marking,frame=Math.round(els.video.currentTime*raw.video.encoded_fps);
  if(corrections[kind].some(q=>q.frame===frame))return markMessage('That source frame is already marked. Wait for the next frame.');
  corrections[kind].push({...p,frame,kind:'manual'});paint();$('calCounts').textContent=`Ball: ${corrections.ball.length||'automatic'} · Clubhead: ${corrections.club.length||'automatic'}`;
  if(corrections[kind].length>=4){stopMarking();invalidate();return}
  els.video.currentTime=(frame+1)/raw.video.encoded_fps;markMessage(`${corrections[kind].length}/4 marked. Click the ${kind==='ball'?'ball':'clubhead'} in the next frame.`);
 });
 for(const id of ['calView','calMetres','calPlane','calTimingConfirmed'])$(id).addEventListener('change',invalidate);
 els.capture.addEventListener('change',()=>{$('calTimingConfirmed').checked=false;$('calTimingRow').hidden=els.capture.value==='original';invalidate()});
 els.video.addEventListener('seeked',paint);els.video.addEventListener('loadedmetadata',paint);window.addEventListener('resize',paint);
 els.club.addEventListener('change',()=>{saved=false;if(raw)apply(false)});
})();
