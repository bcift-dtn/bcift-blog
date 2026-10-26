import type {APIRoute} from 'astro';
import {db} from '../../../server/cms.mjs';
export const GET:APIRoute=({params})=>{
 if(!/^[a-f0-9]{32}$/.test(params.id||''))return new Response(null,{status:404});
 const file=db.prepare('SELECT type,bytes FROM media WHERE id=?').get(params.id!) as {type:string,bytes:Uint8Array}|undefined;
 return file?new Response(file.bytes,{headers:{'Content-Type':file.type,'X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=31536000,immutable'}}):new Response(null,{status:404});
};
