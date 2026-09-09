'use strict';
document.querySelectorAll('.mobile-nav button').forEach(b=>{b.lastChild.textContent={simulator:'Course',camera:'Shot',session:'Records',coach:'Swing'}[b.dataset.page]});
const warningObserver=new MutationObserver(()=>{if(!els.warning.hidden&&els.warning.textContent&&!currentResult)els.resultNote.textContent=els.warning.textContent});
warningObserver.observe(els.warning,{attributes:true,childList:true,subtree:true});
fetch('/api/health',{cache:'no-store'}).then(r=>r.json()).then(r=>{
 if(r.version!==12)els.resultNote.textContent='An older server is running. Close its console and run START_BURKESHOT_V12.bat.';
 else if(!r.camera_engine)els.resultNote.textContent='Camera dependencies are missing. Run INSTALL_CAMERA_ENGINE.bat.';
}).catch(()=>{els.resultNote.textContent='Camera service is disconnected. Run START_BURKESHOT_V12.bat; opening the HTML alone does not analyse videos.';});
