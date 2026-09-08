import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bufferSize, terrainHeight, surface, treeLayout, pathToMetres, greens, bunkers, center, width, pond } from '../src/course.mjs';
import { makeTerrainGeometry, makeBunkerGeometry, BurkeRealisticRange } from '../src/range-realistic.mjs';

test('native 4K is capped independently of DPR; 1080p and portrait preserve aspect',()=>{
  assert.deepEqual(bufferSize(1920,1080,'4k',2),{width:3840,height:2160});
  assert.deepEqual(bufferSize(7680,4320,'4k',2),{width:3840,height:2160});
  assert.deepEqual(bufferSize(1280,720,'1080',2),{width:1920,height:1080});
  assert.deepEqual(bufferSize(1000,1000,'4k',3),{width:2160,height:2160});
  assert.deepEqual(bufferSize(1080,1920,'4k',2),{width:1215,height:2160});
  assert.deepEqual(bufferSize(1920,1080,'4k',2,2048),{width:2048,height:1152});
  assert.deepEqual(bufferSize(800,450,'auto',1),{width:800,height:450});
});
test('feet trajectories enter a metre scene without changing timing',()=>{
  const p=pathToMetres([{x:10,y:100,z:450,t:4}])[0];
  assert.equal(p.x,3.048);assert.equal(p.y,30.48);assert.equal(p.z,137.16);assert.equal(p.t,4);
  assert.equal(greens[1],137.16);
});
test('terrain is finite, normals point upward, tee is human-scaled and greens are on the fairway',()=>{
  const g=makeTerrainGeometry(440,760,44,76);
  for(const values of Object.values(g.attributes))for(const v of values.array)assert.ok(Number.isFinite(v));
  for(let i=0;i<g.attributes.normal.count;i++)assert.ok(g.attributes.normal.getY(i)>0);
  assert.ok(Math.abs(terrainHeight(0,0))<.01);
  assert.ok(terrainHeight(pond.x,pond.z)<pond.level);
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;assert.ok(terrainHeight(pond.x+Math.cos(a)*pond.rx*.92,pond.z+Math.sin(a)*pond.rz*.92)>pond.level);}
  for(const z of greens){assert.ok(surface(center(z),z).green>.99);assert.ok(surface(center(z),z).fair>.99);}
  g.dispose();
});
test('bunker bowls have upward-facing triangles and track the terrain',()=>{
  for(const b of bunkers){
    const g=makeBunkerGeometry(b),p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++){
      assert.ok(Number.isFinite(n.getY(i)));assert.ok(n.getY(i)>=0);
      assert.ok(Math.abs(p.getY(i)-terrainHeight(p.getX(i),p.getZ(i))-.035)<.003);
    }g.dispose();
  }
});
test('deterministic photographic tree placement leaves the hitting corridor clear',()=>{
  const trees=treeLayout();assert.deepEqual(trees,treeLayout());assert.ok(trees.length>350);
  for(const t of trees){assert.ok(Math.abs(t.x-center(t.z))>width(t.z)+10);assert.ok(t.h>=13&&t.h<=28);assert.ok(Number.isFinite(t.y));}
});
test('existing Landing control aliases correctly; cleared shots reset the ball',()=>{
  const r={moveCamera(){},ball:{position:new THREE.Vector3(),scale:new THREE.Vector3()},tracer:{visible:true}};
  BurkeRealisticRange.prototype.setView.call(r,'downrange');assert.equal(r.view,'landing');
  BurkeRealisticRange.prototype.clearShot.call(r);assert.equal(r.shot,null);assert.equal(r.tracer.visible,false);assert.equal(r.ball.position.y,.04);
});
test('4K export renders exact dimensions then restores the live buffer and aspect',async()=>{
  let current={x:2880,y:2160};const renders=[];
  const r={ready:Promise.resolve(),maxBuffer:8192,camera:{aspect:4/3,updateProjectionMatrix(){}},scene:{},
    renderer:{getSize(v){v.set(current.x,current.y);},setSize(x,y){current={x,y};},render(){renders.push({...current});}},
    canvas:{toDataURL(){assert.deepEqual(current,{x:3840,y:2160});return 'data:image/png;base64,test';}}};
  const result=await BurkeRealisticRange.prototype.export4K.call(r);
  assert.ok(result.startsWith('data:image/png'));assert.deepEqual(current,{x:2880,y:2160});assert.equal(r.camera.aspect,4/3);
  assert.deepEqual(renders,[{x:3840,y:2160},{x:2880,y:2160}]);
  r.canvas.toDataURL=()=>{throw new Error('Allocation failed');};
  await assert.rejects(()=>BurkeRealisticRange.prototype.export4K.call(r),/Allocation failed/);
  assert.deepEqual(current,{x:2880,y:2160});assert.equal(r.camera.aspect,4/3);
  r.maxBuffer=2048;await assert.rejects(()=>BurkeRealisticRange.prototype.export4K.call(r),/cannot create/);
});
