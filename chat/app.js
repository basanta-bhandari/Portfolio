(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {token:'', port:0, status:null, connected:false, epoch:0, selected:'', messages:[], unread:new Map(), known:new Set(), sending:false, polling:false, reply:null, nonce:null};
  const storageKey='tetherPublicChatConnection';
  const welcome=$('welcome');
  let toastTimer, pollTimer, listSignature, messageSignature;
  const validPort=p=>Number.isInteger(p)&&p>=1024&&p<=65535;
  const initial = new URLSearchParams(location.hash.slice(1));
  const token=initial.get('tether-token')||initial.get('token');
  const port=Number(initial.get('tether-port')||initial.get('port'));
  if(token && /^[a-f0-9]{64}$/i.test(token) && validPort(port)) {
    state.token=token;state.port=port;
    remember(token,port);
  } else {
    try {const saved=JSON.parse(sessionStorage.getItem(storageKey));if(saved&&/^[a-f0-9]{64}$/i.test(saved.token)&&validPort(saved.port)){state.token=saved.token;state.port=saved.port;}} catch {}
  }
  if(location.hash) history.replaceState(null,'',location.pathname+location.search);
  function remember(token,port){try{sessionStorage.setItem(storageKey,JSON.stringify({token,port}));}catch{}}
  function replaceConnection(token,port){
    state.epoch++; state.token=token; state.port=port; state.status=null;
    state.selected=''; state.messages=[]; state.unread.clear(); state.known.clear();
    state.reply=null;state.nonce=null;state.polling=false;
    $('messageInput').value='';$('replyPreview').hidden=true;
    clearTimeout(pollTimer); remember(token,port);updateConnection(false);renderLists();renderHeader();renderMessages();refresh();
  }
  window.addEventListener('hashchange',()=>{
    const params=new URLSearchParams(location.hash.slice(1));
    const token=params.get('tether-token');const port=Number(params.get('tether-port'));
    if(/^[a-f0-9]{64}$/i.test(token||'')&&validPort(port))replaceConnection(token,port);
    if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  });
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},5000);}
  async function api(path,options={}) {
    if(!state.token||!state.port) throw new Error('Start the backend using Connection settings.');
    const epoch=state.epoch; const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(`http://127.0.0.1:${state.port}${path}`,{cache:'no-store',signal:controller.signal,targetAddressSpace:'loopback',...options,headers:{'X-Tether-Bridge-Token':state.token,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
      const data=await response.json().catch(()=>({}));
      if(epoch!==state.epoch)throw new Error('Tether connection changed.');
      if(!response.ok){const error=new Error(data.error||`Tether returned ${response.status}.`);error.status=response.status;throw error;}
      return data;
    } catch(error){if(error.name==='AbortError') throw new Error('Tether did not answer. Check the terminal and allow local-network access in your browser.');throw error;}
    finally{clearTimeout(timer);}
  }
  function avatar(name,own=false){const el=document.createElement('span');el.className='avatar'+(own?' self':'');el.textContent=(name||'T').trim().split(/\s+/).slice(0,2).map(s=>Array.from(s)[0]||'').join('').toUpperCase();return el;}
  function peer(id){return state.status?.devices?.find(d=>d.fingerprint===id||d.id===id);}
  function conversation(){if(state.selected.startsWith('room:'))return state.status?.rooms?.find(r=>`room:${r.id}`===state.selected);return peer(state.selected.slice(3));}
  function nameFor(id){if(id===state.status?.identity?.fingerprint)return state.status.identity.label||'You';return peer(id)?.alias||`Device ${id.slice(0,8)}`;}
  function buttonRow(id,name,isRoom,online){const el=document.createElement('button');el.className='conversation-item'+(state.selected===id?' selected':'');el.type='button';el.setAttribute('aria-current',state.selected===id?'page':'false');const icon=avatar(name);if(isRoom){icon.className+=' room-avatar';icon.textContent='#';}el.append(icon);if(online){const dot=document.createElement('span');dot.className='online-dot';dot.title='Connected to your node';el.append(dot);}const label=document.createElement('span');label.className='label';label.textContent=name;el.append(label);const unread=state.unread.get(id)||0;if(unread){const badge=document.createElement('span');badge.className='badge';badge.textContent=unread>99?'99+':String(unread);el.append(badge);}el.addEventListener('click',()=>select(id));return el;}
  function renderLists(){
    const signature=JSON.stringify([state.selected,state.status?.devices,state.status?.rooms,$('conversationSearch').value,[...state.unread]]);
    if(signature===listSignature)return;listSignature=signature;const query=$('conversationSearch').value.toLowerCase();const direct=$('directList');const rooms=$('roomList');direct.replaceChildren();rooms.replaceChildren();const devices=(state.status?.devices||[]).filter(d=>d.fingerprint!==state.status?.identity?.fingerprint&&d.trusted!==false);$('deviceCount').textContent=devices.length;
    devices.filter(d=>d.alias.toLowerCase().includes(query)).forEach(d=>direct.append(buttonRow(`dm:${d.fingerprint}`,d.alias,false,d.online)));
    (state.status?.rooms||[]).filter(r=>r.name.toLowerCase().includes(query)).forEach(r=>rooms.append(buttonRow(`room:${r.id}`,r.name,true,false)));
    if(!direct.children.length){const p=document.createElement('p');p.className='list-empty';p.textContent=query?'No matching devices.':'Trusted devices appear after connecting Tether.';direct.append(p);}
    if(!rooms.children.length){const p=document.createElement('p');p.className='list-empty';p.textContent=query?'No matching rooms.':'Create a room to bring people together.';rooms.append(p);}
  }
  function updateConnection(connected){state.connected=connected;welcome.querySelector('#connectWelcomeLabel').textContent=connected?'Show conversations':'Get started';welcome.querySelector('#welcomeHeading').textContent=connected?'Choose a conversation':'Connect to chat';welcome.querySelector('#welcomeDescription').textContent=connected?'Select a person or room from the sidebar.':'Start Tether on this device to load your conversations.';$('connectionDot').classList.toggle('connected',connected);$('connectionDot').setAttribute('aria-label',connected?'Connected':'Disconnected');$('bridgeStatus').textContent=connected?(state.status?.history?.unlocked?'Local Tether connected':'History locked in Tether'):'Local node disconnected';$('newRoomButton').disabled=!connected||!state.status?.history?.unlocked;$('myName').textContent=connected?(state.status.identity?.label||'This device'):'Your identity';$('myAccount').textContent=connected?('Connected'):'Connect your local node';$('myAvatar').textContent=connected?(state.status.identity?.label||'T').slice(0,1).toUpperCase():'T';$('connectSidebar').textContent=connected?'Connection settings':'Connect';$('disconnectButton').hidden=!state.token;$('connectionInfo').hidden=!connected;if(connected)$('connectionInfo').textContent=`Connected locally as ${state.status.identity?.label||'Tether'}. Account: ${state.status.identity?.accountId||'device identity'}`;updateComposer();}
  function updateComposer(){document.querySelector('.composer-wrap').hidden=!state.selected;const ready=Boolean(state.connected&&state.status&&state.selected&&state.status.history?.unlocked&&!state.sending);$('messageInput').disabled=!ready;$('sendButton').disabled=!ready||!$('messageInput').value.trim();$('composerHint').textContent=state.status?state.status.history?.unlocked?'Private on your Tether network':'Unlock history in the Tether app.':'Connect your Tether node to begin.';$('messageCount').textContent=$('messageInput').value.length>3500?`${$('messageInput').value.length}/4000`:'';}
  function renderHeader(){const current=conversation();$('conversationTitle').textContent=current?.name||current?.alias||'Conversations';const isRoom=state.selected.startsWith('room:');$('channelSymbol').textContent=isRoom?'#':'@';$('conversationSubtitle').textContent=current?(isRoom?`${current.members?.length||0} trusted participants · Live room`:`${current.online?'Connected':'Offline · delivery will retry'} · Direct message`):'Select a person or room.';$('detailsButton').disabled=!current;$('detailsButton').hidden=!current;$('searchMessagesButton').disabled=!current;$('searchMessagesButton').hidden=!current;if(!current){$('detailsPanel').hidden=true;$('messageSearchRow').hidden=true;}$('messageInput').placeholder=current?`Message ${current.name||current.alias}…`:'Choose a conversation to begin…';renderDetails();}
  function renderDetails(){const current=conversation();$('detailsTitle').textContent=current?.name||current?.alias||'';$('detailsMembers').replaceChildren();const members=state.selected.startsWith('room:')?(current?.members||[]):[state.status?.identity?.fingerprint,state.selected.slice(3)].filter(Boolean);for(const id of members){const row=document.createElement('div');row.className='detail-member';row.append(avatar(nameFor(id)));const label=document.createElement('span');label.textContent=nameFor(id);row.append(label);$('detailsMembers').append(row);}}
  function select(id){state.selected=id;state.unread.delete(id);state.messages=[];state.reply=null;$('replyPreview').hidden=true;$('sidebar').classList.remove('open');$('toggleNav').setAttribute('aria-expanded','false');renderLists();renderHeader();renderMessages();updateComposer();loadMessages().catch(error=>toast(error.message));}
  function renderMessages(){
    const signature=JSON.stringify([state.selected,state.messages,$('messageSearch')?.value,Math.floor(Date.now()/60000)]);
    if(signature===messageSignature)return;messageSignature=signature;const list=$('timeline');if(!state.selected){list.replaceChildren(welcome);return;}const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<100;const query=$('messageSearch').value.trim().toLowerCase();const now=Date.now();const messages=state.messages.filter(m=>m.expiresAt*1000>now&&(!query||m.text.toLowerCase().includes(query)));list.replaceChildren();let day='';for(const message of messages){const date=new Date(message.createdAt*1000);const nextDay=date.toLocaleDateString(undefined,{month:'long',day:'numeric'});if(nextDay!==day){day=nextDay;const divider=document.createElement('div');divider.className='day-divider';const label=document.createElement('span');label.textContent=day;divider.append(label);list.append(divider);}const item=document.createElement('article');item.className='message'+(message.outgoing?' own':'');item.dataset.id=message.id;item.append(avatar(nameFor(message.sender),message.outgoing));const main=document.createElement('div');main.className='message-main';const header=document.createElement('div');header.className='message-head';const author=document.createElement('span');author.className='message-author';author.textContent=message.outgoing?'You':nameFor(message.sender);const time=document.createElement('time');time.className='message-time';time.dateTime=date.toISOString();time.textContent=date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});const expires=document.createElement('span');expires.className='message-expiry';const hours=Math.max(0,Math.ceil((message.expiresAt*1000-now)/3600000));expires.textContent=`leaves in ${hours}h`;header.append(author,time,expires);const body=document.createElement('div');body.className='message-body';body.textContent=message.text;main.append(header,body);if(message.outgoing){const delivery=document.createElement('div');delivery.className='delivery';delivery.textContent=message.delivery==='delivered'?'Delivered to device':message.delivery==='partial'?'Partly delivered · retrying':'Queued on your node';main.append(delivery);}const actions=document.createElement('div');actions.className='message-actions';const copy=document.createElement('button');copy.title='Copy message';copy.setAttribute('aria-label','Copy message');copy.textContent='⧉';copy.onclick=()=>copyText(message.text).then(()=>toast('Copied.')).catch(()=>toast('Select the message text to copy it.'));const reply=document.createElement('button');reply.title='Reply';reply.setAttribute('aria-label','Reply to message');reply.textContent='↩';reply.onclick=()=>{state.reply=message;$('replyText').textContent=`Replying to ${nameFor(message.sender)}: ${message.text}`;$('replyPreview').hidden=false;$('messageInput').focus();};actions.append(copy,reply);item.append(main,actions);list.append(item);}if(!messages.length){const empty=document.createElement('div');empty.className='empty-conversation';const title=document.createElement('strong');title.textContent=query?'No matches':'No messages yet';const note=document.createElement('p');note.textContent=query?'Try another word or clear the search.':'Write a message below.';empty.append(title,note);list.append(empty);}if(nearBottom||messages.length<5)list.scrollTop=list.scrollHeight;}
  async function loadMessages(){if(!state.selected)return;const selected=state.selected;const data=await api(`/v1/messages?conversation=${encodeURIComponent(selected)}`);if(state.selected!==selected)return;for(const message of data.messages||[])state.known.add(message.id);state.messages=data.messages||[];renderMessages();}
  async function refresh(){
    if(state.polling)return;
    state.polling=true;const epoch=state.epoch;
    try{
      const before=state.status;const next=await api('/v1/status');
      if(epoch!==state.epoch)return;
      if(!next.history||!next.identity?.accountId)throw new Error('This launcher is outdated. Start Tether with the download command in Connection settings.');
      state.status=next;
      for(const entry of next.recent||[]){
        if(!state.known.has(entry.id)){
          state.known.add(entry.id);
          if(before&&entry.conversation!==state.selected&&entry.sender!==next.identity?.fingerprint)
            state.unread.set(entry.conversation,(state.unread.get(entry.conversation)||0)+1);
        }
      }
      while(state.known.size>4096)state.known.delete(state.known.values().next().value);
      updateConnection(true);renderLists();renderHeader();
      if(!before)$('connectionDialog').close();
      if(state.selected&&next.history?.unlocked)await loadMessages();
      else if(state.selected&&!next.history?.unlocked){state.messages=[];renderMessages();}
    }catch(error){if(epoch===state.epoch){
      if(error.status===503&&state.status){$('bridgeStatus').textContent='Local node busy · retrying';}
      else{updateConnection(false);$('bridgeStatus').textContent=error.status===401?'Connection expired · reconnect':error.message;}
      if([401,403,423].includes(error.status)){state.status=null;state.messages=[];renderMessages();}
      $('connectionError').textContent=error.message;
    }}
    finally{if(epoch===state.epoch){state.polling=false;clearTimeout(pollTimer);if(state.token)pollTimer=setTimeout(refresh,2500);}}
  }
  $('messageForm').addEventListener('submit',async event=>{
    event.preventDefault();const draft=$('messageInput').value;const text=draft.trim();
    if(!text||!state.connected||!state.selected||state.sending)return;
    const selected=state.selected;const epoch=state.epoch;const reply=state.reply;
    state.sending=true;updateComposer();
    try{
      const body=reply?`> ${nameFor(reply.sender)}: ${reply.text.slice(0,350)}\n\n${text}`:text;
      if(new TextEncoder().encode(body).length>8192)throw new Error('This message is too long. Shorten it before sending.');
      if(!state.nonce||state.nonce.conversation!==selected||state.nonce.body!==body)
        state.nonce={id:crypto.randomUUID().replaceAll('-',''),conversation:selected,body};
      const nonce=state.nonce;
      await api('/v1/messages',{method:'POST',body:JSON.stringify({conversation:selected,text:body,clientId:nonce.id})});
      if(epoch!==state.epoch)return;
      if(state.nonce===nonce)state.nonce=null;
      if(state.selected===selected&&$('messageInput').value===draft&&state.reply===reply){
        $('messageInput').value='';state.reply=null;$('replyPreview').hidden=true;
      }
      if(state.selected===selected){await loadMessages();if(epoch===state.epoch&&state.selected===selected)$('timeline').scrollTop=$('timeline').scrollHeight;}
    }catch(error){toast(error.message);}
    finally{state.sending=false;updateComposer();if(epoch===state.epoch)$('messageInput').focus();}
  });
  $('messageInput').addEventListener('input',()=>{state.nonce=null;updateComposer();});$('messageInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('messageForm').requestSubmit();}});
  $('cancelReply').onclick=()=>{state.reply=null;$('replyPreview').hidden=true;};$('conversationSearch').oninput=renderLists;$('messageSearch').oninput=renderMessages;
  $('searchMessagesButton').onclick=()=>{$('messageSearchRow').hidden=!$('messageSearchRow').hidden;if(!$('messageSearchRow').hidden)$('messageSearch').focus();};$('closeMessageSearch').onclick=()=>{$('messageSearchRow').hidden=true;$('messageSearch').value='';renderMessages();};
  $('detailsButton').onclick=()=>{const open=$('detailsPanel').hidden;$('detailsPanel').hidden=!open;$('detailsButton').setAttribute('aria-expanded',String(open));};
  $('toggleNav').onclick=()=>{const open=$('sidebar').classList.toggle('open');$('toggleNav').setAttribute('aria-expanded',String(open));};
  for(const id of ['connectionButton','identityButton','connectSidebar'])$(id).onclick=()=>{$('connectionDialog').showModal();};
  $('connectWelcome').onclick=()=>{if(state.connected){$('sidebar').classList.add('open');$('toggleNav').setAttribute('aria-expanded','true');$('conversationSearch').focus();}else $('connectionDialog').showModal();};
  function copyText(text){
    const field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.className='sr-only';
    const parent=document.querySelector('dialog[open]')||document.body;parent.append(field);field.select();
    let copied=false;try{copied=document.execCommand('copy');}catch{}finally{field.remove();}
    if(copied)return Promise.resolve();
    if(!navigator.clipboard?.writeText)return Promise.reject(new Error('Clipboard unavailable'));
    return Promise.race([navigator.clipboard.writeText(text),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Clipboard unavailable')),1500))]);
  }
  $('copyCommand').onclick=async()=>{
    try{await copyText($('launchCommand').textContent);$('copyCommand').textContent='Copied';toast('Command copied.');setTimeout(()=>{$('copyCommand').textContent='Copy';},2500);}
    catch{const range=document.createRange();range.selectNodeContents($('launchCommand'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);toast('Command selected. Press Ctrl+C or ⌘C to copy.');}
  };
  let backendPackages=null;
  function setLauncher(){
    const platform=$('launcherPlatform').value;const windows=platform==='windows-x86_64';
    const script=windows?'start-tether-chat.ps1':'start-tether-chat.sh';
    $('launchCommand').textContent=windows?'irm https://www.basanta.cc/chat/start-tether-chat.ps1 | iex':'curl -fsSL https://www.basanta.cc/chat/start-tether-chat.sh | sh';
    $('launcherDownload').href=`/chat/${script}`;$('launcherDownload').download=script;
    const pkg=backendPackages?.platforms?.[platform];
    const available=Boolean(pkg&&/^\/tether\/downloads\/backend\/[a-zA-Z0-9._-]+$/.test(pkg.url)&&/^[a-f0-9]{64}$/.test(pkg.sha256));
    $('copyCommand').disabled=false;
    $('launcherDownload').hidden=!available;
    $('backendDownload').href=available?pkg.url:'/tether';
    $('backendDownload').textContent=available?'Download backend directly':'All downloads';
    $('backendAvailability').textContent=available?`Version ${backendPackages.version}. The launcher checks the download before starting it.`:backendPackages?'This system’s chat package is not published yet. Choose another system or check back after its build finishes.':'Checking packages…';
  }
  $('launcherPlatform').value=/Windows/i.test(navigator.userAgent)?'windows-x86_64':/Macintosh|Mac OS X/i.test(navigator.userAgent)?'macos-arm64':'linux-x86_64';
  $('launcherPlatform').onchange=setLauncher;setLauncher();
  fetch('/chat/backend.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error();return response.json();}).then(packages=>{backendPackages=packages;setLauncher();}).catch(()=>{$('backendAvailability').textContent='Package availability could not be checked. Retry in a moment, or use All downloads.';});
  $('useConnectionLink').onclick=()=>{try{const link=new URL($('connectionLink').value);const params=new URLSearchParams(link.hash.slice(1));const token=params.get('tether-token')||params.get('token');const port=Number(params.get('tether-port')||params.get('port'));if(!/^[a-f0-9]{64}$/i.test(token||'')||!validPort(port))throw new Error('Paste the complete connection link from your backend terminal.');replaceConnection(token,port);$('connectionLink').value='';$('connectionError').textContent='';refresh();}catch(error){$('connectionError').textContent=error.message;}};
  $('disconnectButton').onclick=()=>{state.epoch++;state.token='';state.status=null;state.messages=[];state.selected='';try{sessionStorage.removeItem(storageKey);}catch{}clearTimeout(pollTimer);updateConnection(false);renderLists();renderHeader();renderMessages();location.reload();};
  $('newRoomButton').onclick=()=>{$('roomMembers').replaceChildren();for(const device of state.status?.devices||[]){if(device.fingerprint===state.status.identity?.fingerprint||device.trusted===false)continue;const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.value=device.fingerprint;input.name='member';label.append(input,avatar(device.alias),document.createTextNode(device.alias));$('roomMembers').append(label);}$('roomError').textContent='';$('roomDialog').showModal();};$('closeRoomDialog').onclick=()=>$('roomDialog').close();
  $('roomForm').onsubmit=async event=>{event.preventDefault();$('createRoomButton').disabled=true;try{const members=[...$('roomMembers').querySelectorAll('input:checked')].map(input=>input.value);if(!members.length)throw new Error('Choose at least one trusted device.');const data=await api('/v1/rooms',{method:'POST',body:JSON.stringify({name:$('roomName').value.trim(),members})});$('roomDialog').close();await refresh();select(`room:${data.room.id}`);}catch(error){$('roomError').textContent=error.message;}finally{$('createRoomButton').disabled=false;}};
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement?.tagName||'')&&!document.querySelector('dialog[open]')){event.preventDefault();$('conversationSearch').focus();}});
  setInterval(()=>{if(state.selected)renderMessages();},60000);
  renderHeader();renderLists();
  if(state.token)refresh();else updateConnection(false);
})();
