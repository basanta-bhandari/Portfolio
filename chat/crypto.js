import {header,signaturePayload,registrationPayload,receiptPayload,TOKEN,ID,MAX_TEXT} from './protocol.js';
const utf8=new TextEncoder(),decode=new TextDecoder();
export function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function unb64(text){return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
export function randomHex(size=16){return [...crypto.getRandomValues(new Uint8Array(size))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof bytes==='string'?utf8.encode(bytes):bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function identity(saved){
  let sign,exchange;
  if(saved){
    sign={privateKey:await crypto.subtle.importKey('jwk',saved.sign,{name:'ECDSA',namedCurve:'P-256'},false,['sign'])};
    exchange={privateKey:await crypto.subtle.importKey('jwk',saved.exchange,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits'])};
  }else{
    sign=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    exchange=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
    saved={sign:await crypto.subtle.exportKey('jwk',sign.privateKey),exchange:await crypto.subtle.exportKey('jwk',exchange.privateKey),signKey:b64(await crypto.subtle.exportKey('spki',sign.publicKey)),exchangeKey:b64(await crypto.subtle.exportKey('spki',exchange.publicKey))};
  }
  return {saved,sign:sign.privateKey,exchange:exchange.privateKey,signKey:saved.signKey,exchangeKey:saved.exchangeKey,peer:(await hash(unb64(saved.signKey))).slice(0,32)};
}
async function sign(key,text){return b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,utf8.encode(text)));}
async function verify(key,text,sig){
  try{const imported=await crypto.subtle.importKey('spki',unb64(key),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},imported,unb64(sig),utf8.encode(text));}catch{return false;}
}
export async function registration(me,room,name,session,direct=true){
  const p={room,peer:me.peer,name,signKey:me.signKey,exchangeKey:me.exchangeKey,sessionHash:await hash(session),direct};
  return {...p,proof:await sign(me.sign,registrationPayload(p))};
}
export async function validPeer(p){return ID.test(p.peer)&&p.peer===(await hash(unb64(p.signKey))).slice(0,32)&&await verify(p.signKey,registrationPayload(p),p.proof);}
export async function roomKeys(secret,room){
  if(!TOKEN.test(secret)||!ID.test(room))throw new Error('This invite is incomplete. Copy the whole invite link.');
  const seed=await crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),x=>parseInt(x,16)),'HKDF',false,['deriveBits','deriveKey']);
  const params=label=>({name:'HKDF',hash:'SHA-256',salt:utf8.encode(room),info:utf8.encode(`Tether browser v1 ${label}`)});
  const key=await crypto.subtle.deriveKey(params('room encryption'),seed,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const access=[...new Uint8Array(await crypto.subtle.deriveBits(params('room admission'),seed,256))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return {key,access};
}
async function dmKey(me,other,room){
  const publicKey=await crypto.subtle.importKey('spki',unb64(other.exchangeKey),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const bits=await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},me.exchange,256);
  const seed=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:utf8.encode(room),info:utf8.encode('Tether browser v1 direct message')},seed,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptMessage(me,room,key,other,text){
  if(!text.trim()||text.length>MAX_TEXT)throw new Error(`Messages can contain up to ${MAX_TEXT} characters.`);
  const p={v:1,id:randomHex(),room,sender:me.peer,to:other?.peer||null,createdAt:Date.now()};
  const iv=crypto.getRandomValues(new Uint8Array(12));
  p.iv=b64(iv);p.cipher=b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8.encode(header(p))},other?await dmKey(me,other,room):key,utf8.encode(text)));
  p.sig=await sign(me.sign,signaturePayload(p));return p;
}
export async function decryptMessage(me,key,peers,p){
  if(p.v!==1||!ID.test(p.id)||!Number.isFinite(p.createdAt))throw new Error('Invalid message.');
  const sender=peers.get(p.sender);if(!sender||!await verify(sender.signKey,signaturePayload(p),p.sig))throw new Error('Message signature could not be verified.');
  let decryption=key;
  if(p.to){if(p.sender!==me.peer&&p.to!==me.peer)throw new Error('This direct message belongs to someone else.');const other=peers.get(p.sender===me.peer?p.to:p.sender);if(!other)throw new Error('Unknown recipient.');decryption=await dmKey(me,other,p.room);}
  const text=decode.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(p.iv),additionalData:utf8.encode(header(p))},decryption,unb64(p.cipher)));
  if(!text.trim()||text.length>MAX_TEXT)throw new Error('Invalid message length.');return text;
}
export async function receipt(me,room,id){const r={room,id,peer:me.peer};return {...r,sig:await sign(me.sign,receiptPayload(r))};}
export async function validReceipt(peers,r){return Boolean(peers.get(r.peer)&&await verify(peers.get(r.peer).signKey,receiptPayload(r),r.sig));}
