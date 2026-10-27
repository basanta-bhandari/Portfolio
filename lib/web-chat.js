import {createHash,createHmac,createPublicKey,verify,timingSafeEqual} from 'node:crypto';
import {sql} from './db.js';
import {InputError,text} from './security.js';
import {ID,TOKEN,registrationPayload,signaturePayload,header} from '../chat/protocol.js';
let tables;
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function id(value,label='ID'){if(typeof value!=='string'||!ID.test(value))throw new InputError(`Invalid ${label}.`);return value;}
export function token(value){if(typeof value!=='string'||!TOKEN.test(value))throw new InputError('Invalid connection credentials.',401);return value;}
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function validSignature(key,payload,signature){
  try{const publicKey=createPublicKey({key:Buffer.from(key,'base64url'),format:'der',type:'spki'});if(publicKey.asymmetricKeyType!=='ec'||publicKey.asymmetricKeyDetails.namedCurve!=='prime256v1')return false;const sig=Buffer.from(signature,'base64url');return sig.length===64&&verify('sha256',Buffer.from(payload),{key:publicKey,dsaEncoding:'ieee-p1363'},sig);}catch{return false;}
}
export function validateRegistration(body){
  const p={room:id(body.room,'room'),peer:id(body.peer,'identity'),name:text(body.name,'Your name',{max:40}),signKey:text(body.signKey,'Signing key',{max:200}),exchangeKey:text(body.exchangeKey,'Exchange key',{max:200}),sessionHash:digest(token(body.session)),direct:body.direct!==false};
  if(digest(Buffer.from(p.signKey,'base64url')).slice(0,32)!==p.peer||!validSignature(p.signKey,registrationPayload(p),body.proof))throw new InputError('Identity signature is invalid.',401);
  try{const key=createPublicKey({key:Buffer.from(p.exchangeKey,'base64url'),format:'der',type:'spki'});if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails.namedCurve!=='prime256v1')throw new Error();}catch{throw new InputError('Invalid exchange key.');}
  return {...p,proof:body.proof};
}
export function validatePacket(p,auth){
  if(!p||p.v!==1||p.room!==auth.room||p.sender!==auth.peer)throw new InputError('Invalid message identity.',403);
  id(p.id,'message');if(p.to!==null)id(p.to,'recipient');
  if(!Number.isSafeInteger(p.createdAt)||Math.abs(Date.now()-p.createdAt)>5*60*1000)throw new InputError('Your clock is out of sync. Refresh and try again.');
  if(typeof p.iv!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(p.iv)||typeof p.cipher!=='string'||!/^[A-Za-z0-9_-]{24,24000}$/.test(p.cipher))throw new InputError('Invalid encrypted message.');
  if(!validSignature(auth.signKey,signaturePayload(p),p.sig))throw new InputError('Message signature is invalid.',401);
  return {...JSON.parse(header(p)),iv:p.iv,cipher:p.cipher,sig:p.sig};
}
export async function ensureChat(){
  if(!tables)tables=(async()=>{
    await sql`CREATE TABLE IF NOT EXISTS tether_web_rooms (id TEXT PRIMARY KEY, access_hash TEXT NOT NULL, name TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '24 hours')`;
    await sql`CREATE TABLE IF NOT EXISTS tether_web_peers (room TEXT NOT NULL REFERENCES tether_web_rooms(id) ON DELETE CASCADE, peer TEXT NOT NULL, session_hash TEXT NOT NULL, registration JSONB NOT NULL, seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(room,peer))`;
    await sql`CREATE TABLE IF NOT EXISTS tether_web_messages (seq BIGSERIAL PRIMARY KEY, room TEXT NOT NULL REFERENCES tether_web_rooms(id) ON DELETE CASCADE, id TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT, packet JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '24 hours', UNIQUE(room,id))`;
    await sql`CREATE INDEX IF NOT EXISTS tether_web_messages_room_seq ON tether_web_messages(room,seq)`;
    await sql`CREATE INDEX IF NOT EXISTS tether_web_messages_expiry ON tether_web_messages(expires_at)`;
    await sql`CREATE TABLE IF NOT EXISTS tether_web_receipts (room TEXT NOT NULL, id TEXT NOT NULL, peer TEXT NOT NULL, receipt JSONB NOT NULL, PRIMARY KEY(room,id,peer), FOREIGN KEY(room,id) REFERENCES tether_web_messages(room,id) ON DELETE CASCADE)`;
    await sql`CREATE TABLE IF NOT EXISTS tether_web_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS tether_web_signals (id BIGSERIAL PRIMARY KEY, room TEXT NOT NULL REFERENCES tether_web_rooms(id) ON DELETE CASCADE, sender TEXT NOT NULL, recipient TEXT NOT NULL, data JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '60 seconds')`;
    await sql`CREATE INDEX IF NOT EXISTS tether_web_signals_recipient ON tether_web_signals(room,recipient)`;
  })().catch(error=>{tables=null;throw error;});await tables;
}
export async function rate(req,scope,key,limit,seconds=60){
  const bucket=Math.floor(Date.now()/(seconds*1000));
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const identity=key||createHmac('sha256',process.env.JWT_SECRET||'tether-web-rate-limit').update(ip).digest('hex');
  const k=digest(`${scope}:${identity}:${bucket}`);
  const rows=await sql`INSERT INTO tether_web_limits(key,count,expires_at) VALUES(${k},1,now()+(${seconds*2}*interval '1 second')) ON CONFLICT(key) DO UPDATE SET count=tether_web_limits.count+1 RETURNING count`;
  if(rows[0].count>limit)throw new InputError('Too many requests. Please wait a moment.',429);
}
export async function authenticate(body){
  const room=id(body.room,'room'),peer=id(body.peer,'identity'),session=digest(token(body.session));
  const rows=await sql`SELECT p.session_hash,p.registration,r.name FROM tether_web_peers p JOIN tether_web_rooms r ON r.id=p.room WHERE p.room=${room} AND p.peer=${peer} AND r.expires_at>now()`;
  if(!rows[0]||!equal(rows[0].session_hash,session))throw new InputError('This conversation has expired. Open an invite to rejoin.',401);
  return {...rows[0].registration,room,peer,roomName:rows[0].name};
}
export async function cleanup(){
  await sql`DELETE FROM tether_web_messages WHERE expires_at<=now()`;
  await sql`DELETE FROM tether_web_rooms WHERE expires_at<=now()`;
  await sql`DELETE FROM tether_web_limits WHERE expires_at<=now()`;
}
