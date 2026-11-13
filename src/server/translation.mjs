import {cleanBody, readTranslation} from './cms.mjs';
import {languages, otherLanguage} from '../lib/blog-language.mjs';
import {deeplBaseUrl, deeplKey} from './deepl-settings.mjs';

export {deeplConfigured as translationConfigured} from './deepl-settings.mjs';

export async function generateTranslation(article, request = fetch) {
 const key = deeplKey();
 if (!key) throw new Error('Terjemahan otomatis belum dikonfigurasi di server.');
 const source = article.language;
 if (!languages.includes(source)) throw new Error('Pilih bahasa sumber artikel.');
 const target = otherLanguage(source);
 const fields = ['title','description','seoTitle','imageAlt'];
 const values = fields.map(field => String(article[field] ?? '').trim());
 const body = cleanBody(article.body ?? '');
 if (!values[0] || !values[1] || !body) throw new Error('Isi judul, ringkasan, dan artikel sebelum menerjemahkan.');
 if ([...body].length + values.join('').length > 25_000) throw new Error('Artikel terlalu panjang untuk diterjemahkan sekaligus.');

 async function translate(text, html = false) {
  const payload = {
   text, source_lang:source.toUpperCase(), target_lang:target === 'en' ? 'EN-GB' : 'ID',
   ...(html ? {tag_handling:'html'} : {}),
  };
  let response;
  try {
   response = await request(deeplBaseUrl + '/v2/translate',{
    method:'POST', headers:{'Content-Type':'application/json',Authorization:'DeepL-Auth-Key ' + key},
    body:JSON.stringify(payload), redirect:'error', signal:AbortSignal.timeout(20_000)
   });
  } catch { throw new Error('Layanan terjemahan tidak dapat dijangkau. Coba lagi.'); }
  if (response.status === 456) throw new Error('Kuota DeepL sudah habis. Terjemahan masih bisa diisi manual.');
  if (response.status === 429) throw new Error('DeepL sedang membatasi permintaan. Coba lagi sebentar.');
  if (!response.ok) throw new Error('Layanan terjemahan gagal. Periksa API key DeepL atau coba lagi.');
  const data = await response.json();
  const results = data.translations?.map(item => item.text);
  if (results?.length !== text.length || results.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Hasil terjemahan tidak lengkap. Coba lagi.');
  return results;
 }
 const inputs = values.filter(Boolean);
 const [translated, [translatedBody]] = await Promise.all([translate(inputs),translate([body],true)]);
 const result = {body:translatedBody,published:false};
 fields.forEach((field,index) => {result[field] = values[index] ? translated.shift() : '';});
 return readTranslation(result);
}
