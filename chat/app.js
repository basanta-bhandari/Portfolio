import {identity,registration,validPeer,roomKeys,encryptMessage,decryptMessage,receipt,validReceipt,randomHex} from './crypto.js';
import {ID,TOKEN,RETENTION_MS,sameRegistration,signaturePayload} from './protocol.js';
const $=id=>document.getElementById(id),make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const storageKey='tether.browser.v1';
let saved={};try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'{}');}catch{}
const state={me:null,name:typeof saved.name==='string'?saved.name.slice(0,40):`Guest ${Math.floor(1000+Math.random()*9000)}`,useDirect:saved.useDirect!==false,rooms:[],current:null,direct:null,sending:false,reply:null,drafts:new Map()};
let pollTimer,toastTimer,listSignature,messageSignature;
const welcome=$('welcome');
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},4200);}
function save(){if(!state.me)return;try{sessionStorage.setItem(storageKey,JSON.stringify({name:state.name,useDirect:state.useDirect,identity:state.me.saved,rooms:state.rooms.map(r=>({id:r.id,name:r.name,secret:r.secret,session:r.session}))}));}catch{toast('This browser cannot save the session. Keep your invite link before reloading.');}}
function roomState(data){return {...data,messages:new Map(),peers:new Map(),connections:new Map(),receipts:new Map(),acknowledged:new Set(),ackPending:new Set(),retry:new Map(),after:0,joined:false,live:false,failures:0,polling:null};}
const ready=(async()=>{
  if(!crypto?.subtle)throw new Error('Use a current browser over HTTPS to start encrypted chat.');
  state.me=await identity(saved.identity);
  for(const r of Array.isArray(saved.rooms)?saved.rooms.slice(0,20):[]){if(ID.test(r.id)&&TOKEN.test(r.secret)&&TOKEN.test(r.session)&&typeof r.name==='string')state.rooms.push(roomState(r));}
  save();renderProfile();renderLists();
})();
ready.catch(error=>{$('welcome').querySelector('p').textContent=error.message;toast(error.message);});
async function request(body){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Chat is temporarily unavailable. Please try again.');return data;
  }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw new Error('Cannot reach chat right now. Check your connection and try again.');throw error;}
  finally{clearTimeout(timeout);}
}
function api(room,op,extra={}){return request({op,room:room.id,peer:state.me.peer,session:room.session,...extra});}
async function enroll(r,op){
  r.keys=await roomKeys(r.secret,r.id);r.registration=await registration(state.me,r.id,state.name,r.session,state.useDirect,r.keys.membership);
  const response=await request({op,...r.registration,session:r.session,access:r.keys.access,roomName:r.name});
  r.name=response.name;r.joined=true;r.peers.set(state.me.peer,{...r.registration,lastSeen:Date.now()});return r;
}
function openDialog(id){$(id).showModal();}
function closeDialog(id){$(id).close();}
function openCreate(){ $('createName').value=state.name;$('roomName').value='';$('createError').textContent='';openDialog('createDialog');$('roomName').focus(); }
function openJoin(link=''){ $('joinName').value=state.name;$('inviteInput').value=link;$('joinError').textContent='';openDialog('joinDialog');if(!link)$('inviteInput').focus(); }
for(const id of ['createSidebar','createWelcome'])$(id).onclick=openCreate;
for(const id of ['joinSidebar','joinWelcome'])$(id).onclick=()=>openJoin();
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>closeDialog(button.dataset.close);
function invite(r){return `${location.origin}/chat/#r=${r.id}&k=${r.secret}`;}
function parseInvite(raw){
  let url;try{url=new URL(raw.trim(),location.href);}catch{throw new Error('Paste the complete invite link.');}
  const own=new Set([location.origin,'https://basanta.cc','https://www.basanta.cc']);
  if(!own.has(url.origin)||!/^\/chat\/?$/.test(url.pathname))throw new Error('This invite belongs to another site. Open it at its original address.');
  const params=new URLSearchParams(url.hash.slice(1)),id=params.get('r'),secret=params.get('k');
  if(params.has('tether-token'))throw new Error('The launcher is no longer needed. Create a room here or join with a browser invite.');
  if(!ID.test(id||'')||!TOKEN.test(secret||''))throw new Error('The invite is incomplete. Copy the whole link, including the part after #.');
  return {id,secret};
}
$('createForm').onsubmit=async event=>{
  event.preventDefault();const button=$('createSubmit');button.disabled=true;button.textContent='Creating…';$('createError').textContent='';
  try{
    await ready;if(state.rooms.length>=20)throw new Error('Leave a room before creating another (20 per browser session).');
    state.name=$('createName').value.trim();if(!state.name)throw new Error('Enter your name.');
    const r=roomState({id:randomHex(),secret:randomHex(32),session:randomHex(32),name:$('roomName').value.trim()});
    await enroll(r,'create');state.rooms.unshift(r);save();renderProfile();closeDialog('createDialog');await enterRoom(r);showInvite();
  }catch(error){$('createError').textContent=error.message;}finally{button.disabled=false;button.textContent='Create room';}
};
$('joinForm').onsubmit=async event=>{
  event.preventDefault();const button=$('joinSubmit');button.disabled=true;button.textContent='Joining…';$('joinError').textContent='';
  try{
    await ready;const parsed=parseInvite($('inviteInput').value);state.name=$('joinName').value.trim();if(!state.name)throw new Error('Enter your name.');
    let r=state.rooms.find(x=>x.id===parsed.id);
    if(r&&r.secret!==parsed.secret)throw new Error('This invite does not match the saved room. Check the link with its sender.');
    if(!r){if(state.rooms.length>=20)throw new Error('Leave a room before joining another.');r=roomState({...parsed,session:randomHex(32),name:'Room'});await enroll(r,'join');state.rooms.unshift(r);}else await enroll(r,'join');
    save();renderProfile();closeDialog('joinDialog');await enterRoom(r);
  }catch(error){$('joinError').textContent=error.message;}finally{button.disabled=false;button.textContent='Join room';}
};
function draftKey(){return state.current?`${state.current.id}/${state.direct||'room'}`:'';}
function stashDraft(){if(state.current)state.drafts.set(draftKey(),$('messageInput').value);}
function restoreDraft(){ $('messageInput').value=state.drafts.get(draftKey())||'';state.reply=null;$('replyPreview').hidden=true;updateComposer(); }
function stopConnections(r){if(!r)return;for(const connection of r.connections.values())connection.pc.close();r.connections.clear();}
async function enterRoom(r){
  stashDraft();clearTimeout(pollTimer);if(state.current!==r)stopConnections(state.current);
  state.current=r;state.direct=null;$('sidebar').classList.remove('open');$('toggleSidebar').setAttribute('aria-expanded','false');restoreDraft();renderAll();
  try{if(!r.joined)await enroll(r,'join');await poll(r);}catch(error){showFailure(r,error);}
}
function selectPerson(peer){stashDraft();state.direct=peer;restoreDraft();renderAll();$('sidebar').classList.remove('open');$('toggleSidebar').setAttribute('aria-expanded','false');$('messageInput').focus();}
function avatar(name,own=false){const n=make('span',`avatar${own?' self':''}`,(name||'?').split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]||'').join('').toUpperCase());return n;}
function renderProfile(){ $('profileName').textContent=state.name;$('profileAvatar').textContent=state.name.slice(0,1).toUpperCase(); }
function renderLists(){
  const query=$('conversationSearch').value.trim().toLowerCase(),r=state.current;
  const peers=r?[...r.peers.values()].filter(p=>p.peer!==state.me?.peer):[];
  const signature=JSON.stringify([query,state.current?.id,state.direct,state.rooms.map(x=>[x.id,x.name]),peers.map(p=>[p.peer,p.name,Date.now()-p.lastSeen<45000])]);
  if(signature===listSignature)return;listSignature=signature;
  $('roomCount').textContent=state.rooms.length;$('peopleCount').textContent=peers.length;$('roomList').replaceChildren();$('peopleList').replaceChildren();
  for(const room of state.rooms.filter(x=>x.name.toLowerCase().includes(query))){
    const button=make('button',`conversation-item${r===room&&!state.direct?' selected':''}`);button.type='button';button.setAttribute('aria-current',r===room&&!state.direct?'page':'false');button.append(make('span','avatar room-avatar','#'),make('span','label',room.name));button.onclick=()=>enterRoom(room);$('roomList').append(button);
  }
  peers.sort((a,b)=>Number(Date.now()-b.lastSeen<45000)-Number(Date.now()-a.lastSeen<45000)||a.name.localeCompare(b.name));
  for(const p of peers.filter(x=>x.name.toLowerCase().includes(query))){
    const button=make('button',`conversation-item${state.direct===p.peer?' selected':''}`);button.type='button';button.append(avatar(p.name),make('span','label',p.name));const dot=make('span',`presence${Date.now()-p.lastSeen<45000?' online':''}`);dot.title=Date.now()-p.lastSeen<45000?'Online':'Offline';button.append(dot);button.onclick=()=>selectPerson(p.peer);$('peopleList').append(button);
  }
  if(!$('roomList').children.length)$('roomList').append(make('p','list-empty',query?'No matching rooms.':'Your rooms will appear here.'));
  if(!$('peopleList').children.length)$('peopleList').append(make('p','list-empty',query?'No matching people.':r?'Invite someone to join this room.':'Join a room to find people.'));
}
function directCount(r){return [...r.connections.values()].filter(x=>x.channel?.readyState==='open').length;}
function renderHeader(){
  const r=state.current,p=r?.peers.get(state.direct);
  $('conversationTitle').textContent=p?.name||r?.name||'Conversations';$('conversationSymbol').textContent=state.direct?'@':'#';
  $('conversationSubtitle').textContent=p?`Direct message · ${r.name}`:r?`${r.peers.size} ${r.peers.size===1?'person':'people'} · Room`:'Rooms and direct messages';
  $('inviteButton').hidden=!r;$('detailsButton').hidden=!r;$('composerArea').hidden=!r;
  $('connectionStatus').textContent=r?(r.live?'Live':directCount(r)?'Direct only':'Reconnecting…'):'';$('connectionStatus').classList.toggle('live',Boolean(r?.live));
  $('messageInput').placeholder=p?`Message ${p.name}…`:r?`Message ${r.name}…`:'Write a message…';
}
function updateComposer(){ $('sendButton').disabled=!state.current||!$('messageInput').value.trim()||state.sending;$('characterCount').textContent=$('messageInput').value.length>3500?`${$('messageInput').value.length}/4000`:'';$('composerHint').textContent=state.direct?'Only you and this person can decrypt DMs':'Encrypted for people with this room’s invite'; }
function visibleMessages(r){return [...r.messages.values()].filter(m=>(m.expiresAt||m.packet.createdAt+RETENTION_MS)>Date.now()&&(state.direct?m.packet.sender===state.direct&&m.packet.to===state.me.peer||m.packet.sender===state.me.peer&&m.packet.to===state.direct:!m.packet.to)).sort((a,b)=>a.packet.createdAt-b.packet.createdAt||a.packet.id.localeCompare(b.packet.id));}
function renderMessages(){
  const r=state.current;if(!r){$('timeline').replaceChildren(welcome);messageSignature=null;return;}
  const messages=visibleMessages(r),signature=JSON.stringify([r.id,state.direct,messages.map(m=>[m.packet.id,m.status,m.text,r.receipts.get(m.packet.id)?.size]),[...r.peers.values()].map(p=>[p.peer,p.name])]);
  if(signature===messageSignature)return;messageSignature=signature;
  const timeline=$('timeline'),bottom=timeline.scrollHeight-timeline.scrollTop-timeline.clientHeight<120;timeline.replaceChildren();
  if(!messages.length){const empty=make('div','empty-conversation');empty.append(make('strong','',state.direct?'A private conversation':'You’re the first message away'),make('p','',state.direct?'Only you and this person can read these messages.':r.peers.size<2?'Invite someone, or leave a message for when they arrive.':'Say hello to the room.'));if(!state.direct){const button=make('button','primary','Invite someone');button.onclick=showInvite;empty.append(button);}timeline.append(empty);return;}
  let day='';
  for(const m of messages){
    const p=m.packet,own=p.sender===state.me.peer,name=own?'You':r.peers.get(p.sender)?.name||'Participant',date=new Date(p.createdAt),dateLabel=date.toLocaleDateString(undefined,{month:'long',day:'numeric'});
    if(day!==dateLabel){day=dateLabel;timeline.append(make('div','day-divider',dateLabel));}
    const article=make('article',`message${own?' own':''}`),main=make('div','message-main'),head=make('div','message-head'),time=make('time','message-time',date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}));time.dateTime=date.toISOString();head.append(make('span','message-author',name),time);main.append(head,make('div','message-body',m.text));
    if(own){const count=r.receipts.get(p.id)?.size||0;const status=count?(p.to?'Delivered':`Delivered to ${count}`):m.status==='sending'?'Sending…':m.status==='failed'?'Not sent':m.status==='direct'?'Sent directly':'Sent';main.append(make('div',`delivery${m.status==='failed'?' failed':''}`,status));}
    const actions=make('div','message-actions'),copy=make('button','','Copy'),reply=make('button','','Reply');copy.type=reply.type='button';copy.onclick=()=>copyText(m.text).then(()=>toast('Message copied.')).catch(()=>toast('Select the message text to copy it.'));reply.onclick=()=>{state.reply=m;$('replyText').textContent=`Reply to ${name}: ${m.text.slice(0,100)}`;$('replyPreview').hidden=false;$('messageInput').focus();};actions.append(copy,reply);
    if(own&&m.status==='failed'){const retry=make('button','','Retry');retry.type='button';retry.onclick=()=>submitPacket(r,m);actions.append(retry);}main.append(actions);article.append(avatar(own?state.name:name,own),main);timeline.append(article);
  }
  if(bottom||messages.length<5)timeline.scrollTop=timeline.scrollHeight;
}
function renderAll(){renderLists();renderHeader();renderMessages();updateComposer();}
function showFailure(r,error){if(state.current!==r)return;r.live=false;renderHeader();$('connectionBanner').hidden=false;$('connectionBanner').textContent=error.message;}
async function acknowledge(r,p,channel){
  if(p.sender===state.me.peer)return;
  const ack=await receipt(state.me,r.id,p.id);
  if(channel?.readyState==='open'){try{channel.send(JSON.stringify({type:'receipt',receipt:ack}));}catch{}}
  if(r.acknowledged.has(p.id)||r.ackPending.has(p.id))return;r.ackPending.add(p.id);
  api(r,'ack',{receipt:ack}).then(result=>{if(result.ok)r.acknowledged.add(p.id);}).catch(()=>{}).finally(()=>r.ackPending.delete(p.id));
}
async function receiveReceipt(r,ack){
  const m=r.messages.get(ack.id);if(!m||ack.room!==r.id||m.packet.sender!==state.me.peer||ack.peer===state.me.peer||m.packet.to&&m.packet.to!==ack.peer||!await validReceipt(r.peers,ack))return;
  if(!r.receipts.has(ack.id))r.receipts.set(ack.id,new Set());r.receipts.get(ack.id).add(ack.peer);if(state.current===r)renderMessages();
}
async function receive(r,p,meta={},channel){
  if(p?.room!==r.id||!ID.test(p.id||'')||!Number.isSafeInteger(p.createdAt)||p.createdAt>Date.now()+300000||p.createdAt+RETENTION_MS<=Date.now())return;
  const old=r.messages.get(p.id);
  if(old){if(old.packet.sig!==p.sig||signaturePayload(old.packet)!==signaturePayload(p))return;if(meta.seq){old.status='sent';old.seq=meta.seq;old.expiresAt=Math.min(meta.expiresAt||Infinity,p.createdAt+RETENTION_MS);}await acknowledge(r,old.packet,channel);return;}
  const text=await decryptMessage(state.me,r.keys.key,r.peers,p);r.messages.set(p.id,{packet:p,text,status:'sent',seq:meta.seq,expiresAt:Math.min(meta.expiresAt||Infinity,p.createdAt+RETENTION_MS)});
  while(r.messages.size>1000)r.messages.delete(r.messages.keys().next().value);
  await acknowledge(r,p,channel);
}
function poll(r=state.current){if(!r)return Promise.resolve(false);if(r.polling)return r.polling;const pending=pollNow(r).finally(()=>{if(r.polling===pending)r.polling=null;});r.polling=pending;return pending;}
async function pollNow(r){
  clearTimeout(pollTimer);
  try{
    const data=await api(r,'poll',{after:r.after});if(state.current!==r)return false;
    for(const p of data.peers||[]){try{const old=r.peers.get(p.peer);if(sameRegistration(old,p)||await validPeer(p,r.keys.membership))r.peers.set(p.peer,p);}catch{}}
    r.peers.set(state.me.peer,{...r.registration,lastSeen:Date.now()});
    for(const row of data.messages||[]){try{await receive(r,row.packet,row);}catch{ /* Keep unverifiable messages out of the transcript. */ }r.after=Math.max(r.after,row.seq);}
    for(const ack of data.receipts||[])await receiveReceipt(r,ack);
    for(const signal of data.signals||[]){try{await receiveSignal(r,signal.sender,signal.data);}catch{}}
    r.live=true;r.failures=0;$('connectionBanner').hidden=true;renderAll();startConnections(r);return true;
  }catch(error){r.failures++;showFailure(r,error);return false;}
  finally{if(state.current===r)pollTimer=setTimeout(()=>poll(r),Math.min(15000,(document.hidden?8000:2200)*Math.max(1,r.failures)));}
}
function broadcast(r,p){if(state.current!==r)return 0;let count=0;for(const [id,c] of r.connections){if(p.to&&p.to!==id)continue;if(c.channel?.readyState==='open'){try{c.channel.send(JSON.stringify({type:'message',packet:p}));count++;}catch{}}}return count;}
async function submitPacket(r,m){
  m.status='sending';if(state.current===r)renderMessages();
  try{const result=await api(r,'message',{packet:m.packet});m.seq=result.seq;m.expiresAt=result.expiresAt;m.status='sent';broadcast(r,m.packet);}
  catch(error){if(broadcast(r,m.packet)){m.status='direct';toast('Sent directly. The site could not save its encrypted history.');}else{m.status='failed';toast(error.message);}}
  if(state.current===r){renderMessages();$('timeline').scrollTop=$('timeline').scrollHeight;}
}
$('messageForm').onsubmit=async event=>{
  event.preventDefault();if(state.sending||!state.current||!$('messageInput').value.trim())return;
  const r=state.current,direct=state.direct,draft=$('messageInput').value,reply=state.reply;state.sending=true;updateComposer();
  try{
    const text=reply?`> ${r.peers.get(reply.packet.sender)?.name||'Participant'}: ${reply.text.slice(0,250)}\n\n${draft.trim()}`:draft.trim();
    const other=direct?r.peers.get(direct):null;if(direct&&!other)throw new Error('That person is no longer available.');
    const p=await encryptMessage(state.me,r.id,r.keys.key,other,text);const m={packet:p,text,status:'sending'};r.messages.set(p.id,m);renderMessages();
    if(state.current===r&&state.direct===direct&&$('messageInput').value===draft){$('messageInput').value='';state.drafts.delete(draftKey());state.reply=null;$('replyPreview').hidden=true;}
    await submitPacket(r,m);
  }catch(error){toast(error.message);}finally{state.sending=false;updateComposer();if(state.current===r&&state.direct===direct)$('messageInput').focus();}
};
$('messageInput').oninput=updateComposer;$('messageInput').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('messageForm').requestSubmit();}};
$('cancelReply').onclick=()=>{state.reply=null;$('replyPreview').hidden=true;};$('conversationSearch').oninput=renderLists;
function showInvite(){if(!state.current)return;$('shareLink').value=invite(state.current);$('copyInvite').textContent='Copy invite';openDialog('inviteDialog');}
$('inviteButton').onclick=showInvite;
async function copyText(text){
  const field=make('textarea','sr-only');field.value=text;field.setAttribute('readonly','');(document.querySelector('dialog[open]')||document.body).append(field);field.select();let copied=false;try{copied=document.execCommand('copy');}catch{}finally{field.remove();}
  if(copied)return;if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
  await Promise.race([navigator.clipboard.writeText(text),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Clipboard unavailable')),1500))]);
}
$('copyInvite').onclick=async()=>{try{await copyText($('shareLink').value);$('copyInvite').textContent='Copied';toast('Invite copied.');}catch{$('shareLink').select();toast('Invite selected. Press Ctrl+C or ⌘C to copy.');}};
$('refreshButton').onclick=async()=>{const button=$('refreshButton');button.disabled=true;button.textContent='Refreshing…';try{if(state.current)toast(await poll()?'Conversations refreshed.':'Still reconnecting. Please try again shortly.');else toast('You’re ready. Create a room or join with an invite.');}finally{button.disabled=false;button.textContent='Refresh';}};
$('profileButton').onclick=()=>{$('nameInput').value=state.name;$('directConnections').checked=state.useDirect;$('profileError').textContent='';openDialog('profileDialog');};
$('profileForm').onsubmit=async event=>{event.preventDefault();$('saveProfile').disabled=true;try{await ready;state.name=$('nameInput').value.trim();if(!state.name)throw new Error('Enter your name.');state.useDirect=$('directConnections').checked;if(!state.useDirect)stopConnections(state.current);if(state.current)await enroll(state.current,'join');for(const r of state.rooms)if(r!==state.current)r.joined=false;save();renderProfile();closeDialog('profileDialog');if(state.current)await poll();}catch(error){$('profileError').textContent=error.message;}finally{$('saveProfile').disabled=false;}};
$('detailsButton').onclick=()=>{
  const r=state.current;if(!r)return;$('roomDetailsTitle').textContent=r.name;$('roomDetailsConnection').textContent=`${directCount(r)} direct peer connections. Encrypted delivery through this site is available for everyone else.`;$('memberList').replaceChildren();
  for(const p of r.peers.values()){const row=make('div','member');row.append(avatar(p.name,p.peer===state.me.peer),make('span','',p.peer===state.me.peer?`${p.name} (you)`:p.name),make('small','',Date.now()-p.lastSeen<45000?'Online':'Offline'));$('memberList').append(row);}openDialog('detailsDialog');
};
$('leaveRoom').onclick=async()=>{const r=state.current;if(!r)return;api(r,'leave').catch(()=>{});clearTimeout(pollTimer);stopConnections(r);state.rooms=state.rooms.filter(x=>x!==r);state.current=null;state.direct=null;save();closeDialog('detailsDialog');renderAll();if(state.rooms[0])await enterRoom(state.rooms[0]);};
function sidebar(open){$('sidebar').classList.toggle('open',open);$('toggleSidebar').setAttribute('aria-expanded',String(open));}
$('toggleSidebar').onclick=()=>sidebar(!$('sidebar').classList.contains('open'));$('closeSidebar').onclick=()=>sidebar(false);
function connectPeer(r,p,offer=false){
  if(r.connections.has(p.peer))return r.connections.get(p.peer);
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]}),connection={pc,channel:null,ice:[]};r.connections.set(p.peer,connection);
  const send=data=>api(r,'signal',{to:p.peer,data}).catch(()=>{});
  pc.onicecandidate=event=>{if(event.candidate&&state.current===r)send({candidate:event.candidate.toJSON()});};
  pc.onconnectionstatechange=()=>{if(state.current!==r)return;renderHeader();if(pc.connectionState==='failed'||pc.connectionState==='closed'){pc.close();if(r.connections.get(p.peer)===connection)r.connections.delete(p.peer);r.retry.set(p.peer,Date.now()+30000);}};
  const attach=channel=>{connection.channel=channel;channel.onopen=()=>{if(state.current===r)renderHeader();};channel.onclose=()=>{if(state.current===r)renderHeader();};channel.onmessage=async event=>{if(state.current!==r||typeof event.data!=='string'||event.data.length>40000)return;try{const value=JSON.parse(event.data);if(value.type==='message'&&value.packet?.sender===p.peer){await receive(r,value.packet,{},channel);renderMessages();}else if(value.type==='receipt'&&value.receipt?.peer===p.peer)await receiveReceipt(r,value.receipt);}catch{}};};
  pc.ondatachannel=event=>attach(event.channel);
  if(offer){attach(pc.createDataChannel('tether-chat-v1'));(async()=>{await pc.setLocalDescription(await pc.createOffer());if(state.current===r)await send({description:pc.localDescription.toJSON()});})().catch(()=>{pc.close();r.connections.delete(p.peer);});}
  return connection;
}
function startConnections(r){if(!state.useDirect||typeof RTCPeerConnection==='undefined')return;for(const p of r.peers.values()){if(p.direct===false||p.peer===state.me.peer||Date.now()-p.lastSeen>=45000||state.me.peer>p.peer||r.connections.has(p.peer)||(r.retry.get(p.peer)||0)>Date.now())continue;connectPeer(r,p,true);}}
async function receiveSignal(r,from,data){
  if(!state.useDirect||state.current!==r||typeof RTCPeerConnection==='undefined'||!r.peers.has(from)||from===state.me.peer)return;
  const c=connectPeer(r,r.peers.get(from));
  if(data.description){if(!['offer','answer'].includes(data.description.type))return;await c.pc.setRemoteDescription(data.description);for(const candidate of c.ice.splice(0))await c.pc.addIceCandidate(candidate);if(data.description.type==='offer'){await c.pc.setLocalDescription(await c.pc.createAnswer());await api(r,'signal',{to:from,data:{description:c.pc.localDescription.toJSON()}});}}
  else if(data.candidate){if(c.pc.remoteDescription)await c.pc.addIceCandidate(data.candidate);else if(c.ice.length<30)c.ice.push(data.candidate);}
}
window.addEventListener('online',()=>poll());document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
window.addEventListener('pagehide',()=>{stashDraft();save();stopConnections(state.current);});
setInterval(()=>{for(const r of state.rooms)for(const [id,m] of r.messages)if((m.expiresAt||m.packet.createdAt+RETENTION_MS)<=Date.now())r.messages.delete(id);if(state.current)renderMessages();},60000);
function acceptHash(){if(!location.hash)return;const value=location.href;history.replaceState(null,'',location.pathname+location.search);try{parseInvite(value);ready.then(()=>openJoin(value));}catch(error){toast(error.message);}}
window.addEventListener('hashchange',acceptHash);acceptHash();
ready.then(()=>{if(!document.querySelector('dialog[open]')&&state.rooms[0])enterRoom(state.rooms[0]);renderProfile();renderAll();}).catch(()=>{});
renderProfile();renderHeader();
