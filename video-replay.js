/* Replay and frame controls for camera results. */
'use strict';
(function(){
 let result=null,stopTimer=null,manualSelect=false;
 const get=id=>document.getElementById(id);
 const setButtonState=enabled=>['replayImpact','jumpImpact','prevFrame','nextFrame'].forEach(id=>{const e=get(id);if(e)e.disabled=!enabled});
 function fps(){return Number(result?.video?.encoded_fps)||30}
 function frame(){return Math.max(0,Math.round((els.video.currentTime||0)*fps()))}
 function updateFrame(){if(!els.video?.duration||!result)return;const n=result.video?.frame_count||Math.round(els.video.duration*fps());get('frameCounter').textContent=`Frame ${frame()} / ${n-1} · ${fps().toFixed(1)} fps`;if(window.burkeshotReplayMode&&result)drawTracking(result)}
 function showState(r){
  result=r||null;const ok=!!(r?.video?.frame_count);setButtonState(ok);if(ok)updateFrame();
  const box=get('measurementState'),title=get('measurementTitle'),help=get('measurementHelp');
  if(!box)return;
  if(r?.status==='trace_only'){
   box.hidden=false;title.textContent='VIDEO TRACE READY';help.textContent='Impact and post-impact ball streak found. This view does not provide calibrated 3D speed or launch angle.';box.classList.add('trace');
   els.viewRangeBtn.disabled=false;els.viewRangeBtn.textContent='OPEN COURSE · TRACE ONLY';els.carryLabel.textContent='Trace only — no calibrated carry';
  }else if(r?.status==='complete'){
   box.hidden=false;title.textContent='CAMERA ESTIMATE READY';help.textContent='Speed and launch passed the current camera checks. Review the replay, then send it to the range.';box.classList.remove('trace');els.viewRangeBtn.disabled=false;els.viewRangeBtn.textContent='SIMULATE CAMERA ESTIMATE';
  }
 }
 function stopReplay(){if(stopTimer){clearTimeout(stopTimer);stopTimer=null}window.burkeshotReplayMode=false;els.video.pause();els.video.playbackRate=Number(get('playbackRate')?.value)||1;drawTracking(result)}
 function replayImpact(){if(!result?.impact)return;stopReplay();window.burkeshotReplayMode=true;const f=fps(),start=Math.max(0,result.replay?.start_frame??result.impact.contact_frame-12),end=Math.min(result.video.frame_count-1,result.replay?.end_frame??result.impact.contact_frame+20);els.video.currentTime=start/f;els.video.playbackRate=Math.min(.5,Number(get('playbackRate')?.value)||.5);els.video.play().catch(()=>{});const wait=Math.max(1000,(end-start)/f/els.video.playbackRate*1000+180);stopTimer=setTimeout(stopReplay,wait)}
 function jumpImpact(){if(!result?.impact)return;stopReplay();els.video.currentTime=Math.max(0,result.impact.contact_frame/fps());drawTracking(result)}
 function step(n){if(!result)return;stopReplay();els.video.currentTime=Math.max(0,Math.min(els.video.duration||999,els.video.currentTime+n/fps()));drawTracking(result)}
 function onVideoClick(e){if(!manualSelect)return;const r=els.video.getBoundingClientRect(),vw=els.video.videoWidth,vh=els.video.videoHeight;if(!vw||!vh)return;const scale=Math.min(r.width/vw,r.height/vh),w=vw*scale,h=vh*scale,left=r.left+(r.width-w)/2,top=r.top+(r.height-h)/2,x=(e.clientX-left)/w,y=(e.clientY-top)/h;if(x<0||x>1||y<0||y>1)return;ballHint={x,y};localStorage.setItem('burkeshot_v12_ball_hint',JSON.stringify(ballHint));manualSelect=false;els.video.style.cursor='default';els.resultNote.textContent=`Ball selected at ${(x*100).toFixed(0)}%, ${(y*100).toFixed(0)}%. Starting analysis…`;if(typeof currentFile!=='undefined'&&currentFile)setTimeout(()=>analyse(currentFile,currentLabel),0)}
 get('replayImpact').onclick=replayImpact;get('jumpImpact').onclick=jumpImpact;get('prevFrame').onclick=()=>step(-1);get('nextFrame').onclick=()=>step(1);get('playbackRate').onchange=()=>{if(!window.burkeshotReplayMode)els.video.playbackRate=Number(get('playbackRate').value)};els.video.addEventListener('timeupdate',updateFrame);els.video.addEventListener('loadedmetadata',updateFrame);els.video.addEventListener('click',onVideoClick);
 get('manualBallBtn').onclick=()=>{if(!currentFile){els.resultNote.textContent='Choose a video first.';return}manualSelect=true;els.video.pause();els.video.currentTime=0;els.video.style.cursor='crosshair';els.resultNote.textContent='Click the centre of the stationary golf ball. Analysis will start automatically.'};
 window.addEventListener('burkeshot-analysis-complete',e=>showState(e.detail));
 window.addEventListener('burkeshot-preview-loaded',()=>{result=null;setButtonState(false);get('frameCounter').textContent='Video loaded · waiting for analysis'});
})();
