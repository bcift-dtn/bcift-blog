import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {preferredLanguage} from '../src/lib/blog-language.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'bcift-language-'));
process.env.CMS_DATA_DIR=dataDir;
const {db,saveArticle,asPost,createAccount}=await import('../src/server/cms.mjs');
const {saveDeeplSettings,deeplConfigured,deeplKey}=await import('../src/server/deepl-settings.mjs');
const {generateTranslation}=await import('../src/server/translation.mjs');
test.after(()=>{db.close();rmSync(dataDir,{recursive:true,force:true});});

test('browser language suggestion respects the saved choice and region codes',()=>{
 assert.equal(preferredLanguage('id',['en-GB']),'id');
 assert.equal(preferredLanguage(null,['fr-FR','en-SG','id-ID']),'en');
 assert.equal(preferredLanguage(null,['id-ID']),'id');
 assert.equal(preferredLanguage(null,['fr-FR']),undefined);
});

test('translations stay independent from source content and use sanitized HTML',()=>{
 const original=saveArticle({title:'Perjalanan Batam',category:'Travel Guide',body:'<p>Isi sumber.</p>'});
 const translated=saveArticle({...original,translation:{title:'Visiting Batam',description:'Plan a visit to Batam.',body:'<p>A guide to travelling through Batam Center by ferry.</p><script>alert(1)</script>',published:true}},original.id);
 assert.equal(translated.language,'id');
 assert.equal(translated.slug,original.slug);
 assert.equal(translated.body,original.body);
 assert.equal(translated.translation.published,true);
 assert.doesNotMatch(translated.translation.body,/script|alert/);
 assert.equal(asPost(translated).translation.title,'Visiting Batam');
 assert.throws(()=>saveArticle({...translated,translation:{published:true}},original.id),/Lengkapi/);
});

test('DeepL settings require admin access and a PIN for replacement',async()=>{
 const admin=createAccount('owner@example.com','test-password-12345','admin');
 const initial={apiKey:'test-key-developer-initial',pin:'104872',pinConfirmation:'104872'};
 const validate=async(url,init)=>{
  assert.equal(url,'https://api-free.deepl.com/v2/usage');
  assert.match(init.headers.Authorization,/^DeepL-Auth-Key test-key-developer-/);
  return Response.json({character_count:0,character_limit:1000000});
 };
 assert.equal(deeplConfigured(),false);
 await assert.rejects(saveDeeplSettings({...admin,role:'editor'},initial,validate),/Hanya admin/);
 await assert.rejects(saveDeeplSettings(admin,initial,async()=>new Response(null,{status:403})),/DeepL menolak/);
 assert.equal(deeplConfigured(),false);
 await assert.rejects(saveDeeplSettings(admin,{...initial,pinConfirmation:'000000'},validate),/Konfirmasi/);
 assert.deepEqual(await saveDeeplSettings(admin,initial,validate),{configured:true});
 const row=db.prepare('SELECT * FROM deepl_settings').get();
 assert.ok(!JSON.stringify(row).includes(initial.apiKey));
 assert.ok(!JSON.stringify(row).includes(initial.pin) || row.pin_hash!==initial.pin);
 await assert.rejects(saveDeeplSettings(admin,{...initial,pin:'999999'},()=>assert.fail('Invalid PIN must not call DeepL')),/PIN salah/);
 const replacement={apiKey:'test-key-developer-replacement',pin:initial.pin};
 assert.deepEqual(await saveDeeplSettings(admin,replacement,validate),{configured:true});
 assert.equal(deeplKey(),replacement.apiKey);
 for(let i=0;i<4;i++)await assert.rejects(saveDeeplSettings(admin,{...replacement,pin:'999999'},validate),/PIN salah/);
 await assert.rejects(saveDeeplSettings(admin,{...replacement,pin:'999999'},validate),/15 menit/);
 await assert.rejects(saveDeeplSettings(admin,replacement,validate),/15 menit/);
 assert.equal(deeplKey(),replacement.apiKey);
});

test('DeepL translates article HTML separately and returns an unpublished draft',async()=>{
 const formats=[];
 const article={language:'en',title:'Ferry travel',description:'Tips for travellers.',body:'<p>Read this guide.</p>'};
 const result=await generateTranslation(article,async(url,init)=>{
  const request=JSON.parse(init.body);
  formats.push(request.tag_handling??'text');
  assert.equal(url,'https://api-free.deepl.com/v2/translate');
  assert.equal(init.headers.Authorization,'DeepL-Auth-Key '+deeplKey());
  assert.equal(request.source_lang,'EN');
  assert.equal(request.target_lang,'ID');
  const translations=(request.tag_handling?['<p>Baca panduan ini.</p>']:['Perjalanan feri','Tips untuk pelancong.']).map(text=>({text}));
  return Response.json({translations});
 });
 assert.deepEqual(formats.sort(),['html','text']);
 assert.equal(result.title,'Perjalanan feri');
 assert.equal(result.body,'<p>Baca panduan ini.</p>');
 assert.equal(result.published,false);
 await assert.rejects(generateTranslation(article,async()=>new Response(null,{status:456})),/Kuota DeepL sudah habis/);
});
