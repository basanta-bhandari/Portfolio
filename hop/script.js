const distros=[
  {id:"mint",name:"Linux Mint",base:"ubuntu",color:"#87cf3e",dm:"lightdm",cleanup:"mint",meta:"mint-meta-cinnamon",
   draw:(ctx,s)=>{drawLeaf(ctx,s)}},
  {id:"ubuntu",name:"Ubuntu",base:"ubuntu",color:"#e95420",dm:"gdm3",cleanup:null,meta:"ubuntu-desktop",
   draw:(ctx,s)=>{drawUbuntu(ctx,s)}},
  {id:"kubuntu",name:"Kubuntu",base:"ubuntu",color:"#0079c1",dm:"sddm",cleanup:null,meta:"kubuntu-desktop",
   draw:(ctx,s)=>{drawGear(ctx,s,'#0079c1')}},
  {id:"xubuntu",name:"Xubuntu",base:"ubuntu",color:"#00709c",dm:"lightdm",cleanup:null,meta:"xubuntu-desktop",
   draw:(ctx,s)=>{drawX(ctx,s)}},
  {id:"lubuntu",name:"Lubuntu",base:"ubuntu",color:"#0068c8",dm:"sddm",cleanup:null,meta:"lubuntu-desktop",
   draw:(ctx,s)=>{drawL(ctx,s)}},
  {id:"popos",name:"Pop!_OS",base:"ubuntu",color:"#48b9c7",dm:"gdm3",cleanup:"pop-os",meta:"pop-desktop",
   draw:(ctx,s)=>{drawPop(ctx,s)}},
  {id:"elementary",name:"elementary OS",base:"ubuntu",color:"#3689e6",dm:"lightdm",cleanup:"elementary",meta:"elementary-desktop",
   draw:(ctx,s)=>{drawE(ctx,s)}},
  {id:"zorin",name:"Zorin OS",base:"ubuntu",color:"#15a6f0",dm:"gdm3",cleanup:"zorin",meta:"zorin-os-lite",
   draw:(ctx,s)=>{drawZorin(ctx,s)}},
  {id:"debian",name:"Debian",base:"debian",color:"#d70a53",dm:"gdm3",cleanup:null,meta:"task-gnome-desktop",
   draw:(ctx,s)=>{drawSwirl(ctx,s)}},
  {id:"devuan",name:"Devuan",base:"debian",color:"#6c6f85",dm:"lightdm",cleanup:"devuan",meta:"task-lxde-desktop",
   draw:(ctx,s)=>{drawFork(ctx,s)}},
  {id:"mxlinux",name:"MX Linux",base:"debian",color:"#4d5e73",dm:"lightdm",cleanup:"mx",meta:"mx-desktop",
   draw:(ctx,s)=>{drawMX(ctx,s)}},
  {id:"kdeneon",name:"KDE Neon",base:"ubuntu",color:"#1d99f3",dm:"sddm",cleanup:"neon",meta:"kde-standard",
   draw:(ctx,s)=>{drawGear(ctx,s,'#1d99f3')}},
];


function drawLeaf(ctx,s){
  const c=s/2,r=s*.28;
  ctx.fillStyle='rgba(255,255,255,0.18)';
  ctx.strokeStyle='rgba(255,255,255,0.9)';
  ctx.lineWidth=s*.035;
  ctx.beginPath();
  ctx.moveTo(c,c-r);
  ctx.bezierCurveTo(c+r*.85,c-r*.4,c+r*.85,c+r*.4,c,c+r);
  ctx.bezierCurveTo(c-r*.85,c+r*.4,c-r*.85,c-r*.4,c,c-r);
  ctx.fill();ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c,c-r*.9);ctx.lineTo(c,c+r*.9);
  ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=s*.018;ctx.stroke();
  for(let i=-3;i<=3;i++){
    if(i===0)continue;
    const y=c+i*r*.26,dx=Math.sqrt(Math.max(0,r*r-(y-c)*(y-c)))*.7;
    ctx.beginPath();ctx.moveTo(c,y);ctx.lineTo(c+(i>0?-1:1)*dx,y-(i>0?1:-1)*s*.04);
    ctx.stroke();
  }
}
function drawUbuntu(ctx,s){
  const c=s/2,or=s*.23,r=s*.1;
  ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=r*.55;
  ctx.beginPath();ctx.arc(c,c,or,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<3;i++){
    const a=i*2*Math.PI/3-Math.PI/2;
    ctx.beginPath();ctx.arc(c+or*Math.cos(a),c+or*Math.sin(a),r,0,Math.PI*2);
    ctx.fillStyle='white';ctx.fill();
  }
}
function drawGear(ctx,s,bg){
  const c=s/2,r=s*.3,ir=s*.2,teeth=12,hr=s*.1;
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath();
  for(let i=0;i<teeth*2;i++){
    const a=i*Math.PI/teeth-Math.PI/2;
    const rad=i%2===0?r:ir;
    const x=c+rad*Math.cos(a),y=c+rad*Math.sin(a);
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.fill();
  ctx.globalCompositeOperation='destination-out';
  ctx.beginPath();ctx.arc(c,c,hr,0,Math.PI*2);ctx.fillStyle='black';ctx.fill();
  ctx.globalCompositeOperation='source-over';
}
function drawX(ctx,s){
  const c=s/2,r=s*.3,w=s*.08;
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.save();ctx.translate(c,c);ctx.rotate(Math.PI/4);
  ctx.fillRect(-r,-w/2,r*2,w);
  ctx.fillRect(-w/2,-r,w,r*2);
  ctx.restore();
}
function drawL(ctx,s){
  const c=s/2;
  ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=s*.07;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(c-s*.08,c-s*.28);ctx.lineTo(c-s*.08,c+s*.2);ctx.lineTo(c+s*.22,c+s*.2);ctx.stroke();
  ctx.beginPath();ctx.arc(c-s*.08,c+s*.2,s*.07,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
}
function drawPop(ctx,s){
  const c=s/2,r=s*.24,sr=s*.32;
  ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=s*.05;
  ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.ellipse(c,c,sr,sr*.35,-.4,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath();ctx.arc(c,c-s*.13,s*.05,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(c,c+s*.04,s*.04,0,Math.PI*2);ctx.fill();
}
function drawE(ctx,s){
  const c=s/2,r=s*.28,g=s*.05;
  ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=s*.07;ctx.lineCap='round';
  ctx.beginPath();ctx.arc(c,c,r,-Math.PI*.1,Math.PI*1.3);ctx.stroke();
  ctx.beginPath();ctx.moveTo(c-r,c);ctx.lineTo(c+r,c);ctx.stroke();
}
function drawZorin(ctx,s){
  const c=s/2,h=s*.28,w=s*.26;
  ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=s*.06;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(c-w,c-h);ctx.lineTo(c+w,c-h);ctx.lineTo(c-w,c+h);ctx.lineTo(c+w,c+h);ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=s*.04;
  ctx.beginPath();ctx.arc(c,c,s*.38,0,Math.PI*2);ctx.stroke();
}
function drawSwirl(ctx,s){
  const c=s/2;
  ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=s*.055;ctx.lineCap='round';
  ctx.beginPath();
  for(let t=0;t<Math.PI*4;t+=.05){
    const r=s*(.06+.12*(t/(Math.PI*4))),x=c+r*Math.cos(t-Math.PI/2),y=c+r*Math.sin(t-Math.PI/2);
    t===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.stroke();
}
function drawFork(ctx,s){
  const c=s/2;
  ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=s*.065;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(c,c+s*.28);ctx.lineTo(c,c-s*.1);ctx.stroke();
  ctx.beginPath();ctx.moveTo(c,c-s*.1);ctx.lineTo(c-s*.18,c-s*.28);ctx.stroke();
  ctx.beginPath();ctx.moveTo(c,c-s*.1);ctx.lineTo(c+s*.18,c-s*.28);ctx.stroke();
  ctx.beginPath();ctx.arc(c-s*.18,c-s*.3,s*.06,0,Math.PI*2);
  ctx.arc(c+s*.18,c-s*.3,s*.06,0,Math.PI*2);
  ctx.arc(c,c+s*.3,s*.06,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fill();
}
function drawMX(ctx,s){
  const c=s/2,r=s*.25;
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.font=`bold ${s*.38}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('MX',c,c);
}

function makeTexture(distro){
  const S = 512, canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = distro.color;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - .5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 18, 0, Math.PI * 2);
  ctx.stroke();
  distro.draw(ctx, S);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = `bold ${S * .078}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(distro.name, S / 2, S * .89);
  return new THREE.CanvasTexture(canvas);
}


let scene,camera,renderer,orbitGroup,tuxGroup,clock;
const sphereMeshes={};

// ==========================================
//  STEP 1: 3D INTERACTION VARIABLE REGISTRY
// ==========================================
let raycaster, mouse, hoveredMesh = null, tooltipEl = null;
let fromId=null,toId=null;

function initThree(){
  const canvas=document.getElementById('canvas');
  renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(55,window.innerWidth/window.innerHeight,.1,3000);
  camera.position.set(0,30,320);
  clock=new THREE.Clock();

  scene.add(new THREE.AmbientLight(0x99ccff,0.7));
  const sun=new THREE.DirectionalLight(0xffffff,1.5);
  sun.position.set(80,150,120);scene.add(sun);
  const backLight=new THREE.DirectionalLight(0x4488ff,0.4);
  backLight.position.set(-80,-50,-100);scene.add(backLight);

  addStars();
  buildTux();
  buildDistroSpheres();
  
  // Wire up Step 1 Viewport Raycasting listeners
  initInteractionSystem();
  
  animate();

  window.addEventListener('resize',()=>{
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  });
}

function addStars(){
  const geo=new THREE.BufferGeometry();
  const verts=[];
  for(let i=0;i<1800;i++){
    verts.push((Math.random()-.5)*2800,(Math.random()-.5)*2800,(Math.random()-.5)*2800);
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:1.3,sizeAttenuation:true})));
}

function buildTux(){
  tuxGroup=new THREE.Group();
  const black=new THREE.MeshPhongMaterial({color:0x111111,shininess:80});
  const white=new THREE.MeshPhongMaterial({color:0xffffff,shininess:60});
  const orange=new THREE.MeshPhongMaterial({color:0xff8800,shininess:40});
  const yellow=new THREE.MeshPhongMaterial({color:0xffcc00,shininess:40});

  const body=new THREE.Mesh(new THREE.SphereGeometry(44,32,32),black);
  body.scale.set(1,1.25,.9);body.position.y=-5;tuxGroup.add(body);
  const belly=new THREE.Mesh(new THREE.SphereGeometry(32,32,32),white);
  belly.scale.set(.88,1.1,.5);belly.position.set(0,-5,28);tuxGroup.add(belly);
  const ybelly=new THREE.Mesh(new THREE.SphereGeometry(18,32,32),yellow);
  ybelly.scale.set(.9,.65,.3);ybelly.position.set(0,-28,38);tuxGroup.add(ybelly);
  const head=new THREE.Mesh(new THREE.SphereGeometry(26,32,32),black);
  head.position.y=54;tuxGroup.add(head);
  const face=new THREE.Mesh(new THREE.SphereGeometry(19,32,32),white);
  face.scale.set(.88,.75,.48);face.position.set(0,51,21);tuxGroup.add(face);
  [[-9,59,22],[9,59,22]].forEach(([x,y,z])=>{
    const e=new THREE.Mesh(new THREE.SphereGeometry(4.5,16,16),white);
    e.position.set(x,y,z);tuxGroup.add(e);
    const p=new THREE.Mesh(new THREE.SphereGeometry(2.2,16,16),black);
    p.position.set(x,y,z+2.5);tuxGroup.add(p);
  });
  const beak=new THREE.Mesh(new THREE.ConeGeometry(5,11,8),orange);
  beak.rotation.x=-Math.PI/2;beak.position.set(0,50,27);tuxGroup.add(beak);
  [[-46,0],[46,0]].forEach(([x,],i)=>{
    const w=new THREE.Mesh(new THREE.SphereGeometry(20,32,32),black.clone());
    w.scale.set(.38,1.05,.65);w.position.set(x,-8,0);
    w.rotation.z=(i===0?.28:-.28);tuxGroup.add(w);
  });
  [[-19,-66],[19,-66]].forEach(([x,y])=>{
    const f=new THREE.Mesh(new THREE.BoxGeometry(18,5,26),orange.clone());
    f.position.set(x,y,14);tuxGroup.add(f);
    const toe1=new THREE.Mesh(new THREE.SphereGeometry(4,12,12),orange.clone());
    toe1.position.set(x,y,26);tuxGroup.add(toe1);
  });
  scene.add(tuxGroup);
}

function buildDistroSpheres(){
  orbitGroup=new THREE.Group();scene.add(orbitGroup);
  distros.forEach((d,i)=>{
    const tex=makeTexture(d);
    const mesh=new THREE.Mesh(
      new THREE.SphereGeometry(20,48,48),
      new THREE.MeshPhongMaterial({map:tex,shininess:30})
    );
    const angle=i*(2*Math.PI/distros.length);
    const radius=155;
    mesh.position.set(
      Math.cos(angle)*radius,
      Math.sin(i*.7)*22,
      Math.sin(angle)*radius
    );
    mesh.userData={id:d.id,baseAngle:angle,originalScale:1.0};
    sphereMeshes[d.id]=mesh;
    orbitGroup.add(mesh);
  });
}

// ==============================================================
//  STEP 1 ENGINE: RAYCAST DETECTION & TOOLTIP ALIGNMENT
// ==============================================================
function initInteractionSystem() {
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  tooltipEl = document.createElement('div');
  tooltipEl.style.position = 'absolute';
  tooltipEl.style.pointerEvents = 'none';
  tooltipEl.style.background = 'rgba(7, 12, 22, 0.94)';
  tooltipEl.style.border = '1px solid #4488ff';
  tooltipEl.style.color = '#fff';
  tooltipEl.style.padding = '8px 14px';
  tooltipEl.style.borderRadius = '6px';
  tooltipEl.style.fontSize = '12px';
  tooltipEl.style.fontFamily = 'monospace';
  tooltipEl.style.display = 'none';
  tooltipEl.style.zIndex = '9999';
  tooltipEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
  document.body.appendChild(tooltipEl);

  const canvas = document.getElementById('canvas');
  
  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    tooltipEl.style.left = (e.clientX + 16) + 'px';
    tooltipEl.style.top = (e.clientY + 16) + 'px';
  });

  window.addEventListener('click', () => {
    if (!orbitGroup || Math.abs(mouse.x) > 1 || Math.abs(mouse.y) > 1) return;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(orbitGroup.children);
    
    if (intersects.length > 0) {
      const targetId = intersects[0].object.userData.id;
      handle3DSelection(targetId);
    }
  });
}

function handle3DSelection(id) {
  if (fromId === id) {
    fromId = null;
    syncSelectionState();
    return;
  }
  if (toId === id) {
    toId = null;
    syncSelectionState();
    return;
  }
  
  if (!fromId) {
    selectDistroUnified('from', id);
  } else {
    selectDistroUnified('to', id);
  }
}

function syncSelectionState() {
  ['from', 'to'].forEach(side => {
    const activeId = (side === 'from') ? fromId : toId;
    document.querySelectorAll(`#${side}-grid .distro-btn`).forEach(b => {
      b.classList.toggle('selected', b.dataset.id === activeId);
    });
    
    const labelNode = document.getElementById(side + '-name');
    if (labelNode) {
      const match = distros.find(d => d.id === activeId);
      labelNode.textContent = match ? match.name : (side === 'from' ? 'Source Distro' : 'Target Distro');
    }
  });
  updateUI();
}

function animate(){
  requestAnimationFrame(animate);
  const t=clock.getElapsedTime();
  if(orbitGroup)orbitGroup.rotation.y=t*.18;
  if(tuxGroup){
    tuxGroup.rotation.y=Math.sin(t*.4)*.12;
    tuxGroup.position.y=Math.sin(t*.6)*3;
  }
  
  if (orbitGroup) {
    orbitGroup.children.forEach(m=>{
      m.rotation.y=-t*.25+m.userData.baseAngle;
      
      // Keep selected spheres scaled up slightly
      if (m.userData.id === fromId || m.userData.id === toId) {
        m.scale.lerp(new THREE.Vector3(1.3, 1.3, 1.3), 0.1);
      } else if (m !== hoveredMesh) {
        m.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
      }
    });
    
    // Evaluate Raycasting Hover Engine state
    if (raycaster && Math.abs(mouse.x) <= 1 && Math.abs(mouse.y) <= 1) {
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(orbitGroup.children);
      if (hits.length > 0) {
        const hitObject = hits[0].object;
        if (hoveredMesh !== hitObject) {
          hoveredMesh = hitObject;
          document.body.style.cursor = 'pointer';
          const dData = distros.find(x => x.id === hitObject.userData.id);
          if (dData) {
            tooltipEl.style.display = 'block';
            tooltipEl.style.borderColor = dData.color;
            tooltipEl.innerHTML = `<b style="color:${dData.color}; font-size:13px;">${dData.name}</b><br><span style="opacity:0.7;">BASE: ${dData.base.toUpperCase()}</span><br><span style="font-size:10px; color:#aaa; margin-top:4px; display:block;">Click to set selection</span>`;
          }
        }
        hoveredMesh.scale.lerp(new THREE.Vector3(1.35, 1.35, 1.35), 0.15);
      } else {
        if (hoveredMesh) {
          document.body.style.cursor = 'default';
          tooltipEl.style.display = 'none';
          hoveredMesh = null;
        }
      }
    }
  }
  
  renderer.render(scene,camera);
}

function renderGrids(){
  // Targets your actual HTML ring containers from image_92f805.jpg
  ['from-ring','to-ring'].forEach((gid,isTo)=>{
    const ring=document.getElementById(gid);
    if (!ring) return;
    ring.innerHTML = '';
    distros.forEach(d=>{
      const btn=document.createElement('div');
      btn.className='distro-btn'; // Tailor this class to fit your radial CSS
      btn.dataset.id=d.id;
      btn.innerHTML=`<div class="dname">${d.name}</div>`;
      btn.onclick=()=>{
        selectDistroUnified(isTo ? 'to' : 'from', d.id);
      };
      ring.appendChild(btn);
    });
  });
}

function selectDistroUnified(side, id) {
  if (side === 'from') fromId = id; else toId = id;
  
  // Highlight active items inside your actual elements
  const ring = document.getElementById(side + '-ring');
  if (ring) {
    ring.querySelectorAll('.distro-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.id === id);
    });
  }
  
  const d = distros.find(x => x.id === id);
  if (d) {
    // Updates the text block target ("tap to choose")
    const labelNode = document.getElementById(side + '-name');
    if (labelNode) labelNode.textContent = d.name;

    const panel = document.getElementById(side + '-panel');
    if (panel) {
      panel.style.boxShadow = `0 0 50px ${d.color}33`;
      panel.style.borderColor = `${d.color}66`;
    }
  }
  updateUI();
}

  const d = distros.find(x => x.id === id);
  if (d) {
    const toggle = document.getElementById(side + '-toggle');
    if (toggle) {
      toggle.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${d.color};border-radius:50%;margin-right:6px;vertical-align:middle;"></span>${d.name}`;
    }
    const labelNode = document.getElementById(side + '-name');
    if (labelNode) labelNode.textContent = d.name;

    const panel = document.getElementById(side + '-panel');
    if (panel) {
      panel.style.boxShadow = `0 0 50px ${d.color}33`;
      panel.style.borderColor = `${d.color}66`;
    }
  }

  if (typeof closeAllRadials === 'function') closeAllRadials();
  updateUI();
}

// Retain original fallback signature wrapper for reference
function selectDistro(side,id){
  selectDistroUnified(side, id);
}

function updateUI(){
  const btn=document.getElementById('gen-btn');
  const badge=document.getElementById('risk-badge');
  const label=document.getElementById('path-label');
  const hint=document.getElementById('hint');

  if(fromId&&toId&&fromId!==toId){
    const f=distros.find(d=>d.id===fromId);
    const t=distros.find(d=>d.id===toId);
    const sameBase=f.base===t.base;
    if (badge) {
      badge.style.display='block';
      if(sameBase){
        badge.style.background='rgba(34,255,136,0.15)';
        badge.style.border='1px solid #22ff88';
        badge.style.color='#22ff88';
        badge.textContent='✓ Safe migration path';
      } else {
        badge.style.background='rgba(255,180,0,0.15)';
        badge.style.border='1px solid #ffbb00';
        badge.style.color='#ffcc44';
        badge.textContent='⚠ Warning! Different base risky';
      }
    }
    if (label) label.textContent=`${f.name}  →  ${t.name}`;
    if (btn) btn.disabled=false;
    if (hint) hint.textContent=sameBase?'Same package base — in-place migration is supported':'Different bases — script will include clean-install guidance';
  } else if(fromId===toId&&fromId!==null){
    if (badge) {
      badge.style.display='block';
      badge.style.background='rgba(100,100,100,0.15)';
      badge.style.border='1px solid #555';
      badge.style.color='#888';
      badge.textContent='Same distro';
    }
    if (btn) btn.disabled=true;
    if (hint) hint.textContent='Select different source and target distros';
  } else {
    if (badge) badge.style.display='none';
    if (btn) btn.disabled=true;
  }
}

// =====================================================================
//  STEP 3 WORKSPACE: PARSED STEP VIEWER & LIVE TERMINAL SIMULATOR
// =====================================================================
function generate(){
  const f=distros.find(d=>d.id===fromId);
  const t=distros.find(d=>d.id===toId);
  const sameBase=f.base===t.base;
  let script='';
  if(sameBase&&f.base==='ubuntu'){
    script=genUbuntuToUbuntu(f,t);
  } else if(sameBase&&f.base==='debian'){
    script=genDebianToDebian(f,t);
  } else {
    script=genCrossBase(f,t);
  }
  
  const wrap=document.getElementById('code-wrap');
  if(!wrap) return;
  wrap.style.display='block';
  
  // Inject custom stylesheet configuration rules into headers if not loaded
  if(!document.getElementById('terminal-dash-styles')) {
    const styleBlock = document.createElement('style');
    styleBlock.id = 'terminal-dash-styles';
    styleBlock.innerHTML = `
      .hop-workspace { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; width:100%; }
      .hop-tabs { display: flex; gap: 6px; border-bottom: 2px solid #1e293b; }
      .hop-tab-btn { background: #0f172a; color: #64748b; border: 1px solid #1e293b; border-bottom: none; padding: 10px 18px; cursor: pointer; font-weight: 600; border-radius: 6px 6px 0 0; transition: all 0.2s; font-size:12px; }
      .hop-tab-btn.active { background: #1e293b; color: #00ffcc; border-color: #00ffcc; }
      .hop-panel-container { background: #090f1c; border: 1px solid #1e293b; border-radius: 8px; min-height: 440px; overflow: hidden; position: relative; }
      .hop-pane { display: none; padding: 16px; height:100%; }
      .hop-pane.active { display: block; }
      
      .stepper-layout { display: flex; gap: 16px; height: 420px; }
      .stepper-sidebar { width: 230px; display: flex; flex-direction: column; gap: 6px; border-right: 1px solid #1e293b; padding-right: 12px; overflow-y: auto; }
      .stepper-bubble { padding: 10px; background: #0f172a; border: 1px solid #1e293b; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size:12px; text-align: left; color:#94a3b8; }
      .stepper-bubble:hover { background: #1e293b; border-color: #3b82f6; }
      .stepper-bubble.active { background: rgba(0, 255, 204, 0.08); border-color: #00ffcc; color: #00ffcc; font-weight: bold; }
      .stepper-code-content { flex: 1; overflow-y: auto; background: #040712; padding: 14px; border-radius: 6px; border: 1px solid #111827; font-family: monospace; white-space: pre-wrap; line-height:1.4; color:#cbd5e1; font-size:13px; }
      
      .terminal-window { background: #020617; border-radius: 8px; border: 1px solid #1e293b; overflow: hidden; display:flex; flex-direction:column; height:410px; box-shadow: inset 0 4px 20px rgba(0,0,0,0.8); }
      .terminal-header { background: #0f172a; padding: 8px 14px; display: flex; align-items: center; border-bottom: 1px solid #1e293b; position:relative; }
      .terminal-dots { display: flex; gap: 5px; }
      .terminal-dot { width: 10px; height: 10px; border-radius: 50%; }
      .dot-red { background: #ef4444; }
      .dot-yellow { background: #f59e0b; }
      .dot-green { background: #10b981; }
      .terminal-title { color: #64748b; font-size: 11px; font-family: monospace; position: absolute; left: 50%; transform: translateX(-50%); }
      .terminal-body { flex: 1; padding: 14px; overflow-y: auto; font-family: 'Courier New', Courier, monospace; font-size: 13px; color: #38bdf8; line-height: 1.4; text-align: left; }
      .terminal-prompt { color: #f43f5e; font-weight: bold; }
      .terminal-input { color: #f8fafc; }
      .terminal-cursor { display: inline-block; width: 7px; height: 14px; background: #38bdf8; animation: blink 0.9s infinite; vertical-align: middle; }
      .terminal-controls { padding: 10px 14px; background: #0f172a; border-top: 1px solid #1e293b; display: flex; gap: 12px; align-items: center; }
      .term-btn { background: #2563eb; color: white; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size:12px; transition: background 0.2s; }
      .term-btn:hover { background: #1d4ed8; }
      .term-btn:disabled { background: #334155; opacity:0.5; cursor:not-allowed; }
      .term-progress-bar { flex: 1; height: 6px; background: #1e293b; border-radius: 3px; overflow: hidden; display: none; }
      .term-progress-fill { height: 100%; width: 0%; background: #38bdf8; }
    `;
    document.head.appendChild(styleBlock);
  }

  const stepsList = parseScriptToSteps(script, f, t);

  // Remodel #code-wrap container to structure advanced dashboard elements
  wrap.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom:1px solid #1e293b; padding-bottom:8px;">
      <h3 id="path-label" style="margin:0; color:#00ffcc; font-size: 1.15rem;">${f.name} &rarr; ${t.name}</h3>
      <button id="copy-btn" style="padding: 6px 12px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">COPY FULL SCRIPT</button>
    </div>
    
    <div class="hop-workspace">
      <div class="hop-tabs">
        <button class="hop-tab-btn active" id="tab-btn-steps">MODULAR STEP STEPPER</button>
        <button class="hop-tab-btn" id="tab-btn-term">LIVE TERMINAL SIMULATOR</button>
      </div>
      
      <div class="hop-panel-container">
        <div class="hop-pane active" id="pane-steps">
          <div class="stepper-layout">
            <div class="stepper-sidebar" id="stepper-sidebar-list"></div>
            <div class="stepper-code-content" id="stepper-code-viewer"></div>
          </div>
        </div>
        
        <div class="hop-pane" id="pane-term">
          <div class="terminal-window">
            <div class="terminal-header">
              <div class="terminal-dots"><div class="terminal-dot dot-red"></div><div class="terminal-dot dot-yellow"></div><div class="terminal-dot dot-green"></div></div>
              <div class="terminal-title">bash sandbox - pipeline_sim.sh</div>
            </div>
            <div class="terminal-body" id="term-body-logs">
              <span class="terminal-prompt">penguin@distrohop:~$</span> <span class="terminal-input">./distrohop_migrate.sh</span><br>
              <span style="color:#475569;"># Press "START SIMULATION" to run execution pipelines inside safety sandbox...</span><br><br>
            </div>
            <div class="terminal-controls">
              <button class="term-btn" id="term-start-btn">START SIMULATION</button>
              <div class="term-progress-bar" id="term-progress"><div class="term-progress-fill" id="term-progress-fill"></div></div>
              <span id="term-status-text" style="color:#64748b; font-size:11px; font-family:monospace;">Ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="code-out" style="display:none;"></div>
  `;

  // Hydrate Step Stepper layout elements
  const sidebar = document.getElementById('stepper-sidebar-list');
  const viewer = document.getElementById('stepper-code-viewer');
  
  stepsList.forEach((step, idx) => {
    const bubble = document.createElement('button');
    bubble.className = `stepper-bubble ${idx === 0 ? 'active' : ''}`;
    bubble.innerHTML = `<strong>${step.title}</strong><br><span style="font-size:10px;opacity:0.6">${step.desc}</span>`;
    bubble.onclick = () => {
      document.querySelectorAll('.stepper-bubble').forEach(b => b.classList.remove('active'));
      bubble.classList.add('active');
      viewer.innerHTML = syntaxHighlight(step.code);
    };
    sidebar.appendChild(bubble);
  });
  
  if(stepsList.length > 0) viewer.innerHTML = syntaxHighlight(stepsList[0].code);

  // Rebind full script copy interactions
  document.getElementById('copy-btn').onclick = function(){
    navigator.clipboard.writeText(script).then(() => {
      this.textContent = 'COPIED SCRIPT!';
      this.style.borderColor = '#00ffcc';
      setTimeout(() => {
        this.textContent = 'COPY FULL SCRIPT';
        this.style.borderColor = '#334155';
      }, 2000);
    });
  };

  // Wire up workspace tab switching mechanics
  document.getElementById('tab-btn-steps').onclick = () => {
    document.getElementById('tab-btn-steps').classList.add('active');
    document.getElementById('tab-btn-term').classList.remove('active');
    document.getElementById('pane-steps').classList.add('active');
    document.getElementById('pane-term').classList.remove('active');
  };
  document.getElementById('tab-btn-term').onclick = () => {
    document.getElementById('tab-btn-term').classList.add('active');
    document.getElementById('tab-btn-steps').classList.remove('active');
    document.getElementById('pane-term').classList.add('active');
    document.getElementById('pane-steps').classList.remove('active');
  };

  // Connect simulation engine events
  document.getElementById('term-start-btn').onclick = () => {
    executeMockTerminal(sameBase, f, t);
  };

  if (document.getElementById('hint')) {
    document.getElementById('hint').textContent = 'Review every step carefully before running. Always backup first!';
  }
}

function parseScriptToSteps(script, f, t) {
  const arr = [];
  arr.push({
    title: "00. Data Safeguard",
    desc: "Export environment configs",
    code: `step00_backup() {\n  echo "[00] Backing up home directory..."\n  rsync -av --progress /home/$USER/ /media/backup/home-\$(date +%F)/\n  dpkg --get-selections > ~/pkg-list-backup.txt\n  apt-mark showmanual > ~/manually-installed.txt\n}`
  });

  if (f.base !== t.base) {
    arr.push({
      title: "01. Config Extraction",
      desc: "Isolate profile details",
      code: `# Essential paths to evaluate before wiping bare metal:\n- Core SSH keys: ~/.ssh/\n- Application caches: ~/.config/\n- Browser configurations: ~/.mozilla / ~/.config/google-chrome\n- System records: crontab -l > ~/my-crontab.txt`
    });
    arr.push({
      title: "02. Flashing Media",
      desc: "Produce downstream live usb",
      code: `# Use dd to flash down the verified image iso structure:\ndd if=${t.id}.iso of=/dev/sdX bs=4M status=progress\n\n# Installer parameter recommendations:\n- Leverage isolated manual partition layouts to avoid wiping home mountpoints.`
    });
    arr.push({
      title: "03. Package Injection",
      desc: "Re-hydrate package records",
      code: `# Feed package selection mappings back into fresh target installation:\nsudo apt update && sudo apt upgrade -y\ncat ~/manually-installed.txt | xargs sudo apt install -y`
    });
  } else {
    if (script.includes("step01_find_source_packages")) {
      arr.push({
        title: "01. Downstream Audit",
        desc: "Trace custom system files",
        code: `step01_find_source_packages() {\n  echo "[01] Scanning for ${f.name} packages..."\n  sh ~/find_origin.sh | grep packages.\${f.id}.com > ~/\${f.id}-pkgs.txt\n}`
      });
      arr.push({
        title: "02. Purging Layers",
        desc: "Prune conflicts with meta elements",
        code: `step02_remove_source_packages() {\n  sudo apt-get install -y aptitude\n  sudo aptitude purge \$(cat ~/\${f.id}-remove.txt | awk '{print \$1}')\n}`
      });
      arr.push({
        title: "03. Disabling Repos",
        desc: "De-register upstream links",
        code: `step03_disable_source_repos() {\n  sudo sed -i 's/^deb http.../#&/g' /etc/apt/sources.list.d/*.list\n  sudo apt update\n}`
      });
    }
    arr.push({
      title: "04. Desktop Ingestion",
      desc: "Download workspace elements",
      code: `step_install_target() {\n  sudo apt update && sudo apt upgrade -y\n  sudo apt install -y ${t.meta} --no-install-recommends\n}`
    });
    arr.push({
      title: "05. Display Manager",
      desc: "Re-route system logon screen",
      code: `step_set_dm() {\n  sudo apt install -y ${t.dm}\n  sudo dpkg-reconfigure ${t.dm}\n}`
    });
    arr.push({
      title: "06. Align Identity",
      desc: "Re-anchor os-release targets",
      code: `step_fix_identity() {\n  sudo apt install --reinstall base-files -y\n  sudo apt autoremove -y && sudo reboot\n}`
    });
  }
  return arr;
}

function executeMockTerminal(sameBase, f, t) {
  const box = document.getElementById('term-body-logs');
  const btn = document.getElementById('term-start-btn');
  const bar = document.getElementById('term-progress');
  const fill = document.getElementById('term-progress-fill');
  const txt = document.getElementById('term-status-text');
  
  if(!box || !btn) return;
  
  btn.disabled = true;
  bar.style.display = 'block';
  fill.style.width = '0%';
  box.innerHTML = `<span class="terminal-prompt">penguin@distrohop:~$</span> <span class="terminal-input">./distrohop_migrate.sh</span><br>`;
  
  let steps = [];
  if (!sameBase) {
    steps = [
      { text: "⚡ Initializing Cross-Base Migration Script Simulator...", delay: 400, color: "#cbd5e1" },
      { text: "[WARNING] Inter-base morphs are unsafe. Re-routing to clean-install checklist framework.", delay: 500, color: "#f59e0b" },
      { text: "Executing Step 00: Backing up current user mountpoints...", delay: 400, color: "#38bdf8" },
      { text: ">> rsync -av --progress /home/user/ /media/backup/home/", delay: 200 },
      { text: "Indexing metadata frames... 14,250 configuration files archived.", delay: 500, color: "#10b981" },
      { text: "Exporting package inventory state list to ~/pkg-list-before.txt", delay: 300 },
      { text: "Executing Step 01: Audit application records and profile details...", delay: 400, color: "#38bdf8" },
      { text: "Archiving cryptography keys inside ~/.ssh and credentials safely... OK.", delay: 300 },
      { text: "Executing Step 02: Formatting Target Bootable Installation Medium...", delay: 500, color: "#38bdf8" },
      { text: `Mapping mirror imagery -> ${t.id}-desktop-release-amd64.iso`, delay: 200 },
      { text: ">> dd if=target.iso of=/dev/sdb bs=4M status=progress", delay: 100 },
      { text: "Writing pipeline sequence blocks: [||||||||||||||||||||||||||||||||] 100%", delay: 600, color: "#10b981" },
      { text: "----------------------------------------------------------------", delay: 200, color: "#334155" },
      { text: `[SUCCESS] Checklist suite simulated cleanly. Flash complete. Boot from device to finish installing ${t.name}!`, delay: 400, color: "#00ffcc" }
    ];
  } else {
    steps = [
      { text: "⚡ Launching In-Place Distro Morphing Execution Pipeline...", delay: 300, color: "#cbd5e1" },
      { text: `Current Environment Base: ${f.base.toUpperCase()} | Target Desktop Meta: ${t.meta}`, delay: 200 },
      { text: "Executing Step 00: Compiling backup archive arrays...", delay: 400, color: "#38bdf8" },
      { text: ">> rsync -av --progress /home/$USER/ /media/backup/home-snapshot/", delay: 200 },
      { text: "Sync verified. Safe mirror written to external storage targets.", delay: 400, color: "#10b981" },
      { text: "Executing Step 01: Auditing downstream configuration packages...", delay: 400, color: "#38bdf8" },
      { text: `Identifying distinct configuration elements linked to ${f.id} systems...`, delay: 400 },
      { text: `Isolating conflict lists. Export complete.`, delay: 200 },
      { text: "Executing Step 02: Purging divergent branding configurations...", delay: 500, color: "#38bdf8" },
      { text: `>> sudo aptitude purge individual target layers...`, delay: 200 },
      { text: `Dropped: ${f.meta || f.id + "-desktop-meta"} package lines.`, delay: 400, color: "#ef4444" },
      { text: "Executing Step 03: Swapping downstream package lists...", delay: 400, color: "#38bdf8" },
      { text: ">> sudo apt update", delay: 100 },
      { text: "Get:1 http://archive.ubuntu.com/ubuntu release InRelease [265 kB]", delay: 250 },
      { text: "Fetched metadata catalog charts successfully.", delay: 300, color: "#10b981" },
      { text: `Executing Step 04: Downloading target meta-layer packages: ${t.name}`, delay: 500, color: "#38bdf8" },
      { text: `>> sudo apt install -y ${t.meta}`, delay: 200 },
      { text: "Unpacking configuration maps: [||||||||||||||||||||..............] 55%", delay: 400 },
      { text: "Configuring environment dependencies: [||||||||||||||||||||||||||||] 100%", delay: 500, color: "#10b981" },
      { text: `Executing Step 05: Aligning display systems to logon node: ${t.dm}`, delay: 400, color: "#38bdf8" },
      { text: `>> sudo dpkg-reconfigure ${t.dm}`, delay: 200 },
      { text: "Executing Step 06: Aligning base tracking parameters...", delay: 400, color: "#38bdf8" },
      { text: "Rebuilding tracking structures inside /etc/os-release...", delay: 300 },
      { text: "----------------------------------------------------------------", delay: 150, color: "#334155" },
      { text: `[SUCCESS] Simulated migration pipeline completed! Your system is ready to hop into ${t.name}.`, delay: 400, color: "#00ffcc" }
    ];
  }
  
  let currentIdx = 0;
  function printLine() {
    if (currentIdx >= steps.length) {
      txt.textContent = "Finished";
      btn.disabled = false;
      btn.textContent = "RESET SIMULATION";
      box.innerHTML += `<br><span class="terminal-prompt">penguin@distrohop:~$</span> <span class="terminal-cursor"></span>`;
      return;
    }
    
    const s = steps[currentIdx];
    txt.textContent = `Processing lines (${currentIdx + 1}/${steps.length})...`;
    fill.style.width = `${((currentIdx + 1) / steps.length) * 100}%`;
    
    const lineObj = document.createElement('div');
    if (s.color) lineObj.style.color = s.color;
    lineObj.innerHTML = s.text;
    box.appendChild(lineObj);
    box.scrollTop = box.scrollHeight;
    
    currentIdx++;
    setTimeout(printLine, s.delay || 250);
  }
  
  printLine();
}

function genUbuntuToUbuntu(f,t){
  const hasSrc=f.cleanup!==null;
  return `#!/usr/bin/env bash
# ==============================================================
#  FROM: ${f.name}  →  TO: ${t.name}
#  Generated by Distrohop!
#  WARNING: Run each step manually — do NOT pipe this to bash!
#  Tested path: Ubuntu-family to Ubuntu-family in-place morph
# ==============================================================
set -e

# ── STEP 00 — BACKUP (ALWAYS DO THIS FIRST) ────────────────────
step00_backup() {
  echo "[00] Backing up home directory..."
  rsync -av --progress /home/$USER/ /media/backup/home-\$(date +%F)/
  dpkg --get-selections > ~/pkg-list-backup.txt
  apt-mark showmanual > ~/manually-installed.txt
  echo "[00] Done."
}

# ── STEP 01 — FIND ${f.name.toUpperCase()} PACKAGES ─────────────────────────${hasSrc?`
step01_find_source_packages() {
  echo "[01] Scanning for ${f.name} packages (takes a few minutes)..."
  cat > ~/find_origin.sh << 'EOF'
LC_ALL=C dpkg-query --showformat='\${Package}:\${Status}\\n' -W '*' | \\
fgrep ':install ok installed' | cut -d: -f1 | \\
(while read pkg; do inst_version=\$(apt-cache policy \$pkg \\
| fgrep Installed: | awk '{ print \$2 }'); \\
origin=\$(apt-cache policy "\$pkg" \\
| fgrep " *** \${inst_version}" -C1 \\
| tail -n 1 | cut -c12-); echo \$pkg \$origin; done)
EOF
  sh ~/find_origin.sh | grep packages.\${f.id=='mint'?'linuxmint':f.id}.com > ~/\${f.id}-pkgs.txt
  echo "[01] Found \$(wc -l < ~/\${f.id}-pkgs.txt) ${f.name} packages."
  cat ~/\${f.id}-pkgs.txt
}

# ── STEP 02 — REMOVE ${f.name.toUpperCase()} PACKAGES ──────────────────────
step02_remove_source_packages() {
  echo "[02] Filtering critical packages from removal..."
  grep -v "E:" ~/\${f.id}-pkgs.txt \\
    | grep -v ^bash | grep -v ^base-files | grep -v grub \\
    > ~/\${f.id}-remove.txt

  echo "[02] Packages to remove:"
  cat ~/\${f.id}-remove.txt
  read -p "Proceed? (y/N) " ok
  [[ "\$ok" =~ ^[Yy]$ ]] || { echo "Aborted."; return; }

  sudo apt-get install -y aptitude
  sudo aptitude purge \$(cat ~/\${f.id}-remove.txt | awk '{print \$1}')
  echo "[02] Done."
}

# ── STEP 03 — DISABLE ${f.name.toUpperCase()} REPOS ──────────────────────────
step03_disable_source_repos() {
  echo "[03] Commenting out ${f.name} repos..."
  sudo sed -i 's/^deb http:\\/\\/packages.\${f.id=='mint'?'linuxmint':f.id}.com/#&/g' \\
    /etc/apt/sources.list.d/*.list 2>/dev/null || true
  sudo rm -f /etc/apt/preferences.d/*\${f.id}* 2>/dev/null || true
  sudo apt update
  echo "[03] Done."
}

# ── STEP 04 — CLEAN UP ${f.name.toUpperCase()} LEFTOVERS ──────────────────────
step04_cleanup() {
  echo "[04] Removing remaining ${f.name} packages..."
  sudo aptitude  # Go to Obsolete section, mark for purge, press g
  sudo apt remove -y --purge "*\${f.id}*" || true
  sudo rm -rf /etc/linuxmint /usr/lib/linuxmint ~/.linuxmint/ || true
  echo "[04] Done."
}
`:'# (source distro has no proprietary packages to remove)\n'}
# ── STEP ${hasSrc?'05':'02'} — INSTALL ${t.name.toUpperCase()} DESKTOP ──────────────────────────
step_install_target() {
  echo "[--] Installing ${t.name} desktop environment..."
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y ${t.meta} --no-install-recommends
  echo "[--] Done."
}

# ── STEP ${hasSrc?'06':'03'} — SET DISPLAY MANAGER ─────────────────────────────────
step_set_dm() {
  echo "[--] Setting ${t.dm} as display manager..."
  sudo apt install -y ${t.dm}
  sudo dpkg-reconfigure ${t.dm}
  echo "[--] Done."
}

# ── STEP ${hasSrc?'07':'04'} — FIX OS IDENTITY ──────────────────────────────────────
step_fix_identity() {
  echo "[--] Reinstalling Ubuntu base identity..."
  sudo apt install --reinstall base-files -y
  sudo apt install -y ubuntu-minimal ubuntu-standard
  sudo apt update && sudo apt upgrade -y
  sudo apt autoremove -y && sudo apt autoclean
  echo "[--] Done! Reboot to apply changes."
  read -p "Reboot now? (y/N) " rb
  [[ "\$rb" =~ ^[Yy]$ ]] && sudo reboot || echo "Run: sudo reboot"
}

# ── USAGE ────────────────────────────────────────────────────────
echo "Run these functions in order:"
echo "  step00_backup"
${hasSrc?`echo "  step01_find_source_packages"
echo "  step02_remove_source_packages"
echo "  step03_disable_source_repos"
echo "  step04_cleanup"`:''}
echo "  step_install_target"
echo "  step_set_dm"
echo "  step_fix_identity"`;
}

function genDebianToDebian(f,t){
  return `#!/usr/bin/env bash
# ==============================================================
#  FROM: ${f.name}  →  TO: ${t.name}
#  Generated by Distrohop!
#  Both are Debian-based — desktop environment swap.
#  WARNING: Run steps individually, not as a script!
# ==============================================================
set -e

step00_backup() {
  echo "[00] Backing up home..."
  rsync -av --progress /home/\$USER/ /media/backup/home-\$(date +%F)/
  dpkg --get-selections > ~/pkg-list-backup.txt
  echo "[00] Done."
}

step01_install_target_de() {
  echo "[01] Installing ${t.name} desktop..."
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y ${t.meta}
  echo "[01] Done."
}

step02_remove_source_de() {
  echo "[02] Removing ${f.name} desktop components..."
  sudo apt remove -y --purge "${f.id}*" task-\${f.id=='debian'?'gnome':f.id}-desktop || true
  sudo apt autoremove -y
  echo "[02] Done."
}

step03_set_dm() {
  echo "[03] Configuring display manager (${t.dm})..."
  sudo apt install -y ${t.dm}
  sudo dpkg-reconfigure ${t.dm}
  echo "[03] Done."
}

step04_cleanup() {
  sudo apt autoremove -y
  sudo apt autoclean
  read -p "Reboot now? (y/N) " rb
  [[ "\$rb" =~ ^[Yy]$ ]] && sudo reboot
}

echo "Run: step00_backup → step01_install_target_de → step02_remove_source_de → step03_set_dm → step04_cleanup"`;
}

function genCrossBase(f,t){
  return `#!/usr/bin/env bash
# ==============================================================
#  FROM: ${f.name} (${f.base})  →  TO: ${t.name} (${t.base})
#  Generated by Distrohop!
#  Warning! CROSS-BASE MIGRATION: ${f.base.toUpperCase()} → ${t.base.toUpperCase()}
#  In-place migration between different Linux bases is EXTREMELY RISKY.
# ==============================================================

# ── STEP 1 — BACKUP EVERYTHING ──────────────────────────────────
echo "=== FULL BACKUP ==="
echo "rsync -av --progress /home/\$USER/ /media/backup/home-\$(date +%F)/"
echo "dpkg --get-selections > ~/pkg-list-before.txt"

# ── STEP 2 — NOTE KEY CONFIGS ──────────────────────────────────
echo "=== THINGS TO NOTE BEFORE REINSTALL ==="
echo "  - Browser profiles (~/.mozilla, ~/.config/google-chrome)"
echo "  - SSH keys (~/.ssh/)"

# ── STEP 3 — CLEAN INSTALL GUIDANCE ────────────────────────────
echo "=== CLEAN INSTALL ==="
echo "  1. Download ${t.name} ISO from the official site"
echo "  3. Create bootable USB: dd if=${t.id}.iso of=/dev/sdX bs=4M status=progress"
echo "  5. Keep your /home partition if it is on its own partition"
`;
}

function syntaxHighlight(script){
  return script
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(#.*$)/gm, '<span class="c-comment">$1</span>')
    .replace(/^(step\w+\(\)|main\(\)|run_step|main|echo|read|sudo|rsync|cat|grep|cp|gpg|dpkg|apt\b[\w-]*)/gm, '<span class="c-cmd">$1</span>')
    .replace(/(===.*===)/g, '<span class="c-head">$1</span>')
    .replace(/(Warning:.*)/g, '<span class="c-warn">$1</span>')
    .replace(/(\[[0-9-]+\]|Step \d+ —)/g, '<span class="c-step">$1</span>');
}

// Bind initialization handlers on window configuration completion
window.addEventListener('DOMContentLoaded', () => {
  initThree();
  renderGrids();
  
  const genBtn = document.getElementById('gen-btn');
  if (genBtn) genBtn.onclick = generate;
});