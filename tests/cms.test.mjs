import test from 'node:test';
import {initCoverEditor} from '../src/scripts/cover-editor.mjs';
import {initLinkEditor} from '../src/scripts/link-editor.mjs';
import {JSDOM} from 'jsdom';
import {stripTypeScriptTypes} from 'node:module';
import {readCategories,categoryLabel,matchesCategory} from '../src/lib/categories.mjs';
import {isDestination} from '../src/lib/destination-trips.mjs';
import {mediaUrl} from '../src/lib/media-url.mjs';
import {createPasteFormatter} from '../src/scripts/paste-content.mjs';
import {initEditorToolbar} from '../src/scripts/editor-toolbar.mjs';
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

test('long slugs never end at a separator after truncation',()=>{
 const article=cms.saveArticle({title:'a'.repeat(99)+' b',body:'<p>Boundary title</p>'});
 assert.equal(article.slug,'a'.repeat(99));assert.equal(cms.slugify('b'.repeat(101)),'b'.repeat(100));
 assert.equal(cms.slugify(' -- A useful guide -- '),'a-useful-guide');
});
test('cover positions persist independently for desktop and mobile and preserve existing content',()=>{
 const image_focus={desktop:{x:50,y:5},mobile:{x:80,y:25}};
 const article=cms.saveArticle({title:'Adjustable article cover',body:'<p>Original article text.</p>',image_focus});assert.deepEqual(article.image_focus,image_focus);
 const row=cms.db.prepare('SELECT * FROM articles WHERE id=?').get(article.id);assert.deepEqual(cms.asPost(row).data.imageFocus,image_focus);
 const edited=cms.saveArticle({title:article.title,updated_at:article.updated_at,body:article.body},article.id);assert.deepEqual(edited.image_focus,image_focus);assert.equal(edited.body,article.body);
 assert.throws(()=>cms.saveArticle({...edited,image_focus:{desktop:{x:50,y:101},mobile:{x:50,y:50}}},edited.id),/Posisi gambar/);
});

test('thumbnail position and fit persist without changing banner positions',()=>{
 const banner={desktop:{x:25,y:10},mobile:{x:75,y:35}};
 const article=cms.saveArticle({title:'Thumbnail settings',image_focus:banner});
 const thumbnail={x:90,y:20,fit:'contain'};const edited=cms.saveArticle({...article,image_focus:{...banner,thumbnail}},article.id);
 assert.deepEqual(edited.image_focus,{...banner,thumbnail});assert.deepEqual(cms.asPost(cms.db.prepare('SELECT * FROM articles WHERE id=?').get(article.id)).data.imageFocus,{...banner,thumbnail});
 assert.throws(()=>cms.saveArticle({...edited,image_focus:{...banner,thumbnail:{x:101,y:20,fit:'cover'}}},article.id),/Posisi gambar/);
 assert.throws(()=>cms.saveArticle({...edited,image_focus:{...banner,thumbnail:{x:50,y:50,fit:'stretch'}}},article.id),/thumbnail/);
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
  const bootstrap=await fetch(origin+'/blog/admin/');const html=await bootstrap.text();csrf=html.match(/name="bcift-csrf" content="([^"]+)"/)?.[1];csrfCookie=bootstrap.headers.get('set-cookie').match(/bcift_csrf=[^;,]+/)[0];assert.ok(csrf);assert.match(html,/INTERNAL TEAM/);assert.ok(!html.includes('id="team-toggle"'));assert.ok(!html.includes('id="create-account"'));assert.ok(!html.includes('id="mfa-panel"'));assert.ok(!html.includes('id="recovery-panel"'));
  assert.equal((await call('articles')).status,401);assert.equal((await call('analytics')).status,401);assert.equal((await call('homepage')).status,401);assert.equal((await call('login','POST',{email:'owner@example.com',password},'','https://evil.example')).status,403);
  assert.equal((await call('login','POST',{email:'outside@example.com',password})).status,400);
  const verified=await ownerLogin();const adminCookie=cookieOf(verified);const editorHtml=await(await fetch(origin+'/blog/admin/',{headers:{Cookie:adminCookie}})).text();for(const name of ['Destination','Informasi Terminal','Informasi BCIFT'])assert.ok(editorHtml.includes('value="'+name+'"'));assert.match(verified.headers.get('set-cookie'),/HttpOnly/i);
  const dom=new JSDOM(editorHtml,{url:origin+'/blog/admin/',runScripts:'outside-only'});let submitted=null,savedArticle=null,failSave=false,delaySave=false,finishSave;
  try{
   const w=dom.window;w.scrollTo=()=>{};Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
   Object.assign(w,{initCoverEditor,initLinkEditor,initEditorToolbar,mediaUrl,readCategories,categoryLabel,isDestination,createPasteFormatter,cmsFetch:async(_url,options={})=>{if(options.method==='POST'){submitted=JSON.parse(options.body);if(failSave)return Response.json({error:'Test save failure'},{status:400});if(delaySave)await new Promise(resolve=>finishSave=resolve);savedArticle={...submitted,id:999,updated_at:'test-version'};return Response.json(savedArticle);}return Response.json(savedArticle?[savedArticle]:[]);}});
   w.eval(stripTypeScriptTypes(readFileSync('src/scripts/admin.ts','utf8').replace(/^import .*;\r?$/gm,'')));
   await new Promise(r=>setTimeout(r,0));
   const get=id=>w.document.getElementById(id);
   assert.equal(get('analytics-view').hidden,true);assert.equal(get('team-view').hidden,true);
   get('analytics-menu').click();assert.equal(get('library').hidden,true);assert.equal(get('analytics-view').hidden,false);assert.equal(get('analytics-menu').getAttribute('aria-current'),'page');assert.equal(get('articles-menu').hasAttribute('aria-current'),false);
   get('team-toggle').click();assert.equal(get('analytics-view').hidden,true);assert.equal(get('team-view').hidden,false);assert.equal(get('library').hidden,true);
   get('team-close').click();assert.equal(get('team-view').hidden,true);assert.equal(get('library').hidden,false);
   get('new').click();get('title').value='a'.repeat(99)+' b';get('title').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(get('slug').value,'a'.repeat(99));get('title').value='Unsaved changes';get('title').dispatchEvent(new w.Event('input',{bubbles:true}));w.confirm=()=>false;get('analytics-menu').click();assert.equal(get('editor-view').hidden,false);assert.equal(get('analytics-view').hidden,true);
   w.confirm=()=>true;get('analytics-menu').click();assert.equal(get('editor-view').hidden,true);assert.equal(get('analytics-view').hidden,false);get('articles-menu').click();get('new').click();
   const form=w.document.getElementById('article-form'),setCategories=values=>{for(const input of form.querySelectorAll('input[name="categories"]'))input.checked=values.includes(input.value);w.document.getElementById('category-options').dispatchEvent(new w.Event('change'));};assert.equal(w.document.getElementById('destination-panel').hidden,true);
   setCategories(['Destination','Explore Batam']);assert.equal(w.document.getElementById('destination-panel').hidden,false);
   w.document.getElementById('add-destination').click();const row=w.document.querySelector('.destination-row');row.querySelector('[data-trip="location"]').value='Editor test beach';row.querySelector('[data-trip="minutes"]').value='25';
   form.elements.namedItem('image').value='https://example.com/cover.jpg';form.elements.namedItem('image').dispatchEvent(new w.Event('change'));w.document.getElementById('adjust-cover').click();const cropCanvas=w.document.getElementById('cover-canvas'),cropImage=w.document.getElementById('cover-crop-preview');Object.defineProperty(cropImage,'naturalWidth',{value:1600});Object.defineProperty(cropImage,'naturalHeight',{value:900});cropCanvas.getBoundingClientRect=()=>({width:1440,height:320});cropCanvas.dispatchEvent(new w.MouseEvent('pointerdown',{button:0,clientX:0,clientY:0}));cropCanvas.dispatchEvent(new w.MouseEvent('pointermove',{clientX:0,clientY:348}));cropCanvas.dispatchEvent(new w.MouseEvent('pointerup'));assert.equal(cropImage.style.objectPosition,'50% 0%');const cropY=w.document.getElementById('cover-y');cropY.value='10';cropY.dispatchEvent(new w.Event('input'));w.document.querySelector('[data-cover-mode="mobile"]').click();cropY.value='5';cropY.dispatchEvent(new w.Event('input'));w.document.getElementById('done-cover').click();w.document.getElementById('adjust-thumbnail').click();assert.equal(cropCanvas.dataset.mode,'thumbnail');assert.equal(cropCanvas.querySelector('.wave').hidden,true);assert.equal(w.document.getElementById('thumbnail-fit-control').hidden,false);const cropX=w.document.getElementById('cover-x');cropX.value='80';cropX.dispatchEvent(new w.Event('input'));cropY.value='30';cropY.dispatchEvent(new w.Event('input'));const fit=w.document.getElementById('thumbnail-fit');fit.value='contain';fit.dispatchEvent(new w.Event('change'));assert.equal(cropImage.style.objectFit,'contain');assert.equal(cropImage.style.objectPosition,'80% 30%');w.document.querySelector('[data-cover-mode="desktop"]').click();assert.equal(cropImage.style.objectPosition,'50% 10%');assert.equal(cropImage.style.objectFit,'cover');w.document.querySelector('[data-cover-mode="thumbnail"]').click();assert.equal(cropImage.style.objectFit,'contain');w.document.getElementById('done-cover').click();
   form.elements.namedItem('title').value='Editor destination';form.elements.namedItem('slug').value='editor-destination';w.document.getElementById('body').innerHTML='<p>Travel guide content.</p>';w.document.getElementById('save-draft').click();
   await new Promise(r=>setTimeout(r,0));assert.deepEqual(submitted.image_focus,{desktop:{x:50,y:10},mobile:{x:50,y:5},thumbnail:{x:80,y:30,fit:'contain'}});assert.deepEqual(submitted.categories,['Destination','Explore Batam']);assert.equal(submitted.destination_trips[0].location,'Editor test beach');assert.equal(Number(submitted.destination_trips[0].minutes),25);assert.equal(submitted.body,'<p>Travel guide content.</p>');
   assert.equal(w.document.getElementById('editor-view').hidden,true);assert.equal(w.document.getElementById('library').hidden,false);assert.match(w.document.getElementById('notice').textContent,/Draft berhasil/);assert.match(w.document.getElementById('articles').textContent,/Editor destination/);
   w.document.getElementById('articles').querySelector('button').click();assert.equal(w.document.getElementById('editor-view').hidden,false);w.document.getElementById('adjust-thumbnail').click();assert.equal(cropImage.style.objectFit,'contain');assert.equal(cropImage.style.objectPosition,'80% 30%');w.document.getElementById('done-cover').click();
   setCategories(['Informasi BCIFT']);assert.equal(w.document.getElementById('destination-panel').hidden,true);assert.equal(w.document.querySelector('.destination-row').disabled,true);
   setCategories(['Destination','Explore Batam']);w.document.querySelector('.remove-destination').click();assert.equal(w.document.querySelectorAll('.destination-row').length,0);
   w.document.getElementById('publish').click();await new Promise(r=>setTimeout(r,0));assert.equal(submitted.status,'published');assert.equal(w.document.getElementById('editor-view').hidden,true);assert.equal(w.document.getElementById('library').hidden,false);assert.match(w.document.getElementById('notice').textContent,/Artikel diterbitkan/);
   w.document.getElementById('articles').querySelector('button').click();failSave=true;form.elements.namedItem('title').value='Keep this unsaved change';w.document.getElementById('publish').click();await new Promise(r=>setTimeout(r,0));assert.equal(w.document.getElementById('editor-view').hidden,false);assert.equal(form.elements.namedItem('title').value,'Keep this unsaved change');assert.match(w.document.getElementById('notice').textContent,/Test save failure/);
   failSave=false;delaySave=true;w.document.getElementById('publish').click();
   for(const id of ['back','new','delete','logout','analytics-menu'])assert.equal(get(id).disabled,true);
   get('back').click();get('new').click();get('articles').querySelector('button').click();
   // Guard handlers too, including opening a different article from a stale list.
   get('back').onclick();get('new').onclick();
   assert.equal(get('editor-view').hidden,false);assert.equal(form.elements.namedItem('title').value,'Keep this unsaved change');
   form.elements.namedItem('title').value='Typed while saving';finishSave();await new Promise(r=>setTimeout(r,0));assert.equal(w.document.getElementById('editor-view').hidden,false);assert.equal(form.elements.namedItem('title').value,'Typed while saving');assert.match(w.document.getElementById('save-state').textContent,/belum disimpan/);
   for(const id of ['back','new','delete','logout','analytics-menu'])assert.equal(get(id).disabled,false);
   delaySave=false;get('back').click();get('new').click();get('title').value='Article B';get('title').dispatchEvent(new w.Event('input',{bubbles:true}));get('save-draft').click();await new Promise(r=>setTimeout(r,0));assert.equal(submitted.title,'Article B');assert.equal(submitted.id,undefined);
  }finally{dom.window.close();}

  const teamDom=new JSDOM(editorHtml,{url:origin+'/blog/admin/',runScripts:'outside-only'});let createdFromForm=null;
  try{
   const w=teamDom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};const members=[{id:1,email:'owner@example.com',role:'admin',active:true,managed:false},{id:2,email:'fixed@example.com',role:'admin',active:true,managed:true}];
   w.cmsFetch=async(url,options={})=>{if(url.endsWith('/team/create/')){createdFromForm=JSON.parse(options.body);const account={id:3,email:createdFromForm.email,role:createdFromForm.role,active:true,managed:false};members.push(account);return Response.json(account,{status:201});}if(url.endsWith('/team/'))return Response.json({members,invitations:[]});if(url.endsWith('/session/'))return Response.json({user:{id:1}});if(url.endsWith('/audit/'))return Response.json([]);throw Error('Unexpected team request');};
   w.eval(stripTypeScriptTypes(readFileSync('src/scripts/team.ts','utf8').replace(/^import .*;\r?$/gm,'')));w.document.dispatchEvent(new w.CustomEvent('studio:view',{detail:{view:'team'}}));await new Promise(r=>setTimeout(r,0));
   const form=w.document.getElementById('create-account');assert.equal(form.elements.namedItem('role').value,'editor');assert.equal(form.elements.namedItem('role').options.length,2);
   form.elements.namedItem('email').value='new-writer@example.com';form.elements.namedItem('password').value=password;form.elements.namedItem('confirmation').value='Wrong-confirmation';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(createdFromForm,null);
   form.elements.namedItem('confirmation').value=password;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(createdFromForm.role,'editor');assert.equal(createdFromForm.email,'new-writer@example.com');assert.equal(form.elements.namedItem('password').value,'');assert.equal(form.elements.namedItem('confirmation').value,'');assert.match(w.document.getElementById('create-account-notice').textContent,/berhasil dibuat/);assert.match(w.document.getElementById('members').textContent,/new-writer@example.com/);assert.match(w.document.getElementById('members').textContent,/fixed@example.com/);assert.match(w.document.getElementById('members').textContent,/Editorial\/Penulis/);
  }finally{teamDom.window.close();}

  const dynamicTunnel='https://new-preview-4321.asse.devtunnels.ms';const dynamic=await call('login','POST',{email:'owner@example.com',password},'',dynamicTunnel);assert.equal(dynamic.status,200,await dynamic.clone().text());assert.match(dynamic.headers.get('set-cookie'),/Secure/i);
  const rejected=await fetch(origin+'/blog/admin/api/login/',{method:'POST',headers:{Origin:dynamicTunnel,Cookie:csrfCookie,'Content-Type':'application/json','X-BCIFT-CSRF':'invalid'},body:JSON.stringify({email:'owner@example.com',password})});assert.equal(rejected.status,403);
  const tunnelLogin=await ownerLogin(tunnel);assert.match(tunnelLogin.headers.get('set-cookie'),/Secure/i);
  assert.equal((await call('setup','POST',{email:'other@example.com',password},'',tunnel)).status,403);
  assert.equal((await call('setup','POST',{email:'other@example.com',password})).status,403);
  assert.equal((await call('setup')).status,403);
  assert.equal((await call('team/invite','POST',{email:'outsider@example.com',role:'admin'},adminCookie)).status,403);
  assert.equal(cms.db.prepare('SELECT id FROM admins WHERE email=?').get('outsider@example.com'),undefined);
  const previousMembers=cms.db.prepare('SELECT id,email,password,role,active,managed_hash FROM admins ORDER BY id').all();
  assert.equal((await call('team/create','POST',{email:'anonymous@example.com',password,confirmation:password,role:'admin'})).status,401);
  const malformed=[{email:'bad-email',password,confirmation:password,role:'editor'},{email:'bad-role@example.com',password,confirmation:password,role:'owner'},{email:'short@example.com',password:'short',confirmation:'short',role:'editor'},{email:'mismatch@example.com',password,confirmation:'different-password',role:'editor'}];
  const countBefore=cms.db.prepare('SELECT count(*) AS count FROM admins').get().count;
  for(const data of malformed)assert.equal((await call('team/create','POST',data,adminCookie)).status,400);
  assert.equal(cms.db.prepare('SELECT count(*) AS count FROM admins').get().count,countBefore);
  const staleKey=createHash('sha256').update(adminCookie.split('=')[1]).digest('hex');cms.db.prepare('UPDATE sessions SET verified_at=? WHERE token=?').run(Date.now()-16*60000,staleKey);
  assert.equal((await call('team/create','POST',{email:'stale@example.com',password,confirmation:password,role:'admin'},adminCookie)).status,403);cms.db.prepare('UPDATE sessions SET verified_at=? WHERE token=?').run(Date.now(),staleKey);
  const createResponse=await call('team/create','POST',{email:'WRITER@example.com',password,confirmation:password,role:'editor'},adminCookie);assert.equal(createResponse.status,201,await createResponse.clone().text());const created=await createResponse.json();assert.equal(created.role,'editor');assert.equal(created.email,'writer@example.com');assert.equal(created.password,undefined);assert.equal(created.passwordHash,undefined);
  assert.ok(cms.db.prepare('SELECT password FROM admins WHERE id=?').get(created.id).password!==password);
  const adminResponse=await call('team/create','POST',{email:'new-admin@example.com',password,confirmation:password,role:'admin'},adminCookie);assert.equal(adminResponse.status,201);assert.equal((await adminResponse.json()).role,'admin');
  const newAdminLogin=await call('login','POST',{email:'new-admin@example.com',password});assert.equal(newAdminLogin.status,200);assert.equal((await call('team','GET',null,cookieOf(newAdminLogin))).status,200);
  for(const existing of previousMembers){assert.deepEqual(cms.db.prepare('SELECT id,email,password,role,active,managed_hash FROM admins WHERE id=?').get(existing.id),existing);assert.equal((await call('team/create','POST',{email:existing.email,password:'Replacement-password!',confirmation:'Replacement-password!',role:'editor'},adminCookie)).status,400);assert.deepEqual(cms.db.prepare('SELECT id,email,password,role,active,managed_hash FROM admins WHERE id=?').get(existing.id),existing);}
  assert.equal(cms.db.prepare('SELECT actor FROM audit WHERE event=? AND subject=?').get('account.created','writer@example.com').actor,previousMembers.find(m=>m.email==='owner@example.com').id);
  const createAudit=JSON.stringify(cms.db.prepare("SELECT * FROM audit WHERE event='account.created'").all());assert.equal(createAudit.includes(password),false);

  assert.throws(()=>cms.createAccount('WRITER@example.com',password,'admin'),/sudah/);
  const accepted=await call('login','POST',{email:'writer@example.com',password});assert.equal(accepted.status,200);
  const writerCookie=cookieOf(accepted);assert.equal((await call('articles','GET',null,writerCookie)).status,200);
  assert.equal((await call('mfa/enroll','POST',{},writerCookie)).status,404);assert.equal((await call('mfa/verify','POST',{code:'123456'},writerCookie)).status,404);
  assert.equal((await call('team','GET',null,writerCookie)).status,403);assert.equal((await call('analytics','GET',null,writerCookie)).status,403);assert.equal((await call('homepage','GET',null,writerCookie)).status,403);assert.equal((await call('homepage','POST',{mode:'automatic'},writerCookie)).status,403);assert.equal((await call('team/create','POST',{email:'escalate@example.com',password,confirmation:password,role:'admin'},writerCookie)).status,403);assert.equal(cms.db.prepare('SELECT id FROM admins WHERE email=?').get('escalate@example.com'),undefined);assert.equal((await call('team/invite','POST',{email:'intruder@example.com'},writerCookie)).status,403);
  let r=await call('articles','POST',{title:'Dashboard test article',category:'Informasi Terminal',body:'<h2>Before boarding</h2><p>A complete article with enough useful content for this publishing workflow test.</p>',status:'draft'},writerCookie);assert.equal(r.status,200,await r.clone().text());let article=await r.json();assert.equal(article.category,'Informasi Terminal');
  assert.equal((await fetch(origin+'/blog/'+article.slug+'/')).status,404);assert.equal((await fetch(origin+'/blog/'+article.slug+'/?preview=1')).status,404);
  const preview=await fetch(origin+'/blog/'+article.slug+'/?preview=1',{headers:{Cookie:writerCookie}});assert.equal(preview.status,200);const previewHtml=await preview.text();assert.match(previewHtml,/noindex/);const previewDoc=new JSDOM(previewHtml);assert.equal(previewDoc.window.document.querySelector('meta[name="bcift-article-stat"]'),null);previewDoc.window.close();
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
  const eventDoc=new JSDOM(pageHtml),listDoc=new JSDOM(listing);const statToken=eventDoc.window.document.querySelector('meta[name="bcift-article-stat"]').content;const clickToken=listDoc.window.document.querySelector('#stories a[href="/blog/'+article.slug+'/"]').dataset.statClick;eventDoc.window.close();listDoc.window.close();
  const track=(token,event,extra={})=>fetch(origin+'/blog/events/',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'Mozilla/5.0 Reader','Sec-Fetch-Site':'same-origin',...extra},body:JSON.stringify({token,event})});
  assert.equal((await track(statToken,'view')).status,204);assert.equal((await track(statToken,'view')).status,204);assert.equal((await track(clickToken,'click')).status,204);assert.equal((await track('invalid','view')).status,400);assert.equal((await track(clickToken,'click',{'Sec-Fetch-Site':'cross-site'})).status,403);assert.equal((await track(statToken,'view',{Cookie:adminCookie})).status,204);
  cms.db.prepare("UPDATE analytics_receipts SET recorded_at=recorded_at-16000 WHERE event='view'").run();assert.equal((await track(statToken,'read')).status,204);
  const home=await call('homepage','GET',null,adminCookie);assert.equal(home.status,200);assert.ok((await home.json()).available.some(p=>p.slug===article.slug));const homeSave=await call('homepage','POST',{mode:'automatic'},adminCookie);assert.equal(homeSave.status,200);const feedResponse=await fetch(origin+'/blog/featured/');assert.equal(feedResponse.status,200);assert.equal(feedResponse.headers.get('cache-control'),'no-store');const feed=await feedResponse.json();assert.ok(feed.articles.length<=3);assert.ok(feed.articles.some(p=>p.slug===article.slug));assert.equal(feed.articles[0].body,undefined);
  const summary=await(await call('analytics','GET',null,adminCookie)).json();assert.deepEqual(summary.totals,{views:1,clicks:1,reads:1});assert.equal(summary.series.length,7);assert.equal(summary.topArticles[0].title,article.title);assert.equal(summary.timezone,'Asia/Jakarta');assert.ok(editorHtml.includes('id="reader-analytics"'));
  const freshDoc=new JSDOM(await(await fetch(origin+'/blog/'+article.slug+'/')).text());const freshToken=freshDoc.window.document.querySelector('meta[name="bcift-article-stat"]').content;freshDoc.window.close();
  assert.equal((await track(freshToken,'view',{Cookie:adminCookie})).status,204);assert.equal((await track(freshToken,'view',{'User-Agent':'Googlebot'})).status,204);
  const freshHash=createHash('sha256').update(freshToken).digest('hex');assert.equal(cms.db.prepare('SELECT COUNT(*) AS count FROM analytics_receipts WHERE token=?').get(freshHash).count,0);assert.deepEqual((await(await call('analytics','GET',null,adminCookie)).json()).totals,summary.totals);
  assert.equal((await track(freshToken,'view')).status,204);assert.equal((await(await call('analytics','GET',null,adminCookie)).json()).totals.views,2);
  const tripPayload={image_focus:{desktop:{x:45,y:10},mobile:{x:75,y:5},thumbnail:{x:85,y:15,fit:'contain'}},title:'A destination with travel details',category:'Destination',categories:['Destination','Explore Batam'],description:'A destination guide',body:'<h2>Explore the destination</h2><p>Useful information for planning your visit to this destination.</p>',image,image_alt:'Destination cover',status:'published',destination_trips:[{location:'Sample destination',minutes:35,transport:'Mobil / taksi'}]};
  const tripResponse=await call('articles','POST',tripPayload,adminCookie);assert.equal(tripResponse.status,200,await tripResponse.clone().text());const tripArticle=await tripResponse.json();assert.deepEqual(tripArticle.categories,['Destination','Explore Batam']);assert.deepEqual(tripArticle.destination_trips,tripPayload.destination_trips);
  const tripsListed=await(await call('articles','GET',null,adminCookie)).json();assert.deepEqual(tripsListed.find(a=>a.id===tripArticle.id).destination_trips,tripPayload.destination_trips);
  const multiListing=await(await fetch(origin+'/blog/')).text();const listingDom=new JSDOM(multiListing);try{const card=listingDom.window.document.querySelector('#stories a[href="/blog/'+tripArticle.slug+'/"]');assert.ok(card);assert.equal(card.querySelector('img').style.objectPosition,'85% 15%');assert.equal(card.querySelector('img').style.objectFit,'contain');assert.ok(card.querySelector('.card-image-contain'));const assigned=JSON.parse(card.dataset.categories);for(const category of ['Destination','Explore Batam'])assert.equal(matchesCategory(assigned,category),true);assert.equal(listingDom.window.document.querySelectorAll('#stories a[href="/blog/'+tripArticle.slug+'/"]').length,1);assert.equal(listingDom.window.document.querySelectorAll('[data-filter="Explore Batam"]').length,1);}finally{listingDom.window.close();}
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
  const boundary=cms.saveArticle({title:'z'.repeat(99)+' b',description:'Long title regression',image:'/images/ferry.webp',image_alt:'Ferry',body:'<p>'+('Useful ferry travel information. '.repeat(3))+'</p>',status:'published'});
  try{
   for(const slug of [boundary.slug,'z'.repeat(99)+'-']){
    cms.db.prepare('UPDATE articles SET slug=? WHERE id=?').run(slug,boundary.id);
    const page=await fetch(origin+'/blog/'+slug+'/');assert.equal(page.status,200);assert.ok((await page.text()).includes('</html>'));
    const list=await fetch(origin+'/blog/');assert.equal(list.status,200);const html=await list.text();assert.ok(html.includes('href="/blog/'+slug+'/"'));assert.ok(html.includes('</html>'));
   }
  }finally{cms.db.prepare('DELETE FROM articles WHERE id=?').run(boundary.id);}
  await call('logout','POST',{},adminCookie);assert.equal((await call('articles','GET',null,adminCookie)).status,401);
 }finally{server.kill();if(server.exitCode===null)await once(server,'exit');}
});
test.after(()=>{cms.db.close();rmSync(dir,{recursive:true,force:true});});
