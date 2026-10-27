export const RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_TEXT = 4000;
export const ID = /^[a-f0-9]{32}$/;
export const TOKEN = /^[a-f0-9]{64}$/;
export function registrationPayload(p) {
  return JSON.stringify({room:p.room,peer:p.peer,name:p.name,signKey:p.signKey,exchangeKey:p.exchangeKey,sessionHash:p.sessionHash,direct:p.direct!==false});
}
export function sameRegistration(a,b) { return Boolean(a&&b&&a.proof===b.proof&&a.membership===b.membership&&registrationPayload(a)===registrationPayload(b)); }
export function membershipPayload(p) { return `Tether room member v1\n${registrationPayload(p)}\n${p.proof}`; }
export function header(p) {
  return JSON.stringify({v:1,id:p.id,room:p.room,sender:p.sender,to:p.to||null,createdAt:p.createdAt});
}
export function signaturePayload(p) { return `${header(p)}\n${p.iv}\n${p.cipher}`; }
export function receiptPayload(r) { return JSON.stringify({room:r.room,id:r.id,peer:r.peer}); }
