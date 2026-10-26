import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const dir=mkdtempSync(join(tmpdir(),'bcift-csrf-test-'));process.env.CMS_DATA_DIR=dir;
const {issueCsrf,checkCsrf,secureRequest}=await import('../src/server/csrf.mjs');
const {db}=await import('../src/server/cms.mjs');
test('signed CSRF tokens protect requests independently of tunnel hostname',()=>{
 const now=Date.now(),token=issueCsrf(undefined,now),other=issueCsrf(undefined,now);
 assert.equal(checkCsrf(token,token,now),true);assert.equal(issueCsrf(token,now),token);
 assert.equal(checkCsrf(token,other,now),false);assert.equal(checkCsrf(null,token,now),false);
 assert.equal(checkCsrf(token,null,now),false);assert.equal(checkCsrf('invalid','invalid',now),false);
 const forged=token.slice(0,-1)+(token.endsWith('0')?'1':'0');assert.equal(checkCsrf(forged,forged,now),false);
 assert.equal(checkCsrf(token,token,now+13*3600000),false);assert.notEqual(issueCsrf(token,now+13*3600000),token);
});
test('HTTPS cookie survives reverse proxy rewriting without trusting hostnames',()=>{
 assert.equal(secureRequest(new Request('http://localhost:4321/blog/admin/',{headers:{Origin:'https://changed-tunnel.devtunnels.ms'}})),true);
 assert.equal(secureRequest(new Request('http://localhost:4321/blog/admin/',{headers:{'X-Forwarded-Proto':'https'}})),true);
 assert.equal(secureRequest(new Request('http://localhost:4321/blog/admin/')),false);
});
test.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
