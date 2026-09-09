import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { bufferSize, terrainHeight, surface, center, greens, bunkers, pond,
  seededRandom, treeLayout, pathToMetres, LEGACY_TO_METRES, YARDS_TO_METRES, clamp } from './course.mjs';

const TEE = new THREE.Vector3(0,2.2,-7.5);
const scratchObject = new THREE.Object3D();

export function makeTerrainGeometry(w=440,d=760,nx=280,nz=480,zOffset=270) {
  const g=new THREE.PlaneGeometry(w,d,nx,nz);
  g.rotateX(-Math.PI/2);g.translate(0,0,zOffset);
  const p=g.attributes.position,uv=g.attributes.uv,colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),s=surface(x,z);
    p.setY(i,terrainHeight(x,z));uv.setXY(i,x/1.5,z/1.5);
    // Turf albedo contains the grass colour. Vertex colours define maintenance
    // zones, with broad subtle mowing bands rather than painted lawn stripes.
    const light=.69+.22*s.firstCut+.07*s.fair;
    const m=light*(1-s.fair+s.fair*s.stripe);
    colors.set([m*(1+.055*s.green),m*(1+.045*s.green),m*(.84+.10*s.fair)],i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeVertexNormals();
  return g;
}

export function makeBunkerGeometry(b) {
  const angles=96,rings=18,positions=[],uv=[],indices=[];
  for(let j=0;j<=rings;j++)for(let i=0;i<=angles;i++) {
    const a=i/angles*Math.PI*2;
    const r=j/rings*(1+.105*Math.sin(a*3+b.seed)+.07*Math.cos(a*5-b.seed));
    const x=b.x+Math.cos(a)*r*b.rx,z=b.z+Math.sin(a)*r*b.rz;
    positions.push(x,terrainHeight(x,z)+.035,z);uv.push(x*.6,z*.6);
    if(j<rings&&i<angles){const k=j*(angles+1)+i;indices.push(k,k+1,k+angles+1,k+1,k+angles+2,k+angles+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  return g;
}

function sandTexture() {
  const n=256,data=new Uint8Array(n*n*4),rnd=seededRandom(52);
  for(let i=0;i<n*n;i++){const v=200+rnd()*54;data.set([v,v*.97,v*.9,255],i*4);}
  const t=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}

export class BurkeRealisticRange {
  constructor(canvas) {
    this.canvas=canvas;this.quality='4k';this.showTracer=true;this.view='tee';
    this.aim=0;this.targetYards=150;this.loading=true;this.error=null;this.shot=null;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.debug.onShaderError=()=>{this.error=new Error('Your GPU could not compile the course lighting. Update its driver and reload, or try Chrome or Edge.');this.notify();};
    this.maxBuffer=Math.min(this.renderer.capabilities.maxTextureSize,this.renderer.getContext().getParameter(this.renderer.getContext().MAX_RENDERBUFFER_SIZE));
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#9cbfd0');
    this.scene.fog=new THREE.FogExp2('#b9ccd0',.00132);
    this.camera=new THREE.PerspectiveCamera(48,16/9,.08,2200);this.camera.position.copy(TEE);
    this.lookAt=new THREE.Vector3(0,1.6,110);this.camera.lookAt(this.lookAt);
    this.sunDirection=new THREE.Vector3(-.6,.76,-.4).normalize();
    this.clock=new THREE.Clock();this.trees=[];this.flags=[];
    this.createLighting();this.createBall();
    this.resize=()=>this.resizeCanvas();
    this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);
    window.addEventListener('resize',this.resize);
    this.contextLost=e=>{e.preventDefault();this.error=new Error('Graphics context lost. Reload the page or select 1080p to reduce GPU memory use.');this.notify();};
    canvas.addEventListener('webglcontextlost',this.contextLost);
    this.resizeCanvas();
    this.ready=this.loadCourse().then(()=>{this.loading=false;this.notify();return this;}).catch(error=>{this.error=error;this.loading=false;this.notify();throw error;});
    // ready remains rejectable for callers, but a very early asset error must not
    // produce an unhandled rejection while the rest of the app is initialising.
    this.ready.catch(()=>{});
    this.frame=()=>{
      this.frameId=requestAnimationFrame(this.frame);
      if(this.disposed||this.error||!canvas.isConnected||canvas.clientWidth===0||canvas.clientHeight===0)return;
      const dt=Math.min(.06,this.clock.getDelta());
      try{this.update(dt);this.renderer.render(this.scene,this.camera);}catch(error){this.error=error;this.notify();}
    };
    this.frameId=requestAnimationFrame(this.frame);
  }

  notify(){this.canvas.dispatchEvent(new CustomEvent('graphics-status',{detail:{status:this.getQualityStatus(),error:this.error?.message||null}}));}

  createLighting() {
    const sky=new Sky();sky.scale.setScalar(1600);
    Object.assign(sky.material.uniforms.turbidity,{value:2.2});
    sky.material.uniforms.rayleigh.value=1.7;sky.material.uniforms.mieCoefficient.value=.004;
    sky.material.uniforms.mieDirectionalG.value=.82;sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
    this.scene.add(sky);this.sky=sky;
    this.scene.add(new THREE.HemisphereLight('#cde5ff','#78744b',1.8));
    const sun=new THREE.DirectionalLight('#fff1d5',3.3);sun.position.copy(this.sunDirection).multiplyScalar(250).add(new THREE.Vector3(0,0,110));
    sun.target.position.set(0,0,110);sun.castShadow=true;
    const shadowSize=Math.min(4096,this.renderer.capabilities.maxTextureSize);sun.shadow.mapSize.set(shadowSize,shadowSize);
    Object.assign(sun.shadow.camera,{left:-180,right:180,top:205,bottom:-205,near:5,far:580});
    sun.shadow.normalBias=.07;sun.shadow.bias=-.00005;sun.shadow.radius=2;
    this.scene.add(sun,sun.target);this.sun=sun;
    // PMREM gives water and glossy objects an actual sky environment, not a
    // painted blue diffuse surface. Ground and foliage use direct soft light.
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const envScene=new THREE.Scene();const envSky=sky.clone();envScene.add(envSky);
    this.environment=pmrem.fromScene(envScene,.025,.1,2000);this.scene.environment=this.environment.texture;pmrem.dispose();
  }

  async loadCourse() {
    const loader=new THREE.TextureLoader();
    const load=name=>loader.loadAsync('assets/'+name).catch(()=>{throw new Error('Course asset could not load: '+name+'. Extract the entire ZIP and launch with START_BURKESHOT_V12.bat.');});
    const [turf,oak,pine]=await Promise.all(['fairway-turf.png','oak-tree.png','pine-tree.png'].map(load));
    const anisotropy=Math.min(16,this.renderer.capabilities.getMaxAnisotropy());
    for(const t of [turf,oak,pine]){t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=anisotropy;}
    turf.wrapS=turf.wrapT=THREE.MirroredRepeatWrapping;
    const groundMat=new THREE.MeshStandardMaterial({map:turf,bumpMap:turf,bumpScale:.014,roughness:1,vertexColors:true,envMapIntensity:.2});
    // Multiple texture scales avoid a visibly repeated metre-square motif. This
    // modifies albedo only; lighting, shadows and bump normals stay physical.
    groundMat.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        #ifdef USE_MAP
          vec4 fineTurf = texture2D(map,vMapUv);
          vec4 broadTurf = texture2D(map,vMapUv*0.071+vec2(0.31,0.47));
          diffuseColor *= mix(fineTurf,broadTurf,0.13);
        #endif
      `);
    };
    const ground=new THREE.Mesh(makeTerrainGeometry(),groundMat);ground.receiveShadow=true;this.scene.add(ground);this.ground=ground;
    const sand=sandTexture();sand.anisotropy=anisotropy;
    const sandMat=new THREE.MeshStandardMaterial({color:'#fffdf7',map:sand,bumpMap:sand,bumpScale:.016,roughness:.96});
    for(const b of bunkers){const m=new THREE.Mesh(makeBunkerGeometry(b),sandMat);m.receiveShadow=true;this.scene.add(m);}
    this.createWater();this.createTrees(oak,pine);this.createGrass();this.createFlags();this.createFlowerBanks();
    this.updateTrees();this.setTarget(this.targetYards);
    this.canvas.dataset.graphics='textured-pbr';this.canvas.dataset.treeCount=String(this.trees.reduce((n,t)=>n+t.layout.length,0));
  }

  createFlowerBanks() {
    // Original flowering landscape: instanced geometry follows the actual terrain.
    // No Augusta logos, map data or proprietary course assets are used.
    const rnd=seededRandom(1010),banks=[];
    for(let i=0;i<300;i++){
      const z=15+rnd()*255,side=i%2?1:-1;
      const x=center(z)+side*(32+rnd()*12);
      if(Math.hypot((x-pond.x)/pond.rx,(z-pond.z)/pond.rz)<1.25)continue;
      banks.push({x,z,y:terrainHeight(x,z),r:.65+rnd()*.8});
    }
    const foliage=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,2),new THREE.MeshStandardMaterial({color:'#244d22',roughness:1}),banks.length);
    foliage.castShadow=true;foliage.receiveShadow=true;
    const blooms=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.12,1),new THREE.MeshStandardMaterial({roughness:.88}),banks.length*16);
    const palette=['#d83981','#f484b2','#f7e9ed','#b8235e'];
    banks.forEach((b,i)=>{
      scratchObject.position.set(b.x,b.y+b.r*.5,b.z);scratchObject.rotation.set(0,rnd()*6.28,0);scratchObject.scale.set(b.r,b.r*.7,b.r);scratchObject.updateMatrix();foliage.setMatrixAt(i,scratchObject.matrix);
      for(let j=0;j<16;j++){
        const angle=rnd()*Math.PI*2,radius=b.r*Math.sqrt(rnd())*.95;
        scratchObject.position.set(b.x+Math.cos(angle)*radius,b.y+b.r*.55+Math.sqrt(Math.max(0,b.r*b.r-radius*radius))*.65,b.z+Math.sin(angle)*radius);
        scratchObject.scale.setScalar(.65+rnd()*.75);scratchObject.updateMatrix();blooms.setMatrixAt(i*16+j,scratchObject.matrix);blooms.setColorAt(i*16+j,new THREE.Color(palette[i%4]));
      }
    });
    this.scene.add(foliage,blooms);
    // A modest stone footbridge beside the pond, clear of the shot corridor.
    const stone=new THREE.MeshStandardMaterial({color:'#b6b5a5',roughness:1});
    const bridge=new THREE.Group();bridge.position.set(pond.x,terrainHeight(pond.x,pond.z-pond.rz-2)+.2,pond.z-pond.rz-2);
    const deck=new THREE.Mesh(new THREE.BoxGeometry(9,.38,2.3),stone);deck.receiveShadow=true;bridge.add(deck);
    for(const z of [-1.1,1.1]){const rail=new THREE.Mesh(new THREE.BoxGeometry(9,.65,.28),stone);rail.position.set(0,.45,z);rail.castShadow=true;bridge.add(rail);}
    this.scene.add(bridge);this.canvas.dataset.course='magnolia-original';
  }

  createWater() {
    const g=new THREE.CircleGeometry(1,96);g.rotateX(-Math.PI/2);g.scale(pond.rx*.92,1,pond.rz*.92);
    const m=new THREE.MeshPhysicalMaterial({color:'#3e6b69',metalness:.18,roughness:.16,envMapIntensity:1.15,clearcoat:1,clearcoatRoughness:.15});
    // Gentle geometric wave normals. This is environment reflection, not a
    // claim of screen-space or real-time reflections of every course object.
    m.onBeforeCompile=shader=>{
      shader.uniforms.waterTime={value:0};this.waterUniform=shader.uniforms.waterTime;
      shader.fragmentShader='uniform float waterTime;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        normal = normalize(normal + vec3(0.04*sin(vViewPosition.x*3.0+waterTime),0.025*cos(vViewPosition.z*2.0+waterTime*0.7),0.0));`);
    };
    const water=new THREE.Mesh(g,m);water.position.set(pond.x,pond.level,pond.z);this.scene.add(water);
  }

  createTrees(oak,pine) {
    const layout=treeLayout();
    [oak,pine].forEach((map,kind)=>{
      const items=layout.filter(t=>t.kind===kind);
      const geometry=new THREE.PlaneGeometry(1,1);geometry.translate(0,.5,0);
      const material=new THREE.MeshStandardMaterial({map,alphaTest:.37,side:THREE.DoubleSide,roughness:1,emissive:'#566b38',emissiveIntensity:.22,envMapIntensity:.1});
      material.alphaToCoverage=true;
      const mesh=new THREE.InstancedMesh(geometry,material,items.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
      const colour=new THREE.Color();items.forEach((t,i)=>{colour.setRGB(t.shade,t.shade,t.shade*.95);mesh.setColorAt(i,colour);});
      this.trees.push({mesh,layout:items});this.scene.add(mesh);
    });
  }

  updateTrees() {
    for(const {mesh,layout} of this.trees) {
      layout.forEach((t,i)=>{
        scratchObject.position.set(t.x,t.y-.10,t.z);
        scratchObject.rotation.set(0,Math.atan2(this.camera.position.x-t.x,this.camera.position.z-t.z),0);
        // Negative scale would invert the shadow winding. Flip variations are
        // supplied with an extra half turn; double-sided foliage stays visible.
        scratchObject.scale.set(t.h,t.h,1);if(t.flip)scratchObject.rotation.y+=Math.PI;
        scratchObject.updateMatrix();mesh.setMatrixAt(i,scratchObject.matrix);
      });mesh.instanceMatrix.needsUpdate=true;
    }
  }

  createGrass() {
    // Fine three-dimensional blades close to the camera resolve at native 4K.
    // Farther grass is textured terrain, keeping the scene bounded on desktop GPUs.
    const rnd=seededRandom(378),positions=[];
    for(let i=0;i<24000;i++) {
      const x=(rnd()-.5)*84,z=-10+rnd()*75,s=surface(x,z);
      if(Math.abs(x)<1.2&&z<1.5)continue;
      positions.push({x,z,h:(s.fair>.5?.019:.08)+rnd()*(s.fair>.5?.025:.11),s});
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.017,0,0,.017,0,0,.005,.6,.012,0,1,.018],3));
    g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
    const mat=new THREE.MeshStandardMaterial({color:'#74954b',roughness:1,side:THREE.DoubleSide});
    const mesh=new THREE.InstancedMesh(g,mat,positions.length),colour=new THREE.Color();
    positions.forEach((p,i)=>{
      scratchObject.position.set(p.x,terrainHeight(p.x,p.z)-.005,p.z);scratchObject.rotation.set(0,rnd()*Math.PI*2,0);
      scratchObject.scale.set(.6+rnd(),p.h,1);scratchObject.updateMatrix();mesh.setMatrixAt(i,scratchObject.matrix);
      const v=.68+rnd()*.35;colour.setRGB(v,v,v*.9);mesh.setColorAt(i,colour);
    });mesh.receiveShadow=true;mesh.frustumCulled=false;this.scene.add(mesh);
  }

  createFlags() {
    for(const z of greens) {
      const flag=new THREE.Group();flag.position.set(center(z),terrainHeight(center(z),z),z);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.022,.027,2.5,8),new THREE.MeshStandardMaterial({color:'#ebede7',roughness:.45}));
      pole.position.y=1.25;pole.castShadow=true;flag.add(pole);
      const clothGeo=new THREE.PlaneGeometry(.72,.43,12,5);clothGeo.translate(.36,2.23,0);
      const cloth=new THREE.Mesh(clothGeo,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.9,side:THREE.DoubleSide}));cloth.castShadow=true;flag.add(cloth);
      const hole=new THREE.Mesh(new THREE.CircleGeometry(.065,24),new THREE.MeshBasicMaterial({color:'#18211a'}));hole.rotation.x=-Math.PI/2;hole.position.y=.011;flag.add(hole);
      this.flags.push({flag,cloth,z,original:clothGeo.attributes.position.array.slice()});this.scene.add(flag);
    }
  }

  createBall() {
    this.ball=new THREE.Mesh(new THREE.SphereGeometry(.02135,20,14),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.3}));
    this.ball.castShadow=true;this.ball.position.set(0,.04,0);this.scene.add(this.ball);
    this.tracer=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#f9f0bb',transparent:true,opacity:.8,depthTest:true}));
    this.tracer.frustumCulled=false;this.tracer.visible=false;this.scene.add(this.tracer);
  }

  resizeCanvas() {
    const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const size=bufferSize(rect.width,rect.height,this.quality,window.devicePixelRatio||1,this.maxBuffer);
    if(this.canvas.width!==size.width||this.canvas.height!==size.height)this.renderer.setSize(size.width,size.height,false);
    this.camera.aspect=rect.width/rect.height;this.camera.updateProjectionMatrix();
    this.canvas.dataset.buffer=`${size.width}x${size.height}`;this.notify();
  }
  setQuality(value){this.quality=['4k','1080','auto'].includes(value)?value:'auto';this.resizeCanvas();}
  getQualityStatus(){return this.error?'Graphics unavailable':this.loading?'Loading course textures…':`${this.canvas.width} × ${this.canvas.height} · textured 3D`;}
  setAim(degrees){this.aim=clamp(Number(degrees)||0,-15,15)*Math.PI/180;}
  setTarget(yards){this.targetYards=Number(yards)||150;for(const f of this.flags)f.cloth.material.color.set(Math.abs(f.z-this.targetYards*YARDS_TO_METRES)<1?'#ffdc45':'#f8f8f3');}
  setView(value){if(value==='downrange')value='landing';this.view=['tee','follow','landing'].includes(value)?value:'tee';this.moveCamera(1,true);}

  playShot(path,onComplete) {
    if(!Array.isArray(path)||path.length<2)return;
    const points=pathToMetres(path).filter(p=>[p.x,p.y,p.z,p.t].every(Number.isFinite));if(points.length<2)return;
    // Smoothly reconcile the visual arc with the course elevation at landing.
    const end=points.at(-1),endY=terrainHeight(end.x,end.z);
    const vectors=points.map((p,i)=>new THREE.Vector3(p.x,Math.max(terrainHeight(p.x,p.z)+.023,p.y+.023+endY*(i/(points.length-1))),p.z));
    this.tracer.geometry.dispose();this.tracer.geometry=new THREE.BufferGeometry().setFromPoints(vectors);this.tracer.geometry.setDrawRange(0,1);
    this.shot={points,vectors,elapsed:0,duration:Math.max(.3,end.t),onComplete,complete:false,index:0};
    this.ball.position.copy(vectors[0]);this.ball.visible=true;
  }
  clearShot(){this.shot=null;this.tracer.visible=false;this.ball.position.set(0,.04,0);this.ball.scale.setScalar(1);}

  moveCamera(dt,instant=false) {
    const position=TEE.clone(),look=new THREE.Vector3(Math.sin(this.aim)*100,1.6,Math.cos(this.aim)*110);
    if(this.view==='follow'&&this.shot) {
      const p=this.ball.position;position.set(p.x-1.7,Math.max(terrainHeight(p.x,p.z)+3.5,p.y+2),p.z-12);
      look.copy(p).add(new THREE.Vector3(0,-.2,5));
    } else if(this.view==='landing') {
      const p=this.shot?.vectors.at(-1)||new THREE.Vector3(center(this.targetYards*YARDS_TO_METRES),0,this.targetYards*YARDS_TO_METRES);
      position.set(p.x-22,terrainHeight(p.x,p.z)+19,p.z-38);look.set(p.x,terrainHeight(p.x,p.z),p.z);
    }
    const a=instant?1:1-Math.exp(-dt*3.8);this.camera.position.lerp(position,a);this.lookAt.lerp(look,a);this.camera.lookAt(this.lookAt);
    this.camera.updateMatrixWorld();
  }

  update(dt) {
    const time=performance.now()/1000;if(this.waterUniform)this.waterUniform.value=time;
    if(this.shot&&!this.shot.complete) {
      const s=this.shot;s.elapsed=Math.min(s.duration,s.elapsed+dt);
      // Keep animation tied to recorded time samples, including irregular ones.
      while(s.index<s.points.length-2&&s.points[s.index+1].t<s.elapsed)s.index++;
      const a=s.points[s.index].t,b=s.points[s.index+1].t,u=clamp((s.elapsed-a)/Math.max(.0001,b-a),0,1);
      this.ball.position.lerpVectors(s.vectors[s.index],s.vectors[s.index+1],u);
      this.tracer.geometry.setDrawRange(0,Math.min(s.vectors.length,s.index+2));
      if(s.elapsed>=s.duration){s.complete=true;this.ball.position.copy(s.vectors.at(-1));s.onComplete?.();}
    }
    this.tracer.visible=Boolean(this.shot&&this.showTracer);
    this.moveCamera(dt);this.updateTrees();
    // A small distance-based visibility aid, not a claim of true angular ball size.
    const distance=this.camera.position.distanceTo(this.ball.position);this.ball.scale.setScalar(this.shot?Math.max(1,distance*.045):1);
    for(const f of this.flags) {
      const attr=f.cloth.geometry.attributes.position;
      for(let i=0;i<attr.count;i++){const x=f.original[i*3];attr.setZ(i,Math.sin(x*8-time*3+f.z)*.055*x/.72);}
      attr.needsUpdate=true;f.cloth.geometry.computeVertexNormals();
    }
  }

  project(legacy) {
    const x=legacy[0]*LEGACY_TO_METRES,z=legacy[2]*LEGACY_TO_METRES;
    const p=new THREE.Vector3(x,terrainHeight(x,z)+legacy[1]*LEGACY_TO_METRES,z).project(this.camera);
    const r=this.canvas.getBoundingClientRect();
    return{x:(p.x*.5+.5)*r.width,y:(-.5*p.y+.5)*r.height,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<.98&&Math.abs(p.y)<.94};
  }

  async export4K() {
    await this.ready;if(this.error)throw this.error;
    if(this.maxBuffer<3840)throw new Error('This GPU cannot create a native 3840 × 2160 image.');
    const oldSize=new THREE.Vector2();this.renderer.getSize(oldSize);const oldAspect=this.camera.aspect;
    try {
      this.renderer.setSize(3840,2160,false);this.camera.aspect=16/9;this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene,this.camera);
      // Read synchronously immediately after render; do not retain every frame's
      // framebuffer just to support an occasional export.
      const url=this.canvas.toDataURL('image/png');
      if(url==='data:,')throw new Error('The browser could not allocate the 4K image.');
      return url;
    } finally {this.renderer.setSize(oldSize.x,oldSize.y,false);this.camera.aspect=oldAspect;this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);}
  }

  dispose() {
    this.disposed=true;cancelAnimationFrame(this.frameId);this.observer.disconnect();window.removeEventListener('resize',this.resize);
    this.canvas.removeEventListener('webglcontextlost',this.contextLost);
    const materials=new Set(),geometries=new Set(),textures=new Set();
    this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.environment?.dispose();this.renderer.dispose();
  }
}
