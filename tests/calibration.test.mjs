import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{calculate,videoPoint}=require('../measurement.js');
const speed=40,angle=15,clubSpeed=30;
function track(v,deg,frames){return frames.map(frame=>{const t=(frame-100)/240,a=deg*Math.PI/180;return{frame,x:600+v*Math.cos(a)*t*400,y:600-v*Math.sin(a)*t*400,kind:'measured'}})}
function input(){return{video:{width:1920,height:1080,frame_count:500,encoded_fps:30},camera_geometry:'side_on_ok',impact:{contact_frame:100},ball_track:{confidence:.8,points:track(speed,angle,[101,102,103,104,105,106])},club_track:{confidence:.7,points:track(clubSpeed,-4,[95,96,97,98,99])},metrics:{ball_speed_mph:999,estimated_carry_yards:999}}}
const config=()=>({view:'side',reference:{a:{x:100,y:600},b:{x:500,y:600},metres:1},planeConfirmed:true,timing:'240_slo',timingConfirmed:true});
test('known scale and frame intervals recover ball speed, angle and independent club speed',()=>{
 const r=calculate(input(),config());assert.equal(r.measurement_status,'calibrated_estimate');
 assert.ok(Math.abs(r.metrics.ball_speed_mph-speed*2.2369362921)<1e-8);assert.ok(Math.abs(r.metrics.launch_angle_deg-angle)<1e-8);
 assert.ok(Math.abs(r.metrics.club_speed_mph-clubSpeed*2.2369362921)<1e-8);assert.ok(Math.abs(r.metrics.attack_angle_deg+4)<1e-8);
 assert.ok(Math.abs(r.metrics.estimated_carry_yards-(speed**2*Math.sin(Math.PI/6)/9.80665/.9144))<1e-8);
 assert.equal(r.metrics.estimated_total_yards,null);
});
test('reference length changes speed linearly and ballistic carry quadratically',()=>{
 const a=calculate(input(),config()),c=config();c.reference.metres=.5;const b=calculate(input(),c);
 assert.ok(Math.abs(b.metrics.ball_speed_mph/a.metrics.ball_speed_mph-.5)<1e-8);assert.ok(Math.abs(b.metrics.estimated_carry_yards/a.metrics.estimated_carry_yards-.25)<1e-8);
});
test('ball profile factor is applied once to modelled carry',()=>{
 const base=calculate(input(),config()),c=config();c.distanceFactor=.92;const rangeBall=calculate(input(),c);
 assert.ok(Math.abs(rangeBall.metrics.estimated_carry_yards/base.metrics.estimated_carry_yards-.92)<1e-8);
 assert.equal(rangeBall.calibration.distance_factor,.92);
});
test('decoded frame timestamps override nominal fps for real-time fitting',()=>{
 const raw=input(),c=config();c.timing='original';raw.video.encoded_fps=120;
 raw.video.frame_times_s=Array.from({length:500},(_,i)=>i/120);
 for(let i=101;i<raw.video.frame_times_s.length;i++)raw.video.frame_times_s[i]+=(i-100)*.001;
 const timed=calculate(raw,c),without=input();without.video.encoded_fps=120;const nominal=calculate(without,c);
 assert.ok(timed.metrics.ball_speed_mph<nominal.metrics.ball_speed_mph);
});
test('rear camera cannot be unlocked by marking a scale or confirming side-on incorrectly',()=>{
 const raw=input();raw.camera_geometry='not_side_on';const r=calculate(raw,config());assert.ok(Object.values(r.metrics).every(v=>v===null));assert.match(r.measurement_reasons.ball,/unsuitable/);
 const c=config();c.view='rear';assert.match(calculate(input(),c).measurement_reasons.ball,/Rear-view/);
});
test('unconfirmed scale and timing never expose old server metrics',()=>{
 for(const c of [{}, {...config(),planeConfirmed:false},{...config(),timingConfirmed:false},{...config(),reference:null}])assert.ok(Object.values(calculate(input(),c).metrics).every(x=>x===null));
});
test('real-time 30fps export is rejected; original 120fps uses encoded rate',()=>{
 const c=config();c.timing='original';assert.match(calculate(input(),c).measurement_reasons.ball,/90–300/);
 const raw=input();raw.video.encoded_fps=120;const r=calculate(raw,c);assert.ok(Math.abs(r.metrics.ball_speed_mph-speed*2.2369362921/2)<1e-8);assert.equal(r.calibration.fps,120);
});
test('manual positions can replace failed automatic tracking with their source recorded',()=>{
 const raw=input(),manual={ball:raw.ball_track.points,club:raw.club_track.points};raw.ball_track={confidence:0,points:[]};raw.club_track={confidence:0,points:[]};
 const r=calculate(raw,config(),manual);assert.equal(r.status,'complete');assert.equal(r.calibration.ball_source,'manually marked');assert.equal(r.calibration.club_source,'manually marked');
});
test('missing clubhead tracking never invents club speed from ball speed',()=>{
 const raw=input();raw.club_track={confidence:0,points:[]};const r=calculate(raw,config());assert.ok(r.metrics.ball_speed_mph>0);assert.equal(r.metrics.club_speed_mph,null);assert.equal(r.metrics.smash_factor,null);assert.match(r.measurement_reasons.club,/four/);
});
test('wrong points, duplicates and noisy jumps do not pass fit checks',()=>{
 const raw=input();raw.ball_track.points=[raw.ball_track.points[0],raw.ball_track.points[0],raw.ball_track.points[1]];assert.equal(calculate(raw,config()).metrics.ball_speed_mph,null);
 const noisy=input();noisy.ball_track.points[2].x+=180;assert.equal(calculate(noisy,config()).metrics.ball_speed_mph,null);
});
test('tiny or out-of-frame references are rejected',()=>{
 const c=config();c.reference.b.x=120;assert.match(calculate(input(),c).measurement_reasons.ball,/50 image pixels/);
 c.reference.a.x=-10;assert.match(calculate(input(),c).measurement_reasons.ball,/inside/);
});
test('calibration pointer mapping handles portrait letterboxing',()=>{
 const rect={left:10,top:20,width:1000,height:800};assert.equal(videoPoint(rect,400,800,50,420),null);
 assert.deepEqual(videoPoint(rect,400,800,610,420),{x:300,y:400});
});
test('reversed target direction is rejected; leftward flight with matching reference works',()=>{
 const c=config();[c.reference.a,c.reference.b]=[c.reference.b,c.reference.a];assert.equal(calculate(input(),c).metrics.ball_speed_mph,null);
 const raw=input();for(const tr of [raw.ball_track,raw.club_track])for(const p of tr.points)p.x=1200-p.x;
 const r=calculate(raw,c);assert.ok(Math.abs(r.metrics.launch_angle_deg-angle)<1e-8);
});
