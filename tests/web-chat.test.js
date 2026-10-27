import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./helpers/db-loader.mjs',import.meta.url);
process.env.DATABASE_URL='postgres://disposable.invalid/test';
process.env.JWT_SECRET='disposable-chat-test-rate-key';
const C=await import('../chat/crypto.js');
const P=await import('../chat/protocol.js');
const S=await import('../lib/web-chat.js');
const handler=(await import('../lib/web-chat-handler.js')).default;
const rooms=new Map(),peers=new Map(),messages=new Map(),signals=[],receipts=new Map();let seq=0,overLimit=false;
const key=(room,peer)=>`${room}/${peer}`;
const active=m=>m.expires_at>Date.now();
function publicMessage(m){return {seq:m.seq,packet:m.packet,expires_at:new Date(m.expires_at)};}
globalThis.__portfolioTestSql=async(parts,...v)=>{
  const q=parts.join('?').replace(/\s+/g,' ').trim();
  if(q.startsWith('CREATE '))return [];
  if(q.startsWith('INSERT INTO tether_web_limits'))return [{count:overLimit?100000:1}];
  if(q.startsWith('INSERT INTO tether_web_rooms')){if(rooms.has(v[0]))return [];rooms.set(v[0],{access_hash:v[1],name:v[2],expires_at:Date.now()+P.RETENTION_MS});return [{id:v[0]}];}
  if(q.startsWith('SELECT name FROM tether_web_rooms')){const r=rooms.get(v[0]);return r&&r.access_hash===v[1]&&active(r)?[{name:r.name}]:[];}
  if(q.startsWith('SELECT peer,session_hash,seen_at'))return [...peers.values()].filter(p=>p.room===v[0]);
  if(q.startsWith('INSERT INTO tether_web_peers')){peers.set(key(v[0],v[1]),{room:v[0],peer:v[1],session_hash:v[2],registration:JSON.parse(v[3]),seen_at:new Date()});return [];}
  if(q.startsWith('SELECT p.session_hash')){const p=peers.get(key(v[0],v[1])),r=rooms.get(v[0]);return p&&r&&active(r)?[{...p,name:r.name}]:[];}
  if(q.startsWith('UPDATE tether_web_peers')){const p=peers.get(key(v[0],v[1]));if(p)p.seen_at=new Date(q.includes('to_timestamp')?0:Date.now());return [];}
  if(q.startsWith('SELECT registration,seen_at'))return [...peers.values()].filter(p=>p.room===v[0]);
  if(q.startsWith('SELECT count(*)'))return [{total:[...messages.values()].filter(m=>m.room===v[0]&&active(m)).length}];
  if(q.startsWith('INSERT INTO tether_web_messages')){const k=key(v[0],v[1]);if(messages.has(k))return [];const packet=JSON.parse(v[4]);const row={room:v[0],id:v[1],sender:v[2],recipient:v[3],packet:Object.fromEntries(Object.entries(packet).sort(([a],[b])=>a.localeCompare(b))),seq:++seq,expires_at:Date.now()+P.RETENTION_MS};messages.set(k,row);return [publicMessage(row)];}
  if(q.startsWith('SELECT packet,seq,expires_at')){const m=messages.get(key(v[0],v[1]));return m?[publicMessage(m)]:[];}
  if(q.startsWith('SELECT * FROM (SELECT seq,packet')||q.startsWith('SELECT seq,packet')){const initial=q.startsWith('SELECT *'),room=v[0],after=initial?0:v[1],peer=v[initial?1:2];const rows=[...messages.values()].filter(m=>m.room===room&&active(m)&&m.seq>after&&(!m.recipient||m.recipient===peer||m.sender===peer)).sort((a,b)=>a.seq-b.seq);return (initial?rows.slice(-100):rows.slice(0,100)).map(publicMessage);}
  if(q.startsWith('UPDATE tether_web_rooms')){rooms.get(v[0]).expires_at=Date.now()+P.RETENTION_MS;return [];}
  if(q.startsWith('SELECT peer FROM tether_web_peers')){const p=peers.get(key(v[0],v[1]));return p?[{peer:p.peer}]:[];}
  if(q.startsWith('DELETE FROM tether_web_signals WHERE id IN')){const selected=signals.filter(s=>s.room===v[0]&&s.recipient===v[1]).slice(0,100);for(const s of selected)signals.splice(signals.indexOf(s),1);return selected;}
  if(q.startsWith('DELETE FROM tether_web_signals'))return [];
  if(q.startsWith('INSERT INTO tether_web_signals')){signals.push({room:v[0],sender:v[1],recipient:v[2],data:JSON.parse(v[3])});return [];}
  if(q.startsWith('INSERT INTO tether_web_receipts')){const m=messages.get(key(v[2],v[3])),peer=v[0];if(!m||!active(m)||m.sender===peer||m.recipient&&m.recipient!==peer)return [];receipts.set(`${key(v[2],v[3])}/${peer}`,JSON.parse(v[1]));return [{peer}];}
  if(q.startsWith('SELECT r.receipt'))return [...receipts.values()].filter(r=>r.room===v[0]&&messages.get(key(r.room,r.id))?.sender===v[1]&&active(messages.get(key(r.room,r.id)))).map(receipt=>({receipt}));
  if(q.startsWith('DELETE FROM tether_web_messages')){for(const [k,m] of messages)if(!active(m)&&(!v.length||m.room===v[0]))messages.delete(k);return [];}
  if(q.startsWith('DELETE FROM tether_web_rooms')){for(const [k,r] of rooms)if(!active(r))rooms.delete(k);return [];}
  if(q.startsWith('DELETE FROM tether_web_limits'))return [];
  throw new Error(`Unexpected test SQL: ${q}`);
};
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
async function call(body,origin='https://www.basanta.cc'){const res=response();await handler({method:'POST',body,headers:{origin,'content-type':'application/json','x-forwarded-for':'192.0.2.20'}},res);return res;}
async function member(me,room,name,secret,op='join'){
  const session=C.randomHex(32),keys=await C.roomKeys(secret,room),p=await C.registration(me,room,name,session,true,keys.membership);
  const result=await call({op,...p,session,access:keys.access,roomName:'Disposable test room'});assert.equal(result.code,200,JSON.stringify(result.body));
  return {me,room,session,keys,registration:p,auth:{room,peer:me.peer,session}};
}

test('browser encryption, identity binding and private direct messages',async()=>{
  const a=await C.identity(),b=await C.identity(),c=await C.identity(),room=C.randomHex(),secret=C.randomHex(32),keys=await C.roomKeys(secret,room);
  const registrations=await Promise.all([[a,'Alice'],[b,'Bob'],[c,'Cara']].map(([me,name])=>C.registration(me,room,name,C.randomHex(32),true,keys.membership)));
  const directory=new Map(registrations.map(p=>[p.peer,p]));
  for(const p of registrations)assert.equal(await C.validPeer(p,keys.membership),true);
  assert.equal(await C.validPeer({...registrations[0],exchangeKey:registrations[1].exchangeKey},keys.membership),false);
  assert.equal(P.sameRegistration(registrations[0],{...registrations[0],lastSeen:Date.now()}),true);
  assert.equal(P.sameRegistration(registrations[0],{...registrations[0],exchangeKey:registrations[1].exchangeKey}),false);
  const group=await C.encryptMessage(a,room,keys.key,null,'literal <script> text');
  assert.equal(await C.decryptMessage(b,keys.key,directory,group),'literal <script> text');
  const wrong=await C.roomKeys(C.randomHex(32),room);
  const injected=await C.registration(c,room,'Fake Alice',C.randomHex(32),true,wrong.membership);
  assert.equal(await C.validPeer(injected,keys.membership),false);
  await assert.rejects(C.decryptMessage(b,wrong.key,directory,group));
  await assert.rejects(C.decryptMessage(b,keys.key,directory,{...group,cipher:group.cipher.slice(0,-2)+'AA'}));
  const dm=await C.encryptMessage(a,room,keys.key,registrations[1],'private to Bob');
  assert.equal(await C.decryptMessage(b,keys.key,directory,dm),'private to Bob');
  assert.equal(await C.decryptMessage(a,keys.key,directory,dm),'private to Bob');
  await assert.rejects(C.decryptMessage(c,keys.key,directory,dm));
  assert.equal((await C.identity(a.saved)).peer,a.peer);
  assert.notEqual(keys.access,secret);
});

test('browser chat API enforces capabilities, signatures, DM isolation, expiry and replay rules',async t=>{
  const room=C.randomHex(),secret=C.randomHex(32),a=await member(await C.identity(),room,'Alice',secret,'create'),b=await member(await C.identity(),room,'Bob',secret),c=await member(await C.identity(),room,'Cara',secret);
  const packet=await C.encryptMessage(a.me,room,a.keys.key,b.registration,'private API message');
  await t.test('wrong session, wrong invite, and cross-site writes are rejected',async()=>{
    assert.equal((await call({op:'poll',...a.auth,session:C.randomHex(32)})).code,401);
    assert.equal((await call({op:'poll',...a.auth},'https://attacker.invalid')).code,403);
    const other=await C.identity(),session=C.randomHex(32),p=await C.registration(other,room,'Stranger',session,true,a.keys.membership);
    assert.equal((await call({op:'join',...p,session,access:C.randomHex(32)})).code,404);
    const newSession=C.randomHex(32),changed=await C.registration(a.me,room,'Alice',newSession,true,a.keys.membership);
    assert.equal((await call({op:'join',...changed,session:newSession,access:a.keys.access})).code,409);
  });
  await t.test('forgeries fail and the server stores only a canonical encrypted envelope',async()=>{
    assert.equal((await call({op:'message',...a.auth,packet:{...packet,sender:b.me.peer}})).code,403);
    assert.equal((await call({op:'message',...a.auth,packet:{...packet,cipher:'A'.repeat(40)}})).code,401);
    assert.equal((await call({op:'message',...a.auth,packet:{...packet,accidentalPlaintext:'DO NOT STORE'}})).code,201);
    assert.equal(JSON.stringify([...messages.values()]).includes('private API message'),false);
    assert.equal(JSON.stringify([...messages.values()]).includes('DO NOT STORE'),false);
    assert.equal(JSON.stringify([...rooms.values()]).includes(secret),false);
  });
  await t.test('retries survive JSONB key reordering without duplicates',async()=>{
    assert.equal((await call({op:'message',...a.auth,packet})).code,200);assert.equal(messages.size,1);
    const changed=await C.encryptMessage(a.me,room,a.keys.key,b.registration,'changed');changed.id=packet.id;
    assert.equal((await call({op:'message',...a.auth,packet:changed})).code,401);
  });
  await t.test('third room members never receive another pair’s DM',async()=>{
    assert.equal((await call({op:'poll',...b.auth})).body.messages.length,1);
    assert.equal((await call({op:'poll',...a.auth})).body.messages.length,1);
    assert.equal((await call({op:'poll',...c.auth})).body.messages.length,0);
  });
  await t.test('only the intended recipient can acknowledge a private message',async()=>{
    const wrong=await C.receipt(c.me,room,packet.id);assert.equal((await call({op:'ack',...c.auth,receipt:wrong})).body.ok,false);
    const ack=await C.receipt(b.me,room,packet.id);assert.equal((await call({op:'ack',...b.auth,receipt:ack})).body.ok,true);
    const poll=await call({op:'poll',...a.auth});assert.equal(poll.body.receipts.length,1);
    assert.equal(await C.validReceipt(new Map([[b.me.peer,b.registration]]),poll.body.receipts[0]),true);
    assert.equal((await call({op:'ack',...c.auth,receipt:ack})).code,400);
  });
  await t.test('signaling stays inside the admitted room',async()=>{
    assert.equal((await call({op:'signal',...a.auth,to:C.randomHex(),data:{description:{type:'offer',sdp:'test'}}})).body.ok,false);
    await call({op:'signal',...a.auth,to:b.me.peer,data:{candidate:{candidate:'disposable'}}});
    assert.equal((await call({op:'poll',...c.auth})).body.signals.length,0);
    assert.equal((await call({op:'poll',...b.auth})).body.signals.length,1);
  });
  await t.test('expired ciphertext is not returned, and rate limits fail closed',async()=>{
    messages.get(key(room,packet.id)).expires_at=Date.now()-1;
    assert.equal((await call({op:'poll',...b.auth})).body.messages.length,0);
    overLimit=true;assert.equal((await call({op:'poll',...a.auth})).code,429);overLimit=false;
  });
});

test('the shared deployment entry point keeps settings and browser chat separate',async()=>{
  const route=(await import('../api/tether-settings.js')).default;
  const health=response();await route({method:'GET',query:{browser_chat:'1'},headers:{}},health);
  assert.equal(health.code,200);assert.equal(health.body.browserChat,true);
  const normal=response();await route({method:'POST',query:{},body:{op:'create'},headers:{origin:'https://www.basanta.cc','content-type':'application/json'}},normal);
  assert.equal(normal.code,405);
});
