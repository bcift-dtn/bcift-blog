import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {preferredLanguage} from '../src/lib/blog-language.mjs';

const dataDir=mkdtempSync(join(tmpdir(),'bcift-language-'));
process.env.CMS_DATA_DIR=dataDir;
const {db,saveArticle,asPost}=await import('../src/server/cms.mjs');
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

test('machine translation requests both formats and creates an unpublished draft',async()=>{
 const prior=process.env.CMS_GOOGLE_TRANSLATE_KEY;
 process.env.CMS_GOOGLE_TRANSLATE_KEY='test-key';
 try{
  const formats=[];
  const result=await generateTranslation({language:'en',title:'Ferry travel',description:'Tips for travellers.',body:'<p>Read this guide.</p>'},async(url,init)=>{
   const request=JSON.parse(init.body);
   formats.push(request.format);
   assert.equal(url,'https://translation.googleapis.com/language/translate/v2');
   assert.equal(request.source,'en');
   assert.equal(request.target,'id');
   const translations=(request.format==='html'?['<p>Baca panduan ini.</p>']:['Perjalanan feri','Tips untuk pelancong.']).map(translatedText=>({translatedText}));
   return Response.json({data:{translations}});
  });
  assert.deepEqual(formats.sort(),['html','text']);
  assert.equal(result.title,'Perjalanan feri');
  assert.equal(result.body,'<p>Baca panduan ini.</p>');
  assert.equal(result.published,false);
 }finally{
  if(prior===undefined)delete process.env.CMS_GOOGLE_TRANSLATE_KEY;
  else process.env.CMS_GOOGLE_TRANSLATE_KEY=prior;
 }
});
