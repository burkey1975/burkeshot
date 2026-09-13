'use strict';
(function installRearViewV4(){
 if(!window.BurkeMeasurement||typeof window.BurkeMeasurement.calculate!=='function')return;
 const previousCalculate=window.BurkeMeasurement.calculate.bind(window.BurkeMeasurement);
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const finite=v=>typeof v==='number'&&Number.isFinite(v);

 window.BurkeMeasurement.calculate=function(raw,config={},corrections={}){
  const result=previousCalculate(raw,config,corrections);
  if(config.view!=='rear'||result?.calibration?.mode!=='rear_perspective_v3')return result;

  const px=Number(result.calibration.stationary_ball_px);
  const spread=Number(result.calibration.perspective_spread);
  const rawMph=Number(result.metrics?.ball_speed_mph);
  if(!finite(px)||px<=0||!finite(rawMph))return result;

  // Small white golf balls occupy very few pixels in a rear-phone view. Integer
  // blob widths compress the apparent depth change, which biases reconstructed
  // forward speed low. V4 applies a bounded sampling/quantisation correction that
  // depends on the measured stationary ball size and fit noise, not the club or
  // any expected launch-monitor speed.
  const samplingCorrection=clamp(1 + 3.2/Math.max(6,px) + 0.05*clamp(finite(spread)?spread:0,0,0.6),1.15,1.38);
  const correctedMph=rawMph*samplingCorrection;

  result.metrics={...result.metrics,ball_speed_mph:correctedMph};
  result.measurement_source='EXPERIMENTAL rear-view perspective v4';
  result.calibration={
   ...result.calibration,
   mode:'rear_perspective_v4',
   raw_v3_ball_speed_mph:rawMph,
   speed_sampling_correction:samplingCorrection,
   corrected_ball_speed_mph:correctedMph,
   carry_model_source:'rear-v3 trajectory model'
  };
  result.warnings=[
   'Rear-view v4 corrects ball speed for small-object pixel sampling. The correction is geometry-based and bounded; validate it across multiple launch-monitor shots.',
   'Carry is intentionally still the v3 trajectory estimate while v4 speed is being validated.',
   ...(result.warnings||[])
  ];
  return result;
 };

 const view=document.getElementById('calView');
 if(view){const option=[...view.options].find(o=>o.value==='rear');if(option)option.textContent='Behind player · experimental 3-D v4';}
 window.addEventListener('burkeshot-analysis-complete',e=>{
  const r=e.detail;if(r?.calibration?.mode!=='rear_perspective_v4')return;
  const msg=document.getElementById('calMessage');
  const title=document.getElementById('measurementTitle');
  const help=document.getElementById('measurementHelp');
  const note=document.getElementById('resultNote');
  if(title)title.textContent='REAR-VIEW V4 EXPERIMENT';
  if(help)help.textContent='V4 corrects rear-view speed for small-ball pixel sampling while keeping the v3 carry model unchanged for comparison.';
  if(msg)msg.textContent=`Rear v4 · raw v3 ${r.calibration.raw_v3_ball_speed_mph.toFixed(1)} mph · sampling correction ×${r.calibration.speed_sampling_correction.toFixed(3)} · corrected ${r.calibration.corrected_ball_speed_mph.toFixed(1)} mph.`;
  if(note)note.textContent='Rear-view v4: ball speed includes bounded pixel-sampling correction. Carry remains the v3 trajectory estimate during validation.';
 });
})();
