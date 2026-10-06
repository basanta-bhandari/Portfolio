/* Browser-only connection graph. It displays the same candidates as the list. */
let graphView='list',graphNodes=[],graphEdges=[],graphKey='',graphSelected=null;
let graphTransform={x:0,y:0,k:1},graphDrag=null;
function graphData(){
  const tracks=ranked().slice(0,32),nodes=[],edges=[],tagCounts=new Map();
  for(const seed of state.seeds.slice(0,8))nodes.push({id:`a:${seed.id}`,type:'seed',label:seed.name,ref:seed});
  for(const track of tracks){
    nodes.push({id:`r:${track.id}`,type:'track',label:track.title,ref:track});
    for(const seedId of track.seedIds)if(state.seeds.some(s=>s.id===seedId))edges.push({a:`a:${seedId}`,b:`r:${track.id}`});
    for(const tag of track.tags.slice(0,3))tagCounts.set(tag,(tagCounts.get(tag)||0)+1);
  }
  const tags=[...tagCounts].sort((a,b)=>b[1]-a[1]).slice(0,12),allowed=new Set(tags.map(([tag])=>tag));
  for(const [tag,count] of tags)nodes.push({id:`t:${tag}`,type:'tag',label:tag,count});
  for(const track of tracks)for(const tag of track.tags.slice(0,3))if(allowed.has(tag))edges.push({a:`r:${track.id}`,b:`t:${tag}`});
  return {nodes,edges};
}
function layoutGraph(){
  const {nodes,edges}=graphData();graphNodes=nodes;graphEdges=edges;
  const seeds=nodes.filter(n=>n.type==='seed');
  seeds.forEach((node,i)=>{const a=i/seeds.length*Math.PI*2-Math.PI/2;node.x=450+Math.cos(a)*170;node.y=280+Math.sin(a)*150});
  for(const node of nodes.filter(n=>n.type==='track')){
    const linked=edges.filter(e=>e.b===node.id).map(e=>seeds.find(s=>s.id===e.a)).filter(Boolean);
    const base=linked.length?linked.reduce((o,s)=>({x:o.x+s.x/linked.length,y:o.y+s.y/linked.length}),{x:0,y:0}):{x:450,y:280};
    node.x=base.x+hash(node.id)%130-65;node.y=base.y+hash(node.id+'y')%130-65;
  }
  const tags=nodes.filter(n=>n.type==='tag');
  tags.forEach((node,i)=>{const a=i/tags.length*Math.PI*2;node.x=450+Math.cos(a)*260;node.y=280+Math.sin(a)*220});
  const byId=new Map(nodes.map(n=>[n.id,n]));
  for(let step=0;step<80;step++){
    const force=new Map(nodes.map(n=>[n.id,{x:0,y:0}]));
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,dist2=Math.max(100,dx*dx+dy*dy),mag=800/dist2;
      force.get(a.id).x+=dx*mag;force.get(a.id).y+=dy*mag;force.get(b.id).x-=dx*mag;force.get(b.id).y-=dy*mag;
    }
    for(const edge of edges){const a=byId.get(edge.a),b=byId.get(edge.b);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,dist=Math.max(1,Math.hypot(dx,dy)),target=a.type==='seed'?90:70,mag=(dist-target)*.01;force.get(a.id).x+=dx/dist*mag;force.get(a.id).y+=dy/dist*mag;force.get(b.id).x-=dx/dist*mag;force.get(b.id).y-=dy/dist*mag}
    for(const node of nodes){if(node.type==='seed')continue;const f=force.get(node.id);node.x=Math.max(22,Math.min(870,node.x+f.x*.43+(450-node.x)*.002));node.y=Math.max(22,Math.min(530,node.y+f.y*.43+(280-node.y)*.002))}
  }
}
function graphInfo(){
  const node=graphNodes.find(n=>n.id===graphSelected);
  if(!node){$('graphInfo').textContent=graphNodes.length?'Select a node to see its connections.':'Add an artist to create your graph.';return}
  if(node.type==='seed'){$('graphInfo').innerHTML=`<span class="type">Artist you added</span><strong>${esc(node.label)}</strong><span>${graphEdges.filter(e=>e.a===node.id).length} listening paths in this view.</span>`;return}
  if(node.type==='tag'){$('graphInfo').innerHTML=`<span class="type">Community tag</span><strong>${esc(node.label)}</strong><span>${node.count} tracks carry this tag in the current graph.</span>`;return}
  const track=node.ref;
  $('graphInfo').innerHTML=`<span class="type">Recommended track</span><strong>${esc(track.title)} — ${esc(track.artist)}</strong><span>${esc(reason(track))}</span><div class="graph-tags">${track.tags.slice(0,4).map(esc).join(' · ')}</div><div><a href="${providerLink('spotify',track)}" target="_blank" rel="noopener noreferrer">Spotify ↗</a><a href="${providerLink('apple',track)}" target="_blank" rel="noopener noreferrer">Apple Music ↗</a></div>`;
}
function paintGraph(){
  const svg=$('graphSvg');
  if(!graphNodes.length){svg.innerHTML='<text x="450" y="280" text-anchor="middle" fill="#adc5ae" font-size="17">Add an artist to make your graph</text>';graphInfo();return}
  const byId=new Map(graphNodes.map(n=>[n.id,n])),adjacent=new Set(graphSelected?[graphSelected]:[]);
  if(graphSelected)for(const e of graphEdges){if(e.a===graphSelected)adjacent.add(e.b);if(e.b===graphSelected)adjacent.add(e.a)}
  const lines=graphEdges.map(e=>{const a=byId.get(e.a),b=byId.get(e.b);if(!a||!b)return '';return `<line class="graph-edge ${graphSelected&&(e.a===graphSelected||e.b===graphSelected)?'focused':''}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`}).join('');
  const dots=graphNodes.map(n=>{const size=n.type==='seed'?12:n.type==='tag'?5:6;const label=n.type==='seed'||n.id===graphSelected;return `<g class="graph-node ${n.type} ${graphSelected&&!adjacent.has(n.id)?'dim':''} ${n.id===graphSelected?'focused':''}" data-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.type)}: ${esc(n.label)}"><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${size}"/><title>${esc(n.label)}</title>${label?`<text x="${(n.x+size+5).toFixed(1)}" y="${(n.y+3).toFixed(1)}">${esc(n.label.slice(0,28))}</text>`:''}</g>`}).join('');
  svg.innerHTML=`<g transform="translate(${graphTransform.x.toFixed(1)} ${graphTransform.y.toFixed(1)}) scale(${graphTransform.k.toFixed(3)})">${lines}${dots}</g>`;graphInfo();
}
function renderGraph(){
  if(graphView!=='graph')return;
  $('moreButton').hidden=true;
  const key=state.seeds.map(s=>s.id).join(',')+'|'+candidates.map(t=>t.id).join(',');
  if(key!==graphKey){graphKey=key;graphSelected=null;layoutGraph();graphTransform={x:0,y:0,k:1}}
  paintGraph();
}
function setView(view){
  graphView=view;const graph=view==='graph';
  $('recommendations').hidden=graph;$('graphPanel').hidden=!graph;
  $('listViewButton').classList.toggle('active',!graph);$('graphViewButton').classList.toggle('active',graph);
  $('listViewButton').setAttribute('aria-pressed',String(!graph));$('graphViewButton').setAttribute('aria-pressed',String(graph));
  $('moreButton').hidden=graph||state.visible>=Math.min(candidates.length,18);
  if(graph)renderGraph();
}
function graphPoint(event){const box=$('graphSvg').getBoundingClientRect();return {x:(event.clientX-box.left)*900/box.width,y:(event.clientY-box.top)*560/box.height}}
function wireGraph(){
  const svg=$('graphSvg');
  $('listViewButton').addEventListener('click',()=>setView('list'));
  $('graphViewButton').addEventListener('click',()=>setView('graph'));
  $('graphReset').addEventListener('click',()=>{graphTransform={x:0,y:0,k:1};graphSelected=null;paintGraph()});
  svg.addEventListener('pointerdown',event=>{const node=event.target.closest?.('[data-node]');graphDrag={kind:node?'node':'pan',id:node?.dataset.node||null,point:graphPoint(event),moved:false};svg.setPointerCapture(event.pointerId)});
  svg.addEventListener('pointermove',event=>{if(!graphDrag)return;const next=graphPoint(event),dx=next.x-graphDrag.point.x,dy=next.y-graphDrag.point.y;if(Math.abs(dx)+Math.abs(dy)>1)graphDrag.moved=true;if(graphDrag.kind==='pan'){graphTransform.x+=dx;graphTransform.y+=dy}else{const node=graphNodes.find(n=>n.id===graphDrag.id);if(node){node.x=Math.max(15,Math.min(885,node.x+dx/graphTransform.k));node.y=Math.max(15,Math.min(545,node.y+dy/graphTransform.k))}}graphDrag.point=next;paintGraph()});
  svg.addEventListener('pointerup',()=>{if(graphDrag?.kind==='node'&&!graphDrag.moved){graphSelected=graphDrag.id;paintGraph()}graphDrag=null});
  svg.addEventListener('pointercancel',()=>{graphDrag=null});
  svg.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.dataset.node){event.preventDefault();graphSelected=event.target.dataset.node;paintGraph()}});
  svg.addEventListener('wheel',event=>{event.preventDefault();const point=graphPoint(event),old=graphTransform.k,next=Math.max(.45,Math.min(3.5,old*(event.deltaY<0?1.12:.89)));graphTransform.x=point.x-(point.x-graphTransform.x)*next/old;graphTransform.y=point.y-(point.y-graphTransform.y)*next/old;graphTransform.k=next;paintGraph()},{passive:false});
}
