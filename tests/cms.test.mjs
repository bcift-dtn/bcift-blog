import test from 'node:test';
import {initCoverEditor} from '../src/scripts/cover-editor.mjs';
import {initLinkEditor} from '../src/scripts/link-editor.mjs';
import {JSDOM} from 'jsdom';
import {stripTypeScriptTypes} from 'node:module';
import {readCategories,categoryLabel,matchesCategory} from '../src/lib/categories.mjs';
import {isDestination} from '../src/lib/destination-trips.mjs';
import {mediaUrl} from '../src/lib/media-url.mjs';
import {createPasteFormatter} from '../src/scripts/paste-content.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
const dir=mkdtempSync(join(tmpdir(),'bcift-cms-test-'));process.env.CMS_DATA_DIR=dir;
const cms=await import('../src/server/cms.mjs');
const password='Testing-password-123!';
test('email/password grants a session directly, including accounts with legacy MFA',()=>{
 assert.throws(()=>cms.createAccount('first-editor@example.com',password,'editor'),/pertama/);
 cms.createAdmin('owner@example.com',password);assert.throws(()=>cms.createAdmin('stranger@example.com',password));assert.throws(()=>cms.login('owner@example.com','wrong','unit'));
 const token=cms.login('owner@example.com',password,'unit');assert.equal(cms.authenticated(token),true);assert.equal(cms.currentUser(token).role,'admin');cms.logout(token);assert.equal(cms.authenticated(token),false);
 cms.db.prepare('UPDATE admins SET mfa_enabled=1,mfa_secret=? WHERE email=?').run('legacy-unused-secret','owner@example.com');
 const legacy=cms.login('owner@example.com',password,'unit');assert.equal(cms.authenticated(legacy),true);
 cms.db.prepare('UPDATE sessions SET last_seen=? WHERE token=?').run(Date.now()-31*60000,createHash('sha256').update(legacy).digest('hex'));assert.equal(cms.authenticated(legacy),false);
 const incomplete=cms.login('owner@example.com',password,'unit');cms.db.prepare('UPDATE sessions SET verified=0 WHERE token=?').run(createHash('sha256').update(incomplete).digest('hex'));assert.equal(cms.authenticated(incomplete),false);
});
test('CLI refuses passwords piped or passed through non-interactive input',()=>{
 const before=cms.db.prepare('SELECT count(*) AS count FROM admins').get().count;
 const result=spawnSync(process.execPath,['scripts/create-user.mjs'],{env:{...process.env},input:'outsider@example.com\nSecret-password-123!\n',encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/terminal interaktif/);assert.ok(!result.stdout.includes('Secret-password'));assert.equal(cms.db.prepare('SELECT count(*) AS count FROM admins').get().count,before);
});
test('HTML sanitization, draft validation and edit conflict protection',()=>{
 const article=cms.saveArticle({title:'Ferry travel tips',body:'<script>alert(1)</script><h2>Plan your trip</h2><p>Prepare your booking and check the terminal before you leave.</p><img src="x" onerror="alert(1)">',status:'draft'});
 assert.match(cms.cleanBody('<div>One</div><div>Two</div>'),/<p>One<\/p><p>Two<\/p>/);assert.ok(!article.body.includes('script'));assert.ok(!article.body.includes('onerror'));
 assert.throws(()=>cms.saveArticle({...article,updated_at:'old'},article.id),/tab lain/);assert.throws(()=>cms.saveArticle({...article,status:'published'},article.id),/Lengkapi/);
 const live=cms.saveArticle({...article,status:'published',description:'A useful ferry guide',image:'/images/ferry.webp',image_alt:'Ferry at sea'},article.id);assert.ok(live.published_at);assert.equal(cms.articleBody(live.body).headings.length,1);assert.throws(()=>cms.saveArticle({...live,id:undefined}),/Slug sudah/);
});
test('cover positions persist independently for desktop and mobile and preserve existing content',()=>{
 const image_focus={desktop:{x:50,y:5},mobile:{x:80,y:25}};
 const article=cms.saveArticle({title:'Adjustable article cover',body:'<p>Original article text.</p>',image_focus});assert.deepEqual(article.image_focus,image_focus);
 const row=cms.db.prepare('SELECT * FROM articles WHERE id=?').get(article.id);assert.deepEqual(cms.asPost(row).data.imageFocus,image_focus);
 const edited=cms.saveArticle({title:article.title,updated_at:article.updated_at,body:article.body},article.id);assert.deepEqual(edited.image_focus,image_focus);assert.equal(edited.body,article.body);
 assert.throws(()=>cms.saveArticle({...edited,image_focus:{desktop:{x:50,y:101},mobile:{x:50,y:50}}},edited.id),/Posisi gambar/);
});

test('multiple categories validate, persist and retain legacy category assignments',()=>{
 const article=cms.saveArticle({title:'Multiple category guide',categories:['Destination','Explore Batam','Destination'],body:'<p>Destination guide.</p>'});
 assert.deepEqual(article.categories,['Destination','Explore Batam']);assert.equal(article.category,'Destination');
 const row=cms.db.prepare('SELECT * FROM articles WHERE id=?').get(article.id);assert.deepEqual(cms.asPost(row).data.categories,article.categories);
 const edited=cms.saveArticle({title:article.title,body:article.body,updated_at:article.updated_at},article.id);assert.deepEqual(edited.categories,article.categories);
 assert.throws(()=>cms.saveArticle({...edited,categories:[]},edited.id),/kategori/);assert.throws(()=>cms.saveArticle({...edited,categories:['Invalid']},edited.id),/kategori/);
 const legacy=cms.saveArticle({title:'Legacy category article',category:'Explore Batam'});cms.db.prepare("UPDATE articles SET categories='[]' WHERE id=?").run(legacy.id);assert.deepEqual(cms.asPost(cms.db.prepare('SELECT * FROM articles WHERE id=?').get(legacy.id)).data.categories,['Explore Batam']);
 assert.equal(isDestination(['Travel Guide','Destination']),true);assert.equal(isDestination(['Explore Batam']),true);assert.equal(isDestination(['Informasi BCIFT']),false);
});

test('destination estimates persist separately from body and survive edits',()=>{
 const body='<p>A guide to places worth visiting around Batam.</p>';
 const trips=[{location:'Test beach',minutes:25,transport:'Mobil / taksi'},{location:'Test park',minutes:10,transport:'Jalan kaki'}];
 const article=cms.saveArticle({title:'Destination travel estimates',category:'Destination',body,destination_trips:trips});
 assert.deepEqual(article.destination_trips,trips);assert.equal(article.body,body);
 assert.deepEqual(cms.asPost(cms.db.prepare('SELECT * FROM articles WHERE id=?').get(article.id)).data.destinationTrips,trips);
 const edited=cms.saveArticle({...article,destination_trips:undefined,title:'Updated destination estimates'},article.id);
 assert.deepEqual(edited.destination_trips,trips);
 for(const minutes of [0,-2,1.5,1441,'abc',null])assert.throws(()=>cms.saveArticle({...edited,destination_trips:[{...trips[0],minutes}]},article.id),/menit/);
 assert.throws(()=>cms.saveArticle({...edited,destination_trips:[{...trips[0],location:''}]},article.id),/lokasi/);
 assert.throws(()=>cms.saveArticle({...edited,destination_trips:[{...trips[0],transport:'unknown'}]},article.id),/moda/);
 const cleared=cms.saveArticle({...edited,destination_trips:[]},article.id);assert.deepEqual(cleared.destination_trips,[]);
 assert.deepEqual(cms.asPost(cms.db.prepare('SELECT * FROM articles WHERE slug=?').get('ferry-travel-tips')).data.destinationTrips,[]);
});

test('HTTP: direct password login, registration closed, roles, revocation and reset',async()=>{
 const port=44329,origin=`http://127.0.0.1:${port}`,tunnel='https://t9k80gqr-4321.asse.devtunnels.ms';
 const server=spawn(process.execPath,['dist/server/entry.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',CMS_PUBLIC_ORIGIN:tunnel},stdio:'pipe'});let log='';server.stderr.on('data',d=>log+=d);server.stdout.on('data',d=>log+=d);
 let csrf='',csrfCookie='';
 const call=(path,method='GET',data,cookie='',requestOrigin=origin)=>fetch(origin+'/blog/admin/api/'+path+'/',{method,headers:{'Content-Type':'application/json',Origin:requestOrigin,...(requestOrigin==='https://evil.example'?{}:{'X-BCIFT-CSRF':csrf}),Cookie:[csrfCookie,cookie].filter(Boolean).join('; ')},body:data?JSON.stringify(data):undefined});
 const cookieOf=response=>response.headers.get('set-cookie').match(/bcift_(?:pending|session)=[a-f0-9]{64}/)?.[0];
 async function ownerLogin(requestOrigin=origin){const r=await call('login','POST',{email:'owner@example.com',password},'',requestOrigin);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.clone().json()).mfa,undefined);assert.equal((await call('articles','GET',null,cookieOf(r))).status,200);return r;}
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/blog/admin/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}assert.ok(ready,log);
  const bootstrap=await fetch(origin+'/blog/admin/');const html=await bootstrap.text();csrf=html.match(/name="bcift-csrf" content="([^"]+)"/)?.[1];csrfCookie=bootstrap.headers.get('set-cookie').match(/bcift_csrf=[^;,]+/)[0];assert.ok(csrf);assert.match(html,/INTERNAL TEAM/);assert.ok(!html.includes('id="team-toggle"'));assert.ok(!html.includes('id="mfa-panel"'));assert.ok(!html.includes('id="recovery-panel"'));
  assert.equal((await call('articles')).status,401);assert.equal((await call('login','POST',{email:'owner@example.com',password},'','https://evil.example')).status,403);
  assert.equal((await call('login','POST',{email:'outside@example.com',password})).status,400);
  const verified=await ownerLogin();const adminCookie=cookieOf(verified);const editorHtml=await(await fetch(origin+'/blog/admin/',{headers:{Cookie:adminCookie}})).text();for(const name of ['Destination','Informasi Terminal','Informasi BCIFT'])assert.ok(editorHtml.includes('value="'+name+'"'));assert.match(verified.headers.get('set-cookie'),/HttpOnly/i);
  const dom=new JSDOM(editorHtml,{url:origin+'/blog/admin/',runScripts:'outside-only'});let submitted=null;
  try{
   const w=dom.window;w.scrollTo=()=>{};Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
   Object.assign(w,{initCoverEditor,initLinkEditor,mediaUrl,readCategories,categoryLabel,isDestination,createPasteFormatter,cmsFetch:async(_url,options={})=>{if(options.method==='POST'){submitted=JSON.parse(options.body);return Response.json({...submitted,id:999,updated_at:'test-version'});}return Response.json([]);}});
   w.eval(stripTypeScriptTypes(readFileSync('src/scripts/admin.ts','utf8').replace(/^import .*;\r?$/gm,'')));
   await new Promise(r=>setTimeout(r,0));w.document.getElementById('new').click();
   const form=w.document.getElementById('article-form'),setCategories=values=>{for(const input of form.querySelectorAll('input[name="categories"]'))input.checked=values.includes(input.value);w.document.getElementById('category-options').dispatchEvent(new w.Event('change'));};assert.equal(w.document.getElementById('destination-panel').hidden,true);
   setCategories(['Destination','Explore Batam']);assert.equal(w.document.getElementById('destination-panel').hidden,false);
   w.document.getElementById('add-destination').click();const row=w.document.querySelector('.destination-row');row.querySelector('[data-trip="location"]').value='Editor test beach';row.querySelector('[data-trip="minutes"]').value='25';
   form.elements.namedItem('image').value='https://example.com/cover.jpg';form.elements.namedItem('image').dispatchEvent(new w.Event('change'));w.document.getElementById('adjust-cover').click();const cropCanvas=w.document.getElementById('cover-canvas'),cropImage=w.document.getElementById('cover-crop-preview');Object.defineProperty(cropImage,'naturalWidth',{value:1600});Object.defineProperty(cropImage,'naturalHeight',{value:900});cropCanvas.getBoundingClientRect=()=>({width:1440,height:320});cropCanvas.dispatchEvent(new w.MouseEvent('pointerdown',{button:0,clientX:0,clientY:0}));cropCanvas.dispatchEvent(new w.MouseEvent('pointermove',{clientX:0,clientY:348}));cropCanvas.dispatchEvent(new w.MouseEvent('pointerup'));assert.equal(cropImage.style.objectPosition,'50% 0%');const cropY=w.document.getElementById('cover-y');cropY.value='10';cropY.dispatchEvent(new w.Event('input'));w.document.querySelector('[data-cover-mode="mobile"]').click();cropY.value='5';cropY.dispatchEvent(new w.Event('input'));w.document.getElementById('done-cover').click();
   form.elements.namedItem('title').value='Editor destination';form.elements.namedItem('slug').value='editor-destination';w.document.getElementById('body').innerHTML='<p>Travel guide content.</p>';w.document.getElementById('save-draft').click();
   await new Promise(r=>setTimeout(r,0));assert.deepEqual(submitted.image_focus,{desktop:{x:50,y:10},mobile:{x:50,y:5}});assert.deepEqual(submitted.categories,['Destination','Explore Batam']);assert.equal(submitted.destination_trips[0].location,'Editor test beach');assert.equal(Number(submitted.destination_trips[0].minutes),25);assert.equal(submitted.body,'<p>Travel guide content.</p>');
   setCategories(['Informasi BCIFT']);assert.equal(w.document.getElementById('destination-panel').hidden,true);assert.equal(w.document.querySelector('.destination-row').disabled,true);
   setCategories(['Destination','Explore Batam']);w.document.querySelector('.remove-destination').click();assert.equal(w.document.querySelectorAll('.destination-row').length,0);
  }finally{dom.window.close();}

  const dynamicTunnel='https://new-preview-4321.asse.devtunnels.ms';const dynamic=await call('login','POST',{email:'owner@example.com',password},'',dynamicTunnel);assert.equal(dynamic.status,200,await dynamic.clone().text());assert.match(dynamic.headers.get('set-cookie'),/Secure/i);
  const rejected=await fetch(origin+'/blog/admin/api/login/',{method:'POST',headers:{Origin:dynamicTunnel,Cookie:csrfCookie,'Content-Type':'application/json','X-BCIFT-CSRF':'invalid'},body:JSON.stringify({email:'owner@example.com',password})});assert.equal(rejected.status,403);
  const tunnelLogin=await ownerLogin(tunnel);assert.match(tunnelLogin.headers.get('set-cookie'),/Secure/i);
  assert.equal((await call('setup','POST',{email:'other@example.com',password},'',tunnel)).status,403);
  assert.equal((await call('setup','POST',{email:'other@example.com',password})).status,403);
  assert.equal((await call('setup')).status,403);
  assert.equal((await call('team/invite','POST',{email:'outsider@example.com',role:'admin'},adminCookie)).status,403);
  assert.equal(cms.db.prepare('SELECT id FROM admins WHERE email=?').get('outsider@example.com'),undefined);
  const created=cms.createAccount('writer@example.com',password,'editor');assert.equal(created.role,'editor');
  assert.throws(()=>cms.createAccount('WRITER@example.com',password,'admin'),/sudah/);
  const accepted=await call('login','POST',{email:'writer@example.com',password});assert.equal(accepted.status,200);
  const writerCookie=cookieOf(accepted);assert.equal((await call('articles','GET',null,writerCookie)).status,200);
  assert.equal((await call('mfa/enroll','POST',{},writerCookie)).status,404);assert.equal((await call('mfa/verify','POST',{code:'123456'},writerCookie)).status,404);
  assert.equal((await call('team','GET',null,writerCookie)).status,403);assert.equal((await call('team/invite','POST',{email:'intruder@example.com'},writerCookie)).status,403);
  let r=await call('articles','POST',{title:'Dashboard test article',category:'Informasi Terminal',body:'<h2>Before boarding</h2><p>A complete article with enough useful content for this publishing workflow test.</p>',status:'draft'},writerCookie);assert.equal(r.status,200,await r.clone().text());let article=await r.json();assert.equal(article.category,'Informasi Terminal');
  assert.equal((await fetch(origin+'/blog/'+article.slug+'/')).status,404);assert.equal((await fetch(origin+'/blog/'+article.slug+'/?preview=1')).status,404);
  const preview=await fetch(origin+'/blog/'+article.slug+'/?preview=1',{headers:{Cookie:writerCookie}});assert.equal(preview.status,200);assert.match(await preview.text(),/noindex/);
  assert.equal((await call('articles','POST',{...article,status:'published'},writerCookie)).status,403);
  const upload=await fetch(origin+'/blog/admin/api/upload/',{method:'POST',headers:{Cookie:[csrfCookie,writerCookie].join('; '),Origin:origin,'X-BCIFT-CSRF':csrf,'Content-Type':'image/png'},body:readFileSync('public/images/logo.png')});assert.equal(upload.status,200);const image=(await upload.json()).url;assert.ok(image.endsWith('/'));const served=await fetch(origin+image,{redirect:'manual'});assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/png');assert.equal(served.headers.get('location'),null);assert.deepEqual(Buffer.from(await served.arrayBuffer()),readFileSync('public/images/logo.png'));
  const devPort=44332,devOrigin='http://127.0.0.1:'+devPort;
  const dev=spawn(process.execPath,['node_modules/astro/bin/astro.mjs','dev','--host','127.0.0.1','--port',String(devPort)],{env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:'pipe'});let devLog='';dev.stderr.on('data',d=>devLog+=d);dev.stdout.on('data',d=>devLog+=d);
  try{let ready=false;for(let i=0;i<400;i++){try{if((await fetch(devOrigin+'/favicon.png')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}assert.ok(ready,devLog);const response=await fetch(devOrigin+image,{redirect:'manual'});assert.equal(response.status,200,devLog);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync('public/images/logo.png'));}finally{dev.kill();if(dev.exitCode===null)await once(dev,'exit');}
  r=await call('articles','POST',{...article,status:'published',category:'Informasi BCIFT',categories:['Informasi BCIFT'],description:'Guide for travelling by ferry',image,image_alt:'Test image',seo_title:'Ferry guide SEO'},adminCookie);assert.equal(r.status,200);article=await r.json();assert.equal(article.category,'Informasi BCIFT');
  assert.equal((await call('articles','POST',{...article,status:'draft'},writerCookie)).status,403);assert.equal((await call('articles/'+article.id,'DELETE',null,writerCookie)).status,403);
  cms.db.prepare('UPDATE articles SET image=?,body=body||? WHERE id=?').run(image.slice(0,-1),'<p><img src="'+image.slice(0,-1)+'" alt="Legacy image"></p>',article.id);
  const listed=await(await call('articles','GET',null,adminCookie)).json();assert.equal(listed.find(p=>p.id===article.id).image,image);assert.ok(listed.find(p=>p.id===article.id).body.includes('src="'+image+'"'));
  const page=await fetch(origin+'/blog/'+article.slug+'/');assert.equal(page.status,200);const pageHtml=await page.text();assert.match(pageHtml,/Ferry guide SEO/);assert.ok(pageHtml.includes('Informasi BCIFT'));const listing=await(await fetch(origin+'/blog/')).text();for(const name of ['Destination','Informasi Terminal','Informasi BCIFT'])assert.ok(listing.includes('data-filter="'+name+'"'));assert.equal((listing.match(/data-filter="Destination"/g)||[]).length,1);assert.ok(pageHtml.includes('src="'+image+'"'));assert.match(await(await fetch(origin+'/blog/sitemap.xml')).text(),/dashboard-test-article/);
  const tripPayload={image_focus:{desktop:{x:45,y:10},mobile:{x:75,y:5}},title:'A destination with travel details',category:'Destination',categories:['Destination','Explore Batam'],description:'A destination guide',body:'<h2>Explore the destination</h2><p>Useful information for planning your visit to this destination.</p>',image,image_alt:'Destination cover',status:'published',destination_trips:[{location:'Sample destination',minutes:35,transport:'Mobil / taksi'}]};
  const tripResponse=await call('articles','POST',tripPayload,adminCookie);assert.equal(tripResponse.status,200,await tripResponse.clone().text());const tripArticle=await tripResponse.json();assert.deepEqual(tripArticle.categories,['Destination','Explore Batam']);assert.deepEqual(tripArticle.destination_trips,tripPayload.destination_trips);
  const tripsListed=await(await call('articles','GET',null,adminCookie)).json();assert.deepEqual(tripsListed.find(a=>a.id===tripArticle.id).destination_trips,tripPayload.destination_trips);
  const multiListing=await(await fetch(origin+'/blog/')).text();const listingDom=new JSDOM(multiListing);try{const card=listingDom.window.document.querySelector('#stories a[href="/blog/'+tripArticle.slug+'/"]');assert.ok(card);const assigned=JSON.parse(card.dataset.categories);for(const category of ['Destination','Explore Batam'])assert.equal(matchesCategory(assigned,category),true);assert.equal(listingDom.window.document.querySelectorAll('#stories a[href="/blog/'+tripArticle.slug+'/"]').length,1);assert.equal(listingDom.window.document.querySelectorAll('[data-filter="Explore Batam"]').length,1);}finally{listingDom.window.close();}
  const tripHtml=await(await fetch(origin+'/blog/'+tripArticle.slug+'/')).text();assert.ok(tripHtml.includes('--cover-x:45%;--cover-y:10%;--cover-mobile-x:75%;--cover-mobile-y:5%'));assert.deepEqual(tripArticle.image_focus,tripPayload.image_focus);assert.ok(tripHtml.includes('± 35 menit'));assert.ok(tripHtml.includes('Sample destination'));assert.ok(tripHtml.includes('destination-mobile'));assert.ok(tripHtml.includes('destination-desktop'));
  const richBody=tripHtml.match(/<div class="article-body">([\s\S]*?)<\/article>/)?.[1];assert.ok(richBody);assert.ok(!richBody.includes('Sample destination'));assert.ok(!richBody.includes('35 menit'));
  assert.equal((await call('articles','POST',{...tripArticle,category:'Informasi BCIFT',categories:['Informasi BCIFT']},adminCookie)).status,200);
  const changedHtml=await(await fetch(origin+'/blog/'+tripArticle.slug+'/')).text();assert.ok(!changedHtml.includes('± 35 menit'));
  const team=await(await call('team','GET',null,adminCookie)).json();const writer=team.members.find(m=>m.email==='writer@example.com');
  assert.equal((await call('team/1','POST',{active:false},adminCookie)).status,400);
  assert.equal((await call('team/'+writer.id,'POST',{active:false},adminCookie)).status,200);assert.equal((await call('articles','GET',null,writerCookie)).status,401);assert.equal((await call('login','POST',{email:'writer@example.com',password})).status,400);
  assert.equal((await call('team/'+writer.id,'POST',{active:true},adminCookie)).status,200);
  const reset=await(await call('team/reset-password','POST',{email:'writer@example.com'},adminCookie)).json();const resetAccepted=await call('invite/accept','POST',{token:reset.token,password:'Changed-password-123!'});assert.equal(resetAccepted.status,200);const resetCookie=cookieOf(resetAccepted);const status=await(await call('session','GET',null,resetCookie)).json();assert.equal(status.authenticated,true);assert.equal(status.pending,undefined);assert.equal((await call('articles','GET',null,resetCookie)).status,200);
  const revoked=await(await call('team/reset-password','POST',{email:'owner@example.com'},adminCookie)).json();await call('team/revoke','POST',{email:'owner@example.com'},adminCookie);assert.equal((await call('invite/check','POST',{token:revoked.token})).status,400);
  const expired=await(await call('team/reset-password','POST',{email:'owner@example.com'},adminCookie)).json();cms.db.prepare('UPDATE invitations SET expires=0 WHERE email=?').run('owner@example.com');assert.equal((await call('invite/check','POST',{token:expired.token})).status,400);
  const audit=await(await call('audit','GET',null,adminCookie)).json();assert.ok(audit.some(a=>a.event==='member.updated'));assert.equal(JSON.stringify(audit).includes(reset.token),false);
  await call('logout','POST',{},adminCookie);assert.equal((await call('articles','GET',null,adminCookie)).status,401);
 }finally{server.kill();if(server.exitCode===null)await once(server,'exit');}
});
test.after(()=>{cms.db.close();rmSync(dir,{recursive:true,force:true});});
