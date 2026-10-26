import test from 'node:test';
import assert from 'node:assert/strict';
import {cmsFetch} from '../src/scripts/cms-fetch.ts';
const original={fetch:globalThis.fetch,document:globalThis.document,location:globalThis.location};
test('dashboard refreshes stale CSRF token once and transparently retries login',async()=>{
 const meta={content:'stale-token'},calls=[];
 globalThis.location={href:'https://new-tunnel.devtunnels.ms/blog/admin/',origin:'https://new-tunnel.devtunnels.ms'};
 globalThis.document={querySelector:()=>meta};
 globalThis.fetch=async(url,options={})=>{
  calls.push({url,token:options.headers?.get('X-BCIFT-CSRF'),credentials:options.credentials});
  if(url.endsWith('/csrf/'))return Response.json({token:'fresh-token'});
  return options.headers.get('X-BCIFT-CSRF')==='fresh-token'?Response.json({ok:true}):Response.json({code:'CSRF_EXPIRED'},{status:403});
 };
 const response=await cmsFetch('/blog/admin/api/login/',{method:'POST',body:'{}'});
 assert.equal(response.status,200);assert.deepEqual(calls.map(c=>c.token),['stale-token',undefined,'fresh-token']);assert.equal(meta.content,'fresh-token');assert.ok(calls.every(c=>c.credentials==='same-origin'));
 await assert.rejects(()=>cmsFetch('https://evil.example/login/',{method:'POST'}),/tidak valid/);
});
test('failed security retry stops instead of looping',async()=>{
 const meta={content:'old'};let calls=0;
 globalThis.location={href:'http://localhost:4321/blog/admin/',origin:'http://localhost:4321'};
 globalThis.document={querySelector:()=>meta};
 globalThis.fetch=async url=>{calls++;return url.endsWith('/csrf/')?Response.json({token:'new'}):Response.json({code:'CSRF_EXPIRED'},{status:403});};
 const response=await cmsFetch('/blog/admin/api/login/',{method:'POST',body:'{}'});assert.equal(response.status,403);assert.equal(calls,3);
});
test.after(()=>{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
