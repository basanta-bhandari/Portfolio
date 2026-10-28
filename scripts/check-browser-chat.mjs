// Opt-in live check. Creates a disposable room and encrypted test messages;
// it never reads another room, admin account, database credential or profile.
import assert from 'node:assert/strict';
import * as C from '../chat/crypto.js';
if(!process.argv.includes('--live'))throw new Error('Use --live to create disposable test data on the configured site.');
const origin=process.env.TETHER_CHAT_CHECK_ORIGIN||'https://www.basanta.cc';
if(!/^https:\/\/(www\.)?basanta\.cc$/.test(origin))throw new Error('Explicitly review this script before targeting another host.');
const room=C.randomHex(),secret=C.randomHex(32),keys=await C.roomKeys(secret,room),members=[];
async function call(body,expected=200,requestOrigin=origin){
  const response=await fetch(`${origin}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json',Origin:requestOrigin},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const data=await response.json();assert.equal(response.status,expected,`Unexpected status for ${body.op}: ${data.error||response.status}`);return data;
}
try{
  for(const name of ['Protocol check A','Protocol check B','Protocol check C']){
    const me=await C.identity(),session=C.randomHex(32),p=await C.registration(me,room,name,session,false,keys.membership);
    await call({op:members.length?'join':'create',...p,session,access:keys.access,roomName:'Disposable protocol verification'});
    members.push({me,p,auth:{room,peer:me.peer,session}});
  }
  const [a,b,c]=members,directory=new Map(members.map(m=>[m.me.peer,m.p]));
  const group=await C.encryptMessage(a.me,room,keys.key,null,'Encrypted live room check');
  const stored=await call({op:'message',...a.auth,packet:group},201);
  const duplicate=await call({op:'message',...a.auth,packet:group});assert.equal(duplicate.seq,stored.seq);
  const dm=await C.encryptMessage(a.me,room,keys.key,b.p,'Encrypted private DM check');
  await call({op:'message',...a.auth,packet:dm},201);
  const bob=await call({op:'poll',...b.auth}),cara=await call({op:'poll',...c.auth});
  assert.equal(bob.messages.length,2);assert.equal(cara.messages.length,1);assert.equal(cara.messages[0].packet.id,group.id);
  assert.equal(JSON.stringify(bob).includes('Encrypted private DM check'),false);
  assert.equal(JSON.stringify(bob).includes(secret),false);
  assert.equal(await C.decryptMessage(b.me,keys.key,directory,bob.messages.find(m=>m.packet.id===dm.id).packet),'Encrypted private DM check');
  await assert.rejects(C.decryptMessage(c.me,keys.key,directory,dm));
  await call({op:'poll',...a.auth,session:C.randomHex(32)},401);
  await call({op:'poll',...a.auth},403,'https://attacker.invalid');
  const forged={...dm,id:C.randomHex(),cipher:'A'.repeat(40)};await call({op:'message',...a.auth,packet:forged},401);
  const strangerReceipt=await C.receipt(c.me,room,dm.id);assert.equal((await call({op:'ack',...c.auth,receipt:strangerReceipt})).ok,false);
  const ack=await C.receipt(b.me,room,dm.id);assert.equal((await call({op:'ack',...b.auth,receipt:ack})).ok,true);
  const sender=await call({op:'poll',...a.auth});assert.equal(sender.receipts.length,1);assert.equal(await C.validReceipt(directory,sender.receipts[0]),true);
  assert.ok(bob.messages.every(m=>m.expiresAt>bob.serverTime&&m.expiresAt-bob.serverTime<=86400000));
  console.log('PASS: live creation/join, encrypted history, idempotent retries, DM isolation, tamper rejection, session/origin checks, signed delivery receipts and 24-hour expiry bounds.');
}finally{
  for(const member of members){try{await call({op:'leave',...member.auth});}catch{}}
}
