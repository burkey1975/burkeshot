'use strict';
document.querySelectorAll('.mobile-nav button').forEach(b=>{b.lastChild.textContent={simulator:'Course',camera:'Shot',session:'Records',coach:'Swing'}[b.dataset.page]});
const warningObserver=new MutationObserver(()=>{if(!els.warning.hidden&&els.warning.textContent&&!currentResult)els.resultNote.textContent=els.warning.textContent});
warningObserver.observe(els.warning,{attributes:true,childList:true,subtree:true});
fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(r=>{
 if(r.version!==12)els.resultNote.textContent='An older server is running. Close its console and run START_BURKESHOT_V12.bat.';
 else if(!r.camera_engine)els.resultNote.textContent='Camera dependencies are missing. Run INSTALL_CAMERA_ENGINE.bat.';
}).catch(()=>{els.resultNote.textContent='Camera service is disconnected. Run START_BURKESHOT_V12.bat; opening the HTML alone does not analyse videos.';});

// Phone-first v4 presentation. Loaded here so desktop remains unchanged.
const mobileV4=document.createElement('link');
mobileV4.rel='stylesheet';
mobileV4.href='/assets/mobile-v4.css?v=4.1';
document.head.appendChild(mobileV4);
document.documentElement.classList.add('burkeshot-v4');

(function setupRearV4Controls(){
 const view=document.getElementById('calView');
 const fields=document.querySelector('.calibration-fields');
 if(!view||!fields)return;
 const rearOption=[...view.options].find(o=>o.value==='rear');
 if(rearOption)rearOption.textContent='Behind player · experimental 3-D v4';

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
   ?'Rear v4: measure horizontally from the camera lens to the golf ball and enter the lens height. Keep the phone fixed behind the player.'
   :'Use a measured horizontal reference along the target line, at the ball’s distance from the camera. Do not use a projected screen or a mat edge pointing away from the camera.';
 };
 view.addEventListener('change',sync);
 sync();
})();

const rearV3=document.createElement('script');
rearV3.src='/assets/rear-v3.js?v=3.3';
rearV3.async=false;
rearV3.onload=()=>{
 const rearV4=document.createElement('script');
 rearV4.src='/assets/rear-v4.js?v=4.0';
 rearV4.async=false;
 rearV4.onload=()=>console.log('BURKESHOT rear-view v4 loaded');
 document.head.appendChild(rearV4);
};
document.head.appendChild(rearV3);
