import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dataDir} from './cms.mjs';
const lifetime=12*3600000;
let key;
function signingKey(){
 if(key)return key;
 const file=resolve(dataDir,'csrf.key');
 try{key=readFileSync(file);}catch(error){if(error.code!=='ENOENT')throw error;try{writeFileSync(file,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}key=readFileSync(file);}
 if(key.length!==32)throw new Error('Kunci keamanan sesi tidak valid.');
 return key;
}
const signature=value=>createHmac('sha256',signingKey()).update(value).digest('hex');
function valid(token,now){
 if(typeof token!=='string'||!/^([a-f0-9]{64})\.([0-9]{13})\.([a-f0-9]{64})$/.test(token))return false;
 const [nonce,expires,mac]=token.split('.');
 if(Number(expires)<=now)return false;
 return timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(signature(nonce+'.'+expires),'hex'));
}
export function issueCsrf(existing,now=Date.now()){
 if(valid(existing,now))return existing;
 const value=randomBytes(32).toString('hex')+'.'+String(now+lifetime);
 return value+'.'+signature(value);
}
export function checkCsrf(header,cookie,now=Date.now()){
 if(typeof header!=='string'||typeof cookie!=='string'||header.length!==cookie.length||!valid(cookie,now))return false;
 return timingSafeEqual(Buffer.from(header),Buffer.from(cookie));
}
export function secureRequest(request){
 try{const origin=request.headers.get('origin');return (origin?new URL(origin).protocol:new URL(request.url).protocol)==='https:'||request.headers.get('x-forwarded-proto')?.split(',')[0].trim()==='https';}catch{return new URL(request.url).protocol==='https:';}
}
