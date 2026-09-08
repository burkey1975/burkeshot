/* Side-on, constant-frame-rate, planar video estimates. No club lookup values. */
(function(root){
 'use strict';
 const empty=()=>({ball_speed_mph:null,club_speed_mph:null,launch_angle_deg:null,attack_angle_deg:null,smash_factor:null,estimated_carry_yards:null,estimated_height_yards:null,estimated_total_yards:null});
 const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2};
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 function videoPoint(rect,width,height,x,y){
  if(!(width>0&&height>0&&rect.width>0&&rect.height>0))return null;
  const scale=Math.min(rect.width/width,rect.height/height),px=(x-rect.left-(rect.width-width*scale)/2)/scale,py=(y-rect.top-(rect.height-height*scale)/2)/scale;
  return px<0||py<0||px>width||py>height?null:{x:px,y:py};
 }
 function fitTrack(points,cal,fps,kind,video,impact){
  const samples=(points||[]).filter(p=>p&&finite(p.x)&&finite(p.y)&&Number.isInteger(p.frame)&&p.frame>=0&&p.frame<video.frame_count&&p.x>=0&&p.y>=0&&p.x<=video.width&&p.y<=video.height&&p.kind!=='address'&&p.kind!=='predicted'&&p.kind!=='interpolated').sort((a,b)=>a.frame-b.frame);
  const unique=samples.filter((p,i)=>!i||p.frame!==samples[i-1].frame);
  const near=unique.filter(p=>kind==='ball'?p.frame>=impact&&p.frame<=impact+Math.ceil(fps*.06):p.frame>=impact-Math.ceil(fps*.035)&&p.frame<=impact);
  const pts=kind==='ball'?near.slice(0,8):near.slice(-6);
  if(pts.length<4)return{reason:`${kind==='ball'?'Ball':'Clubhead'} needs at least four distinct, clear frames close to impact. Use the frame correction controls or a clearer clip.`};
  const dx=cal.b.x-cal.a.x,dy=cal.b.y-cal.a.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,scale=cal.metres/len;
  // Image y points down. A -> B must follow the target direction. Pick the upward
  // normal independently of left/right handedness and modest camera roll.
  const sign=ux>=0?1:-1,nx=sign*uy,ny=-sign*ux;
  const converted=pts.map(p=>({t:(p.frame-impact)/fps,x:(p.x-cal.a.x)*ux*scale+(p.y-cal.a.y)*uy*scale,y:((p.x-cal.a.x)*nx+(p.y-cal.a.y)*ny)*scale}));
  const n=converted.length,mt=converted.reduce((s,p)=>s+p.t,0)/n,mx=converted.reduce((s,p)=>s+p.x,0)/n,my=converted.reduce((s,p)=>s+p.y,0)/n;
  let tt=0,tx=0,ty=0;for(const p of converted){tt+=(p.t-mt)**2;tx+=(p.t-mt)*(p.x-mx);ty+=(p.t-mt)*(p.y-my)}
  if(!(tt>0))return{reason:'Distinct source frames are required.'};
  const vx=tx/tt,vy=ty/tt,speed=Math.hypot(vx,vy),span=converted.at(-1).t-converted[0].t;
  const residual=Math.sqrt(converted.reduce((s,p)=>s+(p.x-mx-vx*(p.t-mt))**2+(p.y-my-vy*(p.t-mt))**2,0)/n);
  const steps=converted.slice(1).map((p,i)=>Math.hypot(p.x-converted[i].x,p.y-converted[i].y)/(p.t-converted[i].t));
  const med=median(steps),variation=Math.max(...steps.map(v=>Math.abs(v-med)/Math.max(med,.01)));
  const maxSpeed=kind==='ball'?100:75,minSpeed=kind==='ball'?5:3;
  if(speed<minSpeed||speed>maxSpeed)return{reason:'Speed is outside the supported range. Check reference distance, timing and marked points.'};
  if(residual>Math.max(scale*2.5,speed*span*.08)||variation>.35)return{reason:'The tracked positions jump between frames. Correct the points near impact before calculating.'};
  const angle=Math.atan2(vy,vx)*180/Math.PI;
  if(vx<=0)return{reason:'Reference A → B must point towards the target. Mark the reference again.'};
  if(kind==='ball'&&(angle<0||angle>55))return{reason:'Flight is not consistent with the supported side-on setup (0–55°). A rear view cannot be corrected with this reference.'};
  if(kind==='club'&&Math.abs(angle)>25)return{reason:'Clubhead motion is outside the supported impact plane. Check the clubhead points and camera position.'};
  return{speed_mps:speed,angle_deg:angle,frames:n,residual_px:residual/scale};
 }
 function calculate(raw,config={},corrections={}){
  const result={...raw,metrics:empty(),measurement_status:'video_only',status:'trace_only',measurement_reasons:{},measurement_source:'Not calibrated'};
  const reasons=result.measurement_reasons;
  function stop(message){for(const key of ['ball','launch','club','carry'])reasons[key]=message;result.warnings=[message];return result}
  if(!raw?.video)return stop('Load and analyse a video first.');
  if(config.view!=='side')return stop(config.view==='rear'?'Rear-view video supports impact and trace only. Record side-on for calibrated estimates.':'Choose the camera view before calculating.');
  if(raw.camera_geometry==='not_side_on')return stop('The detected flight is predominantly into the image. This clip is unsuitable for side-on calibration; record a new side-on clip.');
  const c=config.reference;
  if(!c?.a||!c?.b||![c.a.x,c.a.y,c.b.x,c.b.y,c.metres].every(finite)||!(c.metres>=.1&&c.metres<=3))return stop('Mark both ends of a 0.1–3 metre reference at the ball’s depth, along the target line.');
  if([c.a,c.b].some(p=>p.x<0||p.y<0||p.x>raw.video.width||p.y>raw.video.height))return stop('Reference points must be inside this video frame.');
  const len=Math.hypot(c.b.x-c.a.x,c.b.y-c.a.y);
  if(len<50||Math.abs(c.b.x-c.a.x)<len*.7)return stop('The reference must span at least 50 image pixels and run mostly across the image. Use a closer, side-on view.');
  if(!config.planeConfirmed)return stop('Confirm the reference and initial ball/clubhead movement are at the same distance from the camera.');
  let fps;
  if(config.timing==='original')fps=Number(raw.video.encoded_fps);
  else if(['120_slo','240_slo'].includes(config.timing)&&config.timingConfirmed)fps=config.timing==='120_slo'?120:240;
  else return stop('Confirm the source timing. Slow-motion estimates require every analysed frame to represent one original captured frame.');
  if(!finite(fps)||fps<90||fps>300)return stop('This real-time file lacks the required 90–300 source frames per second. Use the original high-frame-rate file or a confirmed uniform slow-motion section.');
  if(!Number.isInteger(raw.impact?.contact_frame))return stop('Impact was not identified. Analyse a clip with a clear strike.');
  const impact=raw.impact.contact_frame;
  let ball,club;
  if(!corrections.ball?.length&&!(raw.ball_track?.confidence>=.55))ball={reason:'Automatic ball tracking is uncertain. Mark four or more ball positions just after impact.'};
  else ball=fitTrack(corrections.ball?.length?corrections.ball:raw.ball_track?.points,c,fps,'ball',raw.video,impact);
  if(!corrections.club?.length&&!(raw.club_track?.confidence>=.35))club={reason:'Automatic clubhead tracking is uncertain. Mark four or more clubhead positions just before impact.'};
  else club=fitTrack(corrections.club?.length?corrections.club:raw.club_track?.points,c,fps,'club',raw.video,impact);
  const m=result.metrics;
  if(ball.reason){reasons.ball=ball.reason;reasons.launch=ball.reason;reasons.carry='Carry requires a valid calibrated ball speed and launch angle.'}
  else{
   m.ball_speed_mph=ball.speed_mps*2.2369362921;m.launch_angle_deg=ball.angle_deg;
   const angle=ball.angle_deg*Math.PI/180;
   // Explicit vacuum baseline only. Spin, drag, lift, wind and roll are unknown.
   m.estimated_carry_yards=ball.speed_mps**2*Math.sin(2*angle)/9.80665/.9144;
   m.estimated_height_yards=(ball.speed_mps*Math.sin(angle))**2/(2*9.80665)/.9144;
  }
  if(club.reason)reasons.club=club.reason;
  else{m.club_speed_mph=club.speed_mps*2.2369362921;m.attack_angle_deg=club.angle_deg}
  if(m.ball_speed_mph!=null&&m.club_speed_mph!=null){const smash=m.ball_speed_mph/m.club_speed_mph;if(smash>=.7&&smash<=1.65)m.smash_factor=smash}
  result.status=m.ball_speed_mph!=null&&m.launch_angle_deg!=null?'complete':'trace_only';
  result.measurement_status=Object.values(m).some(x=>x!=null)?'calibrated_estimate':'video_only';
  result.measurement_source='Calibrated side-on estimate';
  result.calibration={fps,reference_metres:c.metres,reference_pixels:len,ball_source:corrections.ball?.length?'manually marked':'automatic',club_source:corrections.club?.length?'manually marked':'automatic',ball_fit:ball,club_fit:club};
  result.warnings=[...new Set(Object.values(reasons))];
  return result;
 }
 const api={calculate,videoPoint,fitTrack};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.BurkeMeasurement=api;
})(typeof window!=='undefined'?window:this);
