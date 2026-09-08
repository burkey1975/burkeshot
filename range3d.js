(function(){
'use strict';
function v3(x=0,y=0,z=0){return [x,y,z]}
function add(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function mul(a,s){return[a[0]*s,a[1]*s,a[2]*s]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function norm(a){const l=Math.hypot(...a)||1;return[a[0]/l,a[1]/l,a[2]/l]}
function ident(){return[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}
function translation(x,y,z){let m=ident();m[12]=x;m[13]=y;m[14]=z;return m}
function scale(x,y,z){let m=ident();m[0]=x;m[5]=y;m[10]=z;return m}
function mm(a,b){const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]}
function lookAt(eye,target,up){const z=norm(sub(eye,target)),x=norm(cross(z,up)),y=cross(x,z);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]}
function transformPoint(m,p){const x=p[0],y=p[1],z=p[2];const w=m[3]*x+m[7]*y+m[11]*z+m[15];return[(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w]}

class BurkeRange{
 constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl',{antialias:true,alpha:false})||canvas.getContext('experimental-webgl');if(!this.gl)throw new Error('WebGL unavailable');this.view='tee';this.aim=0;this.target=150;this.showTracer=true;this.anim=null;this.lastPath=[];this._init();}
 _shader(type,src){const g=this.gl,s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s));return s}
 _init(){const g=this.gl;const vs=`attribute vec3 aPos;attribute vec3 aNormal;uniform mat4 uModel;uniform mat4 uVP;varying vec3 vN;varying vec3 vW;void main(){vec4 w=uModel*vec4(aPos,1.0);vW=w.xyz;vN=mat3(uModel)*aNormal;gl_Position=uVP*w;}`;
 const fs=`precision highp float;uniform vec3 uColor;uniform vec3 uLight;uniform float uUnlit;varying vec3 vN;varying vec3 vW;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec3 col=uColor;float light=.62+.38*max(dot(normalize(vN),normalize(uLight)),0.0);
 if(uUnlit>2.5){float h=clamp(vW.y/85.0,0.0,1.0);col=mix(vec3(.78,.87,.85),vec3(.28,.57,.78),pow(h,.55));float cloud=noise(vW.xz*.032+vW.y*.018)*.65+noise(vW.xz*.08)*.35;float cover=smoothstep(.58,.79,cloud)*(1.0-smoothstep(40.0,100.0,vW.y));col=mix(col,vec3(.96,.97,.94),cover*.72);gl_FragColor=vec4(col,1);return;}
 if(uUnlit>1.5){vec2 q=vW.xz;float sway=sin(q.y*.18)*.48;float width=3.0+sin(q.y*.11)*.65+q.y*.028;
 float edge=abs(q.x-sway)-width;float fair=1.0-smoothstep(-.09,.10,edge);
 float stripe=smoothstep(-.09,.09,sin(q.y*1.65));vec3 rough=vec3(.24,.34,.125);vec3 grass=mix(vec3(.31,.45,.18),vec3(.38,.51,.215),stripe);
 col=mix(rough,grass,fair);float grain=noise(q*105.0)*.65+noise(q*310.0)*.35;col*=.86+grain*.28;col*=.93+noise(q*.6)*.14;
 float green=0.0;for(int i=0;i<4;i++){float z=10.0+float(i)*5.0;vec2 g=(q-vec2(0,z))/vec2(1.55,1.0);green=max(green,1.0-smoothstep(.92,1.05,length(g)));}col=mix(col,vec3(.48,.61,.29)*(.95+grain*.1),green*.95);
 float sand1=length((q-vec2(-2.7,15.5))/vec2(.74,1.18));float sand2=length((q-vec2(2.8,20.5))/vec2(.75,1.1));float sand=min(sand1,sand2);col=mix(col,vec3(.79,.73,.54)*(.95+grain*.08),1.0-smoothstep(.94,1.05,sand));
 float lake=length((q-vec2(-6.8,16.0))/vec2(2.3,4.2));col=mix(col,vec3(.22,.42,.44)+noise(q*20.0)*.05,1.0-smoothstep(.93,1.02,lake));
 float treeShade=(1.0-smoothstep(3.6,6.0,abs(q.x)))*smoothstep(2.9,3.8,abs(q.x))*(.5+.5*sin(q.y*1.7+q.x*2.0));col*=1.0-treeShade*.17;
 }else if(uUnlit<.5){float leaf=noise(vW.xz*16.0+vW.y*9.0);col*=.82+leaf*.32;}
 col*=uUnlit>.5&&uUnlit<1.5?1.0:light;
 float fog=1.0-exp(-pow(max(0.0,length(vW.xz)-15.0)*.006,1.6));col=mix(col,vec3(.74,.83,.80),clamp(fog,0.0,.8));gl_FragColor=vec4(col,1.0);}`;const p=g.createProgram();g.attachShader(p,this._shader(g.VERTEX_SHADER,vs));g.attachShader(p,this._shader(g.FRAGMENT_SHADER,fs));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));this.p=p;this.aPos=g.getAttribLocation(p,'aPos');this.aNormal=g.getAttribLocation(p,'aNormal');this.uModel=g.getUniformLocation(p,'uModel');this.uVP=g.getUniformLocation(p,'uVP');this.uColor=g.getUniformLocation(p,'uColor');this.uLight=g.getUniformLocation(p,'uLight');this.uUnlit=g.getUniformLocation(p,'uUnlit');g.enable(g.DEPTH_TEST);g.disable(g.CULL_FACE);this.meshes=[];this._buildCourse();this.ball=this._sphere(.025,12,8);this.tracer=this._dynamicLine();this.landing=this._circleLine(.55,48);this.ballPos=[0,.026,0];this.landingPos=[0,.02,0];this.landingVisible=false;this.resize();window.addEventListener('resize',()=>this.resize());this._loop();}
 _mesh(pos,norm,ind,mode){const g=this.gl,m={mode:mode||g.TRIANGLES,count:ind?ind.length:pos.length/3,indexed:!!ind};m.pb=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,m.pb);g.bufferData(g.ARRAY_BUFFER,new Float32Array(pos),g.STATIC_DRAW);m.nb=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,m.nb);g.bufferData(g.ARRAY_BUFFER,new Float32Array(norm),g.STATIC_DRAW);if(ind){m.ib=g.createBuffer();g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,m.ib);g.bufferData(g.ELEMENT_ARRAY_BUFFER,new Uint16Array(ind),g.STATIC_DRAW)}return m}
 _dynamicLine(){const g=this.gl,m={mode:g.LINE_STRIP,count:0,indexed:false,dynamic:true};m.pb=g.createBuffer();m.nb=g.createBuffer();return m}
 _plane(x1,x2,z1,z2,y=0){return this._mesh([x1,y,z1,x2,y,z1,x2,y,z2,x1,y,z2],[0,1,0,0,1,0,0,1,0,0,1,0],[0,1,2,0,2,3])}
 _box(w,h,d){const x=w/2,y=h/2,z=d/2;const p=[],n=[],ind=[];const faces=[[[ -x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],[[-x,-y,-z],[-x,y,-z],[x,y,-z],[x,-y,-z]],[[-x,y,-z],[-x,y,z],[x,y,z],[x,y,-z]],[[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]],[[x,-y,-z],[x,y,-z],[x,y,z],[x,-y,z]],[[-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]]];const norms=[[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,0],[-1,0,0]];faces.forEach((f,fi)=>{let b=p.length/3;f.forEach(q=>{p.push(...q);n.push(...norms[fi])});ind.push(b,b+1,b+2,b,b+2,b+3)});return this._mesh(p,n,ind)}
 _cylinder(r,h,seg=12){const p=[],n=[],ind=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a);p.push(r*c,0,r*s,r*c,h,r*s);n.push(c,0,s,c,0,s)}for(let i=0;i<seg;i++){let b=i*2;ind.push(b,b+1,b+3,b,b+3,b+2)}return this._mesh(p,n,ind)}
 _cone(r,h,seg=12){const p=[0,h,0],n=[0,1,0],ind=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a);p.push(r*c,0,r*s);n.push(c,.5,s)}for(let i=0;i<seg;i++)ind.push(0,i+1,i+2);return this._mesh(p,n,ind)}
 _sphere(r,lon=14,lat=10){const p=[],n=[],ind=[];for(let j=0;j<=lat;j++){const v=j/lat,ph=v*Math.PI;for(let i=0;i<=lon;i++){const u=i/lon,th=u*Math.PI*2,x=Math.sin(ph)*Math.cos(th),y=Math.cos(ph),z=Math.sin(ph)*Math.sin(th);p.push(r*x,r*y,r*z);n.push(x,y,z)}}for(let j=0;j<lat;j++)for(let i=0;i<lon;i++){const a=j*(lon+1)+i,b=a+lon+1;ind.push(a,b,a+1,b,b+1,a+1)}return this._mesh(p,n,ind)}
 _ellipse(rx,rz,seg=36){const p=[0,0,0],n=[0,1,0],ind=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;p.push(Math.cos(a)*rx,0,Math.sin(a)*rz);n.push(0,1,0)}for(let i=1;i<=seg;i++)ind.push(0,i,i+1);return this._mesh(p,n,ind)}
 _circleLine(r,seg=40){const p=[],n=[];for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;p.push(Math.cos(a)*r,0,Math.sin(a)*r);n.push(0,1,0)}return this._mesh(p,n,null,this.gl.LINE_STRIP)}
 _fairway(){const zs=[0,4,8,12,16,20,24,28,34],ws=[2.2,2.7,3.6,4.1,4.5,4.2,4.6,5.1,5.5];const p=[],n=[],ind=[];for(let i=0;i<zs.length;i++){const sway=Math.sin(i*.78)*.75;for(const s of[-1,1]){p.push(s*ws[i]+sway,.012,zs[i]);n.push(0,1,0)}}for(let i=0;i<zs.length-1;i++){let a=i*2,b=a+2;ind.push(a,b,a+1,b,b+1,a+1)}return this._mesh(p,n,ind)}
 _add(mesh,color,model=ident(),unlit=0){this.meshes.push({mesh,color,model,unlit})}
 _terrain(){
 const p=[],n=[],ind=[],nx=110,nz=130;
 const height=(x,z)=>{const edge=Math.max(0,Math.min(1,(Math.abs(x)-4.3)/8));return edge*(.3+.8*Math.sin(x*.27+z*.12)**2+.35*Math.sin(z*.4))+Math.max(0,z-42)*.013;};
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){let x=-45+i*90/nx,z=-12+j*120/nz,y=height(x,z);p.push(x,y,z);n.push(...norm([-(height(x+.1,z)-height(x-.1,z))/.2,1,-(height(x,z+.1)-height(x,z-.1))/.2]));}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;ind.push(a,b,a+1,a+1,b,b+1);}return this._mesh(p,n,ind);
 }
 _buildCourse(){
 this._add(this._sphere(175,40,24),[1,1,1],ident(),3);
 this._add(this._terrain(),[.35,.49,.2],ident(),2);
 const crown=this._sphere(1,12,9),trunk=this._cylinder(.09,1.3,8);
 let seed=827;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<96;i++){
   const side=i%2?-1:1,z=-1+rand()*69,x=side*(6+rand()*17),h=1.3+rand()*1.6;
   const ground=Math.max(0,Math.min(1,(Math.abs(x)-4.3)/8))*(.3+.8*Math.sin(x*.27+z*.12)**2+.35*Math.sin(z*.4));
   this._add(trunk,[.26,.22,.15],mm(translation(x,ground,z),scale(1,h,1)));
   for(let k=0;k<4;k++){const dx=(rand()-.5)*h*.7,dz=(rand()-.5)*h*.7,dy=(rand()-.5)*h*.4;const shade=.7+rand()*.4;
     this._add(crown,[.24*shade,.35*shade,.12*shade],mm(translation(x+dx,ground+h+dy,z+dz),scale(h*.55,h*.7,h*.57)));
   }
 }
 // Low, distant wooded hills finish the horizon.
 for(let i=0;i<12;i++)this._add(crown,[.34+i*.003,.43+i*.003,.32+i*.003],mm(translation(-50+i*10,1,78+Math.sin(i)*5),scale(13,3.5+rand()*3,9)));
 this.flagPole=this._cylinder(.012,.68,8);this.flagCloth=this._mesh([0,.66,0,.29,.60,0,0,.52,0],[0,0,1,0,0,1,0,0,1],[0,1,2]);
 this.aimMesh=this._dynamicLine();
 }
 setTarget(yd){this.target=yd;}
 resize(){const dpr=Math.min(window.devicePixelRatio||1,2),w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr)}this.gl.viewport(0,0,this.canvas.width,this.canvas.height)}
 setView(v){this.view=v}
 setAim(deg){this.aim=deg}
 clearShot(){this.anim=null;this.lastPath=[];this.landingVisible=false;this.ballPos=[0,.026,0];this._updateTracer([])}
 _updateTracer(path){const g=this.gl,pts=[];path.forEach(q=>pts.push(q[0],q[1],q[2]));g.bindBuffer(g.ARRAY_BUFFER,this.tracer.pb);g.bufferData(g.ARRAY_BUFFER,new Float32Array(pts),g.DYNAMIC_DRAW);g.bindBuffer(g.ARRAY_BUFFER,this.tracer.nb);g.bufferData(g.ARRAY_BUFFER,new Float32Array(pts.length).fill(0).map((_,i)=>i%3===1?1:0),g.DYNAMIC_DRAW);this.tracer.count=path.length}
 playShot(path,onDone){if(!path||path.length<2)return;this.lastPath=path;this.landingVisible=false;this._updateTracer([]);const start=performance.now(),duration=Math.max(1900,Math.min(5200,(path[path.length-1].t||5)*700));this.anim={path,start,duration,onDone,shown:[]}}
 _samplePath(path,t){const end=(path[path.length-1].t||1),tt=t*end;let i=0;while(i<path.length-2&&(path[i+1].t||0)<tt)i++;const a=path[i],b=path[Math.min(i+1,path.length-1)],dt=Math.max(.001,(b.t||1)-(a.t||0)),u=Math.max(0,Math.min(1,(tt-(a.t||0))/dt));return[a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u,a.z+(b.z-a.z)*u]}
 _camera(ball){
 if(this.view==='follow'&&(this.anim||this.landingVisible)){return{eye:[ball[0]+1.1,Math.max(.9,ball[1]+.6),ball[2]-3.2],target:[ball[0],Math.max(.15,ball[1]*.75),ball[2]+4]};}
 if(this.view==='downrange'){const z=this.lastPath.length?this.lastPath[this.lastPath.length-1].z/30:this.target/10;return{eye:[6,4.3,z+5],target:[0,.1,z-2]};}
 return{eye:[0,1.1,-3.1],target:[0,.25,18]};
 }
 _drawMesh(m,model,color,unlit,vp){const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,m.pb);g.vertexAttribPointer(this.aPos,3,g.FLOAT,false,0,0);g.enableVertexAttribArray(this.aPos);g.bindBuffer(g.ARRAY_BUFFER,m.nb);g.vertexAttribPointer(this.aNormal,3,g.FLOAT,false,0,0);g.enableVertexAttribArray(this.aNormal);if(m.indexed)g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,m.ib);g.uniformMatrix4fv(this.uModel,false,new Float32Array(model));g.uniformMatrix4fv(this.uVP,false,new Float32Array(vp));g.uniform3fv(this.uColor,new Float32Array(color));g.uniform1f(this.uUnlit,unlit||0);m.indexed?g.drawElements(m.mode,m.count,g.UNSIGNED_SHORT,0):g.drawArrays(m.mode,0,m.count)}
 _loop(){requestAnimationFrame(()=>this._loop());if(!this.canvas.clientWidth||!this.canvas.clientHeight)return;this.resize();const g=this.gl;g.clearColor(.41,.62,.72,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(this.p);g.uniform3fv(this.uLight,new Float32Array(norm([.4,1,-.3])));
   let ball=this.ballPos;if(this.anim){const u=Math.min(1,(performance.now()-this.anim.start)/this.anim.duration),q=this._samplePath(this.anim.path,u);ball=[q[0]/30,q[1]/30,q[2]/30];this.ballPos=ball;const n=Math.max(2,Math.floor(u*this.anim.path.length));const shown=this.anim.path.slice(0,n).map(p=>[p.x/30,p.y/30,p.z/30]);this._updateTracer(shown);if(u>=1){this.landingVisible=true;this.landingPos=[ball[0],.025,ball[2]];this.ballPos=[ball[0],.026,ball[2]];ball=this.ballPos;const cb=this.anim.onDone;this.anim=null;if(cb)setTimeout(cb,20)}}
   const cam=this._camera(ball),proj=perspective(49*Math.PI/180,this.canvas.width/this.canvas.height,.015,250),view=lookAt(cam.eye,cam.target,[0,1,0]),vp=mm(proj,view);this.vp=vp;
   this.meshes.forEach(o=>this._drawMesh(o.mesh,o.model,o.color,o.unlit,vp));
 this._drawMesh(this.flagPole,translation(0,.025,this.target/10),[.98,.98,.92],1,vp);
 this._drawMesh(this.flagCloth,translation(0,.025,this.target/10),[.9,.98,.52],1,vp);
 const a=this.aim*Math.PI/180,pts=[],nn=[];for(let i=0;i<16;i++){const z=i*.25;pts.push(Math.sin(a)*z,.012,Math.cos(a)*z);nn.push(0,1,0)}
 g.bindBuffer(g.ARRAY_BUFFER,this.aimMesh.pb);g.bufferData(g.ARRAY_BUFFER,new Float32Array(pts),g.DYNAMIC_DRAW);g.bindBuffer(g.ARRAY_BUFFER,this.aimMesh.nb);g.bufferData(g.ARRAY_BUFFER,new Float32Array(nn),g.DYNAMIC_DRAW);this.aimMesh.count=16;this._drawMesh(this.aimMesh,ident(),[.9,.98,.66],1,vp);
 if(this.showTracer&&this.tracer.count>1){g.lineWidth(4);this._drawMesh(this.tracer,ident(),[1,.52,.09],1,vp)}this._drawMesh(this.ball,translation(ball[0],ball[1],ball[2]),[1,1,1],1,vp);if(this.landingVisible)this._drawMesh(this.landing,translation(...this.landingPos),[.72,1,.22],1,vp)
 }
 project(world){if(!this.vp)return null;const p=transformPoint(this.vp,world);return{x:(p[0]*.5+.5)*this.canvas.clientWidth,y:(1-(p[1]*.5+.5))*this.canvas.clientHeight,visible:p[2]>-1&&p[2]<1}}
}

class BurkeRange2D{
 constructor(canvas){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');
  if(!this.ctx)throw new Error('Canvas renderer unavailable');
  this.view='tee';this.aim=0;this.anim=null;this.lastPath=[];this.ballPos={x:0,y:0,z:0};this._loop();
 }
 resize(){const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,this.canvas.clientWidth),h=Math.max(1,this.canvas.clientHeight);if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr)}this.ctx.setTransform(dpr,0,0,dpr,0,0);return{w,h}}
 setView(v){this.view=v}
 setAim(v){this.aim=v}
 clearShot(){this.anim=null;this.lastPath=[];this.ballPos={x:0,y:0,z:0}}
 playShot(path,onDone){if(!path||path.length<2)return;this.lastPath=path;this.anim={path,start:performance.now(),duration:Math.max(1900,Math.min(5200,(path[path.length-1].t||5)*700)),onDone,done:false}}
 _sample(path,u){const end=path[path.length-1].t||1,tt=u*end;let i=0;while(i<path.length-2&&(path[i+1].t||0)<tt)i++;const a=path[i],b=path[Math.min(i+1,path.length-1)],dt=Math.max(.001,(b.t||1)-(a.t||0)),q=Math.max(0,Math.min(1,(tt-(a.t||0))/dt));return{x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q,z:a.z+(b.z-a.z)*q}}
 _toScreen(p,w,h){const z=Math.max(-2,p.z||0),pers=1/(1+z*.022);let cx=w*.50,base=h*.88;if(this.view==='downrange'){cx=w*.48;base=h*.80}const sx=cx+(p.x||0)*2.0*pers;const sy=base-z*1.72*pers-(p.y||0)*5.5*pers;return{x:sx,y:sy}}
 _tree(x,z,s,w,h){const c=this.ctx,p=this._toScreen({x,z,y:0},w,h),k=Math.max(.25,1-z/430);c.fillStyle='#61472d';c.fillRect(p.x-2*k,p.y-20*s*k,4*k,20*s*k);c.fillStyle='#28552d';c.beginPath();c.arc(p.x,p.y-28*s*k,16*s*k,0,Math.PI*2);c.fill()}
 _drawCourse(w,h){const c=this.ctx;const sky=c.createLinearGradient(0,0,0,h*.7);sky.addColorStop(0,'#75a8c4');sky.addColorStop(1,'#c5d9d7');c.fillStyle=sky;c.fillRect(0,0,w,h);c.fillStyle='#23532b';c.fillRect(0,h*.48,w,h*.52);
   c.fillStyle='#48843b';c.beginPath();c.moveTo(w*.43,h*.89);c.lineTo(w*.57,h*.89);c.lineTo(w*.71,h*.48);c.lineTo(w*.29,h*.48);c.closePath();c.fill();
   c.fillStyle='#5e9b50';c.beginPath();c.ellipse(w*.50,h*.54,w*.10,h*.035,0,0,Math.PI*2);c.fill();
   c.fillStyle='#d1be83';c.beginPath();c.ellipse(w*.38,h*.59,w*.055,h*.018,-.15,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(w*.63,h*.53,w*.05,h*.016,.15,0,Math.PI*2);c.fill();
   c.strokeStyle='#e8eee7aa';c.lineWidth=1.5;c.setLineDash([7,8]);c.beginPath();c.moveTo(w*.50,h*.89);c.lineTo(w*.50,h*.49);c.stroke();c.setLineDash([]);
   for(const z of [50,100,150,200,250]){const y=h*.88-(z/300)*(h*.38);c.strokeStyle='#ffffff2d';c.beginPath();c.moveTo(w*.32,y);c.lineTo(w*.68,y);c.stroke()}
   const trees=[[-95,45,1.0],[-120,75,1.15],[-90,115,.95],[100,65,1.05],[125,95,1.2],[105,145,1.1],[-115,170,1.25],[120,205,1.25],[-105,240,1.0],[115,275,1.15]];trees.forEach(t=>this._tree(...t,w,h));
   c.fillStyle='#f4f4ef';c.fillRect(w*.50-1,h*.51,2,46);c.fillStyle='#e84a38';c.beginPath();c.moveTo(w*.50,h*.51);c.lineTo(w*.50+24,h*.52);c.lineTo(w*.50,h*.535);c.closePath();c.fill();
 }
 _drawShot(w,h){const c=this.ctx;if(this.lastPath.length>1){c.strokeStyle='#ff8f24';c.lineWidth=5;c.lineCap='round';c.shadowColor='#ff8f24';c.shadowBlur=10;c.beginPath();this.lastPath.forEach((p,i)=>{const q=this._toScreen(p,w,h);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y)});c.stroke();c.shadowBlur=0}
   const q=this._toScreen(this.ballPos,w,h);c.fillStyle='#fff';c.beginPath();c.arc(q.x,q.y,5,0,Math.PI*2);c.fill();c.strokeStyle='#222';c.lineWidth=1;c.stroke()
 }
 _loop(){requestAnimationFrame(()=>this._loop());const {w,h}=this.resize();if(this.anim){const u=Math.min(1,(performance.now()-this.anim.start)/this.anim.duration);this.ballPos=this._sample(this.anim.path,u);this.lastPath=this.anim.path.slice(0,Math.max(2,Math.floor(u*this.anim.path.length)));if(u>=1&&!this.anim.done){this.anim.done=true;const cb=this.anim.onDone;this.anim=null;if(cb)setTimeout(cb,20)}}this._drawCourse(w,h);this._drawShot(w,h)}
 project(world){const w=this.canvas.clientWidth,h=this.canvas.clientHeight,p={x:(world[0]||0)*10,y:(world[1]||0)*10,z:(world[2]||0)*10},q=this._toScreen(p,w,h);return{x:q.x,y:q.y,visible:q.x>-40&&q.x<w+40&&q.y>-40&&q.y<h+40}}
}
window.BurkeRange=BurkeRange;
window.BurkeRange2D=BurkeRange2D;
})();