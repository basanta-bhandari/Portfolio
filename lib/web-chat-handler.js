import {sql} from './db.js';
import {secureApi,InputError,text} from './security.js';
import {ensureChat,rate,authenticate,validateRegistration,validatePacket,validSignature,digest,id,token,cleanup} from './web-chat.js';
import {receiptPayload,signaturePayload} from '../chat/protocol.js';

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
      await cleanup();
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
  const auth=await authenticate(b);
  await rate(req,'session',digest(b.session),300);
  if(b.op==='poll'){
    const after=Number(b.after||0);if(!Number.isSafeInteger(after)||after<0)throw new InputError('Invalid message cursor.');
    await sql`UPDATE tether_web_peers SET seen_at=now() WHERE room=${auth.room} AND peer=${auth.peer}`;
    const peers=await sql`SELECT registration,seen_at FROM tether_web_peers WHERE room=${auth.room}`;
    const messages=after===0?await sql`SELECT * FROM (SELECT seq,packet,expires_at FROM tether_web_messages WHERE room=${auth.room} AND expires_at>now() AND (recipient IS NULL OR recipient=${auth.peer} OR sender=${auth.peer}) ORDER BY seq DESC LIMIT 100) recent ORDER BY seq ASC`:await sql`SELECT seq,packet,expires_at FROM tether_web_messages WHERE room=${auth.room} AND seq>${after} AND expires_at>now() AND (recipient IS NULL OR recipient=${auth.peer} OR sender=${auth.peer}) ORDER BY seq LIMIT 100`;
    const receipts=await sql`SELECT r.receipt FROM tether_web_receipts r JOIN tether_web_messages m ON m.room=r.room AND m.id=r.id WHERE r.room=${auth.room} AND m.sender=${auth.peer} AND m.expires_at>now() ORDER BY m.seq DESC LIMIT 500`;
    // Signaling shares the encrypted-message queue's bounded lifetime, not process RAM.
    const signals=await sql`DELETE FROM tether_web_signals WHERE id IN (SELECT id FROM tether_web_signals WHERE room=${auth.room} AND recipient=${auth.peer} ORDER BY id LIMIT 100) RETURNING sender,data`;
    return res.status(200).json({name:auth.roomName,peers:peers.map(x=>({...x.registration,lastSeen:new Date(x.seen_at).getTime()})),messages:messages.map(x=>({seq:Number(x.seq),packet:x.packet,expiresAt:new Date(x.expires_at).getTime()})),receipts:receipts.map(x=>x.receipt),signals,serverTime:Date.now()});
  }
  if(b.op==='message'){
    await rate(req,'message',auth.peer,60);
    const p=validatePacket(b.packet,auth);
    await rate(req,'global-message','global',5000,86400);
    if(p.to){const rows=await sql`SELECT peer FROM tether_web_peers WHERE room=${auth.room} AND peer=${p.to}`;if(!rows[0])throw new InputError('That person is not in this room.');}
    const count=await sql`SELECT count(*)::int AS total FROM tether_web_messages WHERE room=${auth.room} AND expires_at>now()`;
    if(count[0].total>=5000)throw new InputError('This room has reached its 24-hour message limit.',429);
    const rows=await sql`INSERT INTO tether_web_messages(room,id,sender,recipient,packet) VALUES(${auth.room},${p.id},${auth.peer},${p.to},${JSON.stringify(p)}::jsonb) ON CONFLICT(room,id) DO NOTHING RETURNING seq,expires_at`;
    if(!rows[0]){const old=await sql`SELECT packet,seq,expires_at FROM tether_web_messages WHERE room=${auth.room} AND id=${p.id}`;if(!old[0]||signaturePayload(old[0].packet)!==signaturePayload(p)||old[0].packet.sig!==p.sig)throw new InputError('Message ID conflict.',409);return res.status(200).json({seq:Number(old[0].seq),expiresAt:new Date(old[0].expires_at).getTime()});}
    await sql`DELETE FROM tether_web_messages WHERE room=${auth.room} AND expires_at<=now()`;
    await sql`UPDATE tether_web_rooms SET expires_at=now()+interval '24 hours' WHERE id=${auth.room}`;
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
    const r=b.receipt;if(!r||r.room!==auth.room||r.peer!==auth.peer||!['delivered','read'].includes(r.kind)||!Number.isSafeInteger(r.at)||Math.abs(Date.now()-r.at)>5*60*1000||!validSignature(auth.signKey,receiptPayload(r),r.sig))throw new InputError('Invalid receipt.');id(r.id,'message');
    const rows=await sql`INSERT INTO tether_web_receipts(room,id,peer,receipt) SELECT room,id,${auth.peer},${JSON.stringify(r)}::jsonb FROM tether_web_messages WHERE room=${auth.room} AND id=${r.id} AND expires_at>now() AND sender<>${auth.peer} AND (recipient IS NULL OR recipient=${auth.peer}) ON CONFLICT(room,id,peer) DO UPDATE SET receipt=EXCLUDED.receipt RETURNING peer`;
    return res.status(200).json({ok:rows.length>0});
  }
  await sql`UPDATE tether_web_peers SET seen_at=to_timestamp(0) WHERE room=${auth.room} AND peer=${auth.peer}`;
  return res.status(200).json({ok:true});
}
export default secureApi(handler,{maxBytes:48*1024});
