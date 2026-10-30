import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {initHomepageDashboard} from '../src/scripts/homepage-dashboard.mjs';
const dir=mkdtempSync(join(tmpdir(),'bcift-homepage-'));process.env.CMS_DATA_DIR=dir;
const {db,createAccount}=await import('../src/server/cms.mjs');
const {homepageSettings,saveHomepage,selectHomepage}=await import('../src/server/homepage.mjs');
const actor=createAccount('owner@example.com','Test-password-long','admin');
const post=(id,day,draft=false)=>({id,data:{draft,publishedAt:new Date('2026-10-'+day+'T00:00:00Z')}});
const published=[post('old',20),post('new',28),post('middle',25),post('other',24)];
test('homepage defaults to three latest published articles',()=>{assert.deepEqual(homepageSettings(),{mode:'automatic',slugs:[]});assert.deepEqual(selectHomepage(homepageSettings(),[...published,post('draft',29,true)]).map(p=>p.id),['new','middle','other']);});
test('manual picks persist in order, then fall back when unpublished or removed',()=>{saveHomepage(actor,{mode:'manual',slugs:['old','other','new']},published);assert.deepEqual(selectHomepage(homepageSettings(),published).map(p=>p.id),['old','other','new']);assert.deepEqual(selectHomepage(homepageSettings(),published.filter(p=>p.id!=='other')).map(p=>p.id),['old','new','middle']);assert.deepEqual(selectHomepage(homepageSettings(),[]),[]);});
test('invalid or unauthorized changes preserve existing settings',()=>{const before=homepageSettings();for(const input of [{mode:'invalid'},{mode:'manual',slugs:['old','old','new']},{mode:'manual',slugs:['old','draft','new']},{mode:'manual',slugs:[]}])assert.throws(()=>saveHomepage(actor,input,published));assert.throws(()=>saveHomepage({role:'editor'}, {mode:'automatic'},published));assert.deepEqual(homepageSettings(),before);});
test('automatic mode switches back to latest, and supports fewer than three articles',()=>{saveHomepage(actor,{mode:'automatic'},published);assert.equal(homepageSettings().mode,'automatic');assert.deepEqual(selectHomepage(homepageSettings(),[...published,post('newest',29)]).map(p=>p.id),['newest','new','middle']);saveHomepage(actor,{mode:'manual',slugs:['old']},[published[0]]);assert.deepEqual(selectHomepage(homepageSettings(),[published[0]]).map(p=>p.id),['old']);});
test('dashboard loads on demand, previews order and saves the selected mode',async()=>{
 const source=readFileSync('src/components/admin/HomepagePanel.astro','utf8').split('<script')[0],start=source.indexOf('{[1,2,3]'),end=source.indexOf('</div>',start);const html=source.slice(0,start)+'<select data-homepage-slot></select><select data-homepage-slot></select><select data-homepage-slot></select>'+source.slice(end);
 const dom=new JSDOM(html);try{const doc=dom.window.document;let payload,calls=0;const available=published.map(p=>({slug:p.id,title:p.id,category:'Destination',thumbnail:{fit:'cover',x:50,y:50}}));initHomepageDashboard(doc,{fetcher:async(url,options)=>{calls++;if(options)payload=JSON.parse(options.body);return Response.json({settings:payload||{mode:'automatic',slugs:[]},available,articles:[]});}});assert.equal(calls,0);doc.dispatchEvent(new dom.window.CustomEvent('studio:view',{detail:{view:'homepage'}}));await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);const manual=doc.querySelector('[value="manual"]');manual.checked=true;manual.dispatchEvent(new dom.window.Event('change',{bubbles:true}));const slots=[...doc.querySelectorAll('[data-homepage-slot]')];slots.forEach((s,i)=>s.value=['old','other','new'][i]);slots[0].dispatchEvent(new dom.window.Event('change',{bubbles:true}));assert.equal(doc.querySelector('#homepage-preview h3').textContent,'old');doc.getElementById('homepage-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.deepEqual(payload,{mode:'manual',slugs:['old','other','new']});assert.match(doc.getElementById('homepage-status').textContent,/berhasil/);}finally{dom.window.close();}
});
test.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
