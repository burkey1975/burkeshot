import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const replay=readFileSync(new URL('../video-replay.js',import.meta.url),'utf8');
const sim=readFileSync(new URL('../simulator.js',import.meta.url),'utf8');

test('trace-only results enable an explicitly labelled course path',()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true,disabled:true,classList:{add(){},remove(){}}});return nodes.get(id)};
 const els={viewRangeBtn:get('viewRangeBtn'),carryLabel:get('carryLabel'),video:{addEventListener(){},style:{}}};
 const listeners={};
 vm.runInNewContext(replay,{document:{getElementById:get},els,window:{addEventListener:(n,f)=>listeners[n]=f}});
 listeners['burkeshot-analysis-complete']({detail:{status:'trace_only'}});
 assert.equal(els.viewRangeBtn.disabled,false);assert.match(els.viewRangeBtn.textContent,/TRACE ONLY/);
});
test('manual ball selection excludes letterboxing and uses image coordinates',()=>{
 const context={manualSelect:true,els:{video:{videoWidth:400,videoHeight:800,style:{},getBoundingClientRect:()=>({left:0,top:0,width:1000,height:800})},resultNote:{}},localStorage:{setItem(){}},ballHint:null};
 vm.createContext(context);vm.runInContext(replay.match(/ function onVideoClick[^\n]+/)[0],context);
 context.onVideoClick({clientX:100,clientY:400});assert.equal(context.ballHint,null);
 context.onVideoClick({clientX:600,clientY:400});assert.equal(context.ballHint.x,.75);assert.equal(context.ballHint.y,.5);
});
test('trace-only course entry clears any previous flight and does not invent metrics',()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,setAttribute(){}});return nodes.get(id)};
 let cleared=false,played=false;
 const context={currentResult:{metrics:{}},shots:[{ballSpeed:105,launch:21}],rangeShot:{old:true},hasNumber:v=>v!=null&&Number.isFinite(Number(v)),goPage(){},ensureRange:()=>({clearShot(){cleared=true}}),showRangeShot(){played=true},$:get,club:()=>({name:'7 Iron'})};
 vm.createContext(context);vm.runInContext(sim.slice(sim.indexOf('function useCameraShot(){'),sim.indexOf("$('viewRangeBtn').onclick")),context);context.useCameraShot();
 assert.equal(context.rangeShot,null);assert.equal(cleared,true);assert.equal(played,false);assert.equal(get('replayShotBtn').disabled,true);assert.match(get('rangeSource').textContent,/NO MEASURED FLIGHT/);
});
