'use strict';
document.querySelectorAll('.mobile-nav button').forEach(b=>{b.lastChild.textContent={simulator:'Course',camera:'Shot',session:'Records',coach:'Swing'}[b.dataset.page]});
const warningObserver=new MutationObserver(()=>{if(!els.warning.hidden&&els.warning.textContent&&!currentResult)els.resultNote.textContent=els.warning.textContent});
warningObserver.observe(els.warning,{attributes:true,childList:true,subtree:true});
fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(r=>{
 if(r.version!==12)els.resultNote.textContent='An older server is running. Close its console and run START_BURKESHOT_V12.bat.';
 else if(!r.camera_engine)els.resultNote.textContent='Camera dependencies are missing. Run INSTALL_CAMERA_ENGINE.bat.';
}).catch(()=>{els.resultNote.textContent='Camera service is disconnected. Run START_BURKESHOT_V12.bat; opening the HTML alone does not analyse videos.';});

// Rear-view v3 UI is initialised here so it is present even if the dynamically
// loaded measurement script executes after DOMContentLoaded.
(function setupRearV3Controls(){
 const view=document.getElementById('calView');
 const fields=document.querySelector('.calibration-fields');
 if(!view||!fields)return;
 const rearOption=[...view.options].find(o=>o.value==='rear');
 if(rearOption)rearOption.textContent='Behind player · experimental 3-D v3';

 let distance=document.getElementById('rearDistance');
 let height=document.getElementById('rearHeight');
 if(!distance||!height){
  const distanceLabel=document.createElement('label');
  distanceLabel.className='rear-calibration-field';
  distanceLabel.innerHTML='Camera → ball (m)<input id="rearDistance" type="number" value="3.00" min="1" max="8" step="0.05">';
  const heightLabel=document.createElement('label');
  heightLabel.className='rear-calibration-field';
  heightLabel.innerHTML='Camera height (m)<input id="rearHeight" type="number" value="1.20" min="0.3" max="2.5" step="0.05">';
  fields.append(distanceLabel,heightLabel);
  distance=distanceLabel.querySelector('input');
  height=heightLabel.querySelector('input');
 }

 const distanceLabel=distance.closest('label');
 const heightLabel=height.closest('label');
 const plane=document.getElementById('calPlane')?.closest('label');
 const metres=document.getElementById('calMetres')?.closest('label');
 const mark=document.getElementById('calMark');
 const reference=document.getElementById('calReference');
 const sync=()=>{
  const rear=view.value==='rear';
  if(distanceLabel)distanceLabel.hidden=!rear;
  if(heightLabel)heightLabel.hidden=!rear;
  if(plane)plane.hidden=rear;
  if(metres)metres.hidden=rear;
  if(mark)mark.hidden=rear;
  if(reference)reference.textContent=rear
   ?'Rear v3: measure horizontally from the camera lens to the golf ball and enter the lens height. Keep the phone fixed behind the player.'
   :'Use a measured horizontal reference along the target line, at the ball’s distance from the camera. Do not use a projected screen or a mat edge pointing away from the camera.';
 };
 view.addEventListener('change',sync);
 sync();
})();

// Load the rear-view v3 measurement engine with a new cache key.
const rearV3=document.createElement('script');
rearV3.src='/assets/rear-v3.js?v=3.2';
rearV3.async=false;
rearV3.onload=()=>console.log('BURKESHOT rear-view v3.2 loaded');
document.head.appendChild(rearV3);
