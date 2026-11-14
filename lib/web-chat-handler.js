import {sql} from './db.js';
import {secureApi,InputError,text} from './security.js';
import {ensureChat,rate,authenticate,validateRegistration,validatePacket,validSignature,digest,id,token,maybeCleanup} from './web-chat.js';
import {receiptPayload,signaturePayload} from '../chat/protocol.js';

function cursor(value,label){const n=Number(value||0);if(!Number.isSafeInteger(n)||n<0)throw new InputError(`Invalid ${label} cursor.`);return n;}

async function handler(req,res){
  if(req.method==='GET')return res.status(200).json({browserChat:true,configured:Boolean(process.env.DATABASE_URL),retentionHours:24});
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Use POST.'});}
  const b=req.body||{};
  if(!['create','join','poll','message','signal','ack','leave'].includes(b.op))throw new InputError('Unknown chat operation.');
  if(!process.env.DATABASE_URL)return res.status(503).json({error:'Browser chat is not configured on this host yet.'});
  await ensureChat();
  if(b.op==='create'||b.op==='join'){
    await rate(req,b.op,null,b.op==='create'?8:30);
    const p=validateRegistration(b),access=digest(token(b.access));
    if(b.op==='create'){
      await rate(req,'global-create','global',200,3600);
      await maybeCleanup();
      const name=text(b.roomName,'Room name',{max:60});
      const rows=await sql`INSERT INTO tether_web_rooms(id,access_hash,name) VALUES(${p.room},${access},${name}) ON CONFLICT(id) DO NOTHING RETURNING id`;
      if(!rows.length)throw new InputError('This room already exists.',409);
    }
    const rooms=await sql`SELECT name FROM tether_web_rooms WHERE id=${p.room} AND access_hash=${access} AND expires_at>now()`;
    if(!rooms[0])throw new InputError('This invite is invalid or the conversation has expired.',404);
    const peers=await sql`SELECT peer,session_hash,seen_at FROM tether_web_peers WHERE room=${p.room}`;
    const existing=peers.find(x=>x.peer===p.peer);
    if(existing&&existing.session_hash!==p.sessionHash)throw new InputError('This identity already has a session. Start a new browser identity.',409);
    if(!existing&&(peers.length>=256||peers.filter(x=>Date.now()-new Date(x.seen_at).getTime()<45000).length>=16))throw new InputError('This room is full (16 people online at once).',409);
    await sql`INSERT INTO tether_web_peers(room,peer,session_hash,registration) VALUES(${p.room},${p.peer},${p.sessionHash},${JSON.stringify(p)}::jsonb) ON CONFLICT(room,peer) DO UPDATE SET registration=EXCLUDED.registration,seen_at=now()`;
    return res.status(200).json({room:p.room,name:rooms[0].name});
  }
  // Authentication and the per-session limiter are independent round trips; run them together.
  const [auth]=await Promise.all([authenticate(b),rate(req,'session',digest(token(b.session)),300)]);
  if(b.op==='poll'){
    const after=cursor(b.after,'message');
    // Older open tabs omit receiptsAfter and keep receiving the most recent receipts on every poll.
    const receiptsAfter=b.receiptsAfter===undefined?null:cursor(b.receiptsAfter,'receipt');
    await maybeCleanup();
    const [,peers,messages,receipts]=await Promise.all([
      sql`UPDATE tether_web_peers SET seen_at=now() WHERE room=${auth.room} AND peer=${auth.peer}`,
      sql`SELECT registration,seen_at FROM tether_web_peers WHERE room=${auth.room}`,
      after===0?sql`SELECT * FROM (SELECT seq,packet,expires_at FROM tether_web_messages WHERE room=${auth.room} AND expires_at>now() AND (recipient IS NULL OR recipient=${auth.peer} OR sender=${auth.peer}) ORDER BY seq DESC LIMIT 100) recent ORDER BY seq ASC`:sql`SELECT seq,packet,expires_at FROM tether_web_messages WHERE room=${auth.room} AND seq>${after} AND expires_at>now() AND (recipient IS NULL OR recipient=${auth.peer} OR sender=${auth.peer}) ORDER BY seq LIMIT 100`,
      receiptsAfter===null
        ?sql`SELECT r.receipt FROM tether_web_receipts r JOIN tether_web_messages m ON m.room=r.room AND m.id=r.id WHERE r.room=${auth.room} AND m.sender=${auth.peer} AND m.expires_at>now() ORDER BY m.seq DESC LIMIT 500`
        :sql`SELECT r.seq,r.receipt FROM tether_web_receipts r JOIN tether_web_messages m ON m.room=r.room AND m.id=r.id WHERE r.room=${auth.room} AND r.seq>${receiptsAfter} AND m.sender=${auth.peer} AND m.expires_at>now() ORDER BY r.seq LIMIT 500`
    ]);
    // Dequeuing is destructive, so it runs only after every read above has succeeded.
    // Signaling shares the encrypted-message queue's bounded lifetime, not process RAM; stale offers are never delivered.
    const signals=(await sql`DELETE FROM tether_web_signals WHERE id IN (SELECT id FROM tether_web_signals WHERE room=${auth.room} AND recipient=${auth.peer} AND expires_at>now() ORDER BY id LIMIT 100) RETURNING id,sender,data`).sort((a,b)=>Number(a.id)-Number(b.id)).map(({sender,data})=>({sender,data}));
    const body={name:auth.roomName,peers:peers.map(x=>({...x.registration,lastSeen:new Date(x.seen_at).getTime()})),messages:messages.map(x=>({seq:Number(x.seq),packet:x.packet,expiresAt:new Date(x.expires_at).getTime()})),receipts:receipts.map(x=>x.receipt),signals,serverTime:Date.now()};
    if(receiptsAfter!==null)body.receiptCursor=receipts.reduce((max,x)=>Math.max(max,Number(x.seq)),receiptsAfter);
    return res.status(200).json(body);
  }
  if(b.op==='message'){
    await rate(req,'message',auth.peer,60);
    const p=validatePacket(b.packet,auth);
    await rate(req,'global-message','global',5000,86400);
    const [recipient,count]=await Promise.all([
      p.to?sql`SELECT peer FROM tether_web_peers WHERE room=${auth.room} AND peer=${p.to}`:null,
      sql`SELECT count(*)::int AS total FROM tether_web_messages WHERE room=${auth.room} AND expires_at>now()`
    ]);
    if(p.to&&!recipient[0])throw new InputError('That person is not in this room.');
    if(count[0].total>=5000)throw new InputError('This room has reached its 24-hour message limit.',429);
    const rows=await sql`INSERT INTO tether_web_messages(room,id,sender,recipient,packet) VALUES(${auth.room},${p.id},${auth.peer},${p.to},${JSON.stringify(p)}::jsonb) ON CONFLICT(room,id) DO NOTHING RETURNING seq,expires_at`;
    if(!rows[0]){const old=await sql`SELECT packet,seq,expires_at FROM tether_web_messages WHERE room=${auth.room} AND id=${p.id}`;if(!old[0]||signaturePayload(old[0].packet)!==signaturePayload(p)||old[0].packet.sig!==p.sig)throw new InputError('Message ID conflict.',409);return res.status(200).json({seq:Number(old[0].seq),expiresAt:new Date(old[0].expires_at).getTime()});}
    await Promise.all([
      sql`DELETE FROM tether_web_messages WHERE room=${auth.room} AND expires_at<=now()`,
      sql`UPDATE tether_web_rooms SET expires_at=now()+interval '24 hours' WHERE id=${auth.room}`
    ]);
    return res.status(201).json({seq:Number(rows[0].seq),expiresAt:new Date(rows[0].expires_at).getTime()});
  }
  if(b.op==='signal'){
    await rate(req,'signal',`${auth.room}:${auth.peer}`,80);
    const to=id(b.to,'recipient');if(!b.data||typeof b.data!=='object'||Array.isArray(b.data)||Buffer.byteLength(JSON.stringify(b.data))>16000)throw new InputError('Invalid connection signal.');
    const peers=await sql`SELECT peer FROM tether_web_peers WHERE room=${auth.room} AND peer=${to} AND seen_at>now()-interval '45 seconds'`;
    if(!peers[0])return res.status(200).json({ok:false});
    await sql`DELETE FROM tether_web_signals WHERE expires_at<=now()`;
    await sql`INSERT INTO tether_web_signals(room,sender,recipient,data) VALUES(${auth.room},${auth.peer},${to},${JSON.stringify(b.data)}::jsonb)`;
    return res.status(200).json({ok:true});
  }
  if(b.op==='ack'){
    // Accept a batch (current clients) or a single receipt (tabs still running older code).
    const list=Array.isArray(b.receipts)?b.receipts:[b.receipt];
    if(!list.length||list.length>100)throw new InputError('Invalid receipt.');
    const strongest=new Map();
    for(const r of list){
      if(!r||typeof r!=='object'||r.room!==auth.room||r.peer!==auth.peer||!['delivered','read'].includes(r.kind)||!Number.isSafeInteger(r.at)||Math.abs(Date.now()-r.at)>5*60*1000||!validSignature(auth.signKey,receiptPayload(r),r.sig))throw new InputError('Invalid receipt.');
      id(r.id,'message');
      // One row per message: Postgres rejects an upsert that touches the same row twice.
      const old=strongest.get(r.id);if(!old||(r.kind==='read'&&old.kind!=='read'))strongest.set(r.id,{room:r.room,id:r.id,peer:r.peer,kind:r.kind,at:r.at,sig:r.sig});
    }
    // A late "delivered" never replaces an existing "read" receipt.
    const rows=await sql`INSERT INTO tether_web_receipts(room,id,peer,receipt) SELECT m.room,m.id,${auth.peer},x.receipt FROM jsonb_array_elements(${JSON.stringify([...strongest.values()])}::jsonb) AS x(receipt) JOIN tether_web_messages m ON m.room=${auth.room} AND m.id=x.receipt->>'id' WHERE m.expires_at>now() AND m.sender<>${auth.peer} AND (m.recipient IS NULL OR m.recipient=${auth.peer}) ON CONFLICT(room,id,peer) DO UPDATE SET receipt=CASE WHEN tether_web_receipts.receipt->>'kind'='read' AND EXCLUDED.receipt->>'kind'<>'read' THEN tether_web_receipts.receipt ELSE EXCLUDED.receipt END,seq=CASE WHEN tether_web_receipts.receipt->>'kind'='read' AND EXCLUDED.receipt->>'kind'<>'read' THEN tether_web_receipts.seq ELSE nextval(pg_get_serial_sequence('tether_web_receipts','seq')) END RETURNING id`;
    const acknowledged=rows.map(x=>x.id);
    return res.status(200).json({ok:acknowledged.length>0,acknowledged});
  }
  await sql`UPDATE tether_web_peers SET seen_at=to_timestamp(0) WHERE room=${auth.room} AND peer=${auth.peer}`;
  return res.status(200).json({ok:true});
}
export default secureApi(handler,{maxBytes:48*1024});
